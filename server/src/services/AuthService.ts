import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import winston from 'winston';
import { 
  User, 
  SafeUser, 
  AccessTokenPayload, 
  RefreshTokenPayload,
  AuthResponse,
  RefreshResponse,
  AsyncServiceResult,
  sanitizeUser,
  isValidEmail
} from '../types/index';
import { getDatabase, getRedis } from '@config/database';
import { getErrorMessage } from '../utils/errorUtils';

export class AuthService {
  private db: Pool;
  private redis: Redis;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private jwtExpiry: string;
  private jwtRefreshExpiry: string;

  constructor() {
    this.db = getDatabase();
    this.redis = getRedis();
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.jwtExpiry = process.env.JWT_EXPIRY || '15m';
    this.jwtRefreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';

    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      winston.warn('JWT secrets not properly configured in environment variables');
    }
  }

  // User Registration
  async register(email: string, username: string, password: string): AsyncServiceResult<SafeUser> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Check for existing user (case-insensitive)
      const existingUser = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'User with this email or username already exists'
        };
      }

      // Hash password with Argon2id
      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 4,
      });

      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

      // Create user
      const result = await client.query(
        `INSERT INTO users (email, username, password_hash, email_verification_token)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, username, email_verified, created_at, updated_at, last_login`,
        [email.toLowerCase(), username.toLowerCase(), passwordHash, emailVerificationToken]
      );

      await client.query('COMMIT');

      const user = result.rows[0] as SafeUser;
      
      // TODO: Send email verification (stubbed for now)
      winston.info(`Email verification token for ${email}: ${emailVerificationToken}`);

      winston.info(`User registered successfully: ${user.email}`, {
        userId: user.id,
        requestId: this.generateRequestId()
      });

      return {
        success: true,
        data: user
      };

    } catch (error) {
      await client.query('ROLLBACK');
      winston.error('User registration failed:', error);
      return {
        success: false,
        error: 'Registration failed',
        details: error
      };
    } finally {
      client.release();
    }
  }

  // User Login
  async login(emailOrUsername: string, password: string, clientIp: string): AsyncServiceResult<AuthResponse> {
    try {
      // Check rate limiting
      const rateLimitKey = `login_attempts:${clientIp}`;
      const attempts = await this.redis.get(rateLimitKey) || '0';
      
      if (parseInt(attempts) >= 5) {
        const ttl = await this.redis.ttl(rateLimitKey);
        return {
          success: false,
          error: `Too many login attempts. Try again in ${Math.ceil(ttl / 60)} minutes`
        };
      }

      // Find user by email or username
      const isEmail = isValidEmail(emailOrUsername);
      const query = isEmail 
        ? 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)'
        : 'SELECT * FROM users WHERE LOWER(username) = LOWER($1)';
      
      const result = await this.db.query(query, [emailOrUsername.toLowerCase()]);
      
      if (result.rows.length === 0) {
        // Increment rate limit even for non-existent users (timing attack prevention)
        await this.incrementLoginAttempts(clientIp);
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      const user = result.rows[0] as User;

      // Check if user is locked
      if (user.locked_until && new Date() < user.locked_until) {
        return {
          success: false,
          error: 'Account is temporarily locked due to multiple failed attempts'
        };
      }

      // Verify password (timing-safe)
      const isValidPassword = await this.verifyPassword(password, user.password_hash);
      
      if (!isValidPassword) {
        // Increment both rate limit and user failed attempts
        await Promise.all([
          this.incrementLoginAttempts(clientIp),
          this.incrementUserFailedAttempts(user.id)
        ]);
        
        return {
          success: false,
          error: 'Invalid credentials'
        };
      }

      // Reset failed attempts on successful login
      await this.resetUserFailedAttempts(user.id);
      await this.redis.del(rateLimitKey);

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token in Redis
      await this.storeRefreshToken(user.id, refreshToken);

      // Update last login
      await this.db.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      const safeUser = sanitizeUser(user);
      safeUser.last_login = new Date(); // Update the safe user object

      winston.info(`User logged in successfully: ${user.email}`, {
        userId: user.id,
        requestId: this.generateRequestId()
      });

      return {
        success: true,
        data: {
          user: safeUser,
          accessToken,
          refreshToken
        }
      };

    } catch (error) {
      winston.error('Login failed:', error);
      return {
        success: false,
        error: 'Login failed',
        details: error
      };
    }
  }

  // Token Refresh
  async refreshToken(refreshToken: string): AsyncServiceResult<RefreshResponse> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as RefreshTokenPayload;
      
      if (decoded.type !== 'refresh') {
        return {
          success: false,
          error: 'Invalid token type'
        };
      }

      // Check if refresh token exists in Redis
      const storedToken = await this.redis.get(`refresh:${decoded.userId}`);
      if (storedToken !== refreshToken) {
        return {
          success: false,
          error: 'Invalid refresh token'
        };
      }

      // Get user data
      const result = await this.db.query(
        'SELECT * FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const user = result.rows[0] as User;

      // Generate new access token
      const newAccessToken = this.generateAccessToken(user);

      winston.info(`Token refreshed for user: ${user.email}`, {
        userId: user.id,
        requestId: this.generateRequestId()
      });

      return {
        success: true,
        data: {
          accessToken: newAccessToken
        }
      };

    } catch (error) {
      winston.error('Token refresh failed:', error);
      return {
        success: false,
        error: 'Invalid refresh token'
      };
    }
  }

  // Logout
  async logout(userId: number): AsyncServiceResult<void> {
    try {
      // Remove refresh token from Redis
      await this.redis.del(`refresh:${userId}`);

      winston.info(`User logged out: ${userId}`, {
        userId,
        requestId: this.generateRequestId()
      });

      return {
        success: true,
        data: undefined
      };

    } catch (error) {
      winston.error('Logout failed:', error);
      return {
        success: false,
        error: 'Logout failed'
      };
    }
  }

  // Forgot Password
  async forgotPassword(email: string): AsyncServiceResult<void> {
    try {
      // Check if user exists
      const result = await this.db.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [email.toLowerCase()]
      );

      // Always return success to prevent email enumeration
      if (result.rows.length === 0) {
        winston.info(`Password reset requested for non-existent email: ${email}`);
        return {
          success: true,
          data: undefined
        };
      }

      const userId = result.rows[0].id;

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token in Redis
      await this.redis.setex(`reset:${email.toLowerCase()}`, 3600, JSON.stringify({
        token: resetToken,
        userId,
        expiry: resetExpiry.toISOString()
      }));

      // TODO: Send password reset email (stubbed for now)
      winston.info(`Password reset token for ${email}: ${resetToken}`);

      winston.info(`Password reset requested for: ${email}`, {
        userId,
        requestId: this.generateRequestId()
      });

      return {
        success: true,
        data: undefined
      };

    } catch (error) {
      winston.error('Forgot password failed:', error);
      return {
        success: false,
        error: 'Password reset request failed'
      };
    }
  }

  // Reset Password
  async resetPassword(token: string, newPassword: string): AsyncServiceResult<void> {
    try {
      // Find reset token in Redis
      const keys = await this.redis.keys('reset:*');
      let resetData = null;
      let email = null;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed.token === token) {
            resetData = parsed;
            email = key.replace('reset:', '');
            break;
          }
        }
      }

      if (!resetData) {
        return {
          success: false,
          error: 'Invalid or expired reset token'
        };
      }

      // Check if token is expired
      if (new Date() > new Date(resetData.expiry)) {
        await this.redis.del(`reset:${email}`);
        return {
          success: false,
          error: 'Reset token has expired'
        };
      }

      // Hash new password
      const passwordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      // Update password and clear failed attempts
      await this.db.query(
        `UPDATE users 
         SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL 
         WHERE id = $2`,
        [passwordHash, resetData.userId]
      );

      // Invalidate all sessions and refresh tokens
      await this.redis.del(`refresh:${resetData.userId}`);
      await this.redis.del(`reset:${email}`);

      winston.info(`Password reset successful for user: ${resetData.userId}`, {
        userId: resetData.userId,
        requestId: this.generateRequestId()
      });

      return {
        success: true,
        data: undefined
      };

    } catch (error) {
      winston.error('Reset password failed:', error);
      return {
        success: false,
        error: 'Password reset failed'
      };
    }
  }

  // Get user by ID
  async getUserById(userId: number): AsyncServiceResult<SafeUser> {
    try {
      const result = await this.db.query(
        'SELECT id, email, username, email_verified, created_at, updated_at, last_login FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        data: result.rows[0] as SafeUser
      };

    } catch (error) {
      winston.error('Get user by ID failed:', error);
      return {
        success: false,
        error: 'Failed to retrieve user'
      };
    }
  }

  // Verify JWT token
  async verifyAccessToken(token: string): AsyncServiceResult<AccessTokenPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as AccessTokenPayload;
      
      if (decoded.type !== 'access') {
        return {
          success: false,
          error: 'Invalid token type'
        };
      }

      return {
        success: true,
        data: decoded
      };

    } catch (error) {
      return {
        success: false,
        error: 'Invalid access token'
      };
    }
  }

  // Private helper methods
  private generateAccessToken(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      username: user.username,
      type: 'access'
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry
    });
  }

  private generateRefreshToken(user: User): string {
    const payload = {
      userId: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.jwtRefreshExpiry
    });
  }

  private async storeRefreshToken(userId: number, token: string): Promise<void> {
    const expiry = this.parseTimeToSeconds(this.jwtRefreshExpiry);
    await this.redis.setex(`refresh:${userId  return;
}`, expiry, token);
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      winston.error('Password verification error:', error);
      return false;
    }
  }

  private async incrementLoginAttempts(clientIp: string): Promise<void> {
    const key = `login_attempts:${clientIp  return;
}`;
    const ttl = 15 * 60; // 15 minutes
    await this.redis.incr(key);
    await this.redis.expire(key, ttl);
  }

  private async incrementUserFailedAttempts(userId: number): Promise<void> {
    const result = await this.db.query(
      'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1 RETURNING failed_login_attempts',
      [userId]
    );

    const failedAttempts = result.rows[0]?.failed_login_attempts || 0;

    // Lock account after 5 failed attempts for 15 minutes
    if (failedAttempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      await this.db.query(
        'UPDATE users SET locked_until = $1 WHERE id = $2',
        [lockUntil, userId]
      );
      return;
}
  }

  private async resetUserFailedAttempts(userId: number): Promise<void> {
    await this.db.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [userId]
    );
    return;
}

  private parseTimeToSeconds(timeString: string): number {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1));
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 3600; // Default to 1 hour
    }
  }

  private generateRequestId(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}