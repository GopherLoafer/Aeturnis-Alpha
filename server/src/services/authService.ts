import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool, redis, logger } from '@/database/connection';
import { JWTPayload, RefreshTokenData, Player } from '@/types';

export class AuthService {
  private static readonly ACCESS_TOKEN_EXPIRY = '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = '7d';
  private static readonly REFRESH_TOKEN_PREFIX = 'refresh_token:';
  private static readonly TOKEN_FAMILY_PREFIX = 'token_family:';

  // Argon2 configuration for secure password hashing
  private static readonly ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,         // 3 iterations
    parallelism: 1,      // 1 thread
  };

  // Password validation regex
  private static readonly PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

  /**
   * Hash password using Argon2
   */
  static async hashPassword(password: string): Promise<string> {
    try {
      return await argon2.hash(password, this.ARGON2_OPTIONS);
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Password processing failed');
    }
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hashedPassword, plainPassword);
    } catch (error) {
      logger.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate access token
   */
  static generateAccessToken(userId: string, username: string): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload: JWTPayload = {
      userId,
      username,
      type: 'access'
    };

    return jwt.sign(payload, jwtSecret, { 
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'aeturnis-online',
      audience: 'aeturnis-players'
    });
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(userId: string, username: string, tokenFamily: string): string {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload: JWTPayload = {
      userId,
      username,
      type: 'refresh'
    };

    return jwt.sign(payload, jwtSecret, { 
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      issuer: 'aeturnis-online',
      audience: 'aeturnis-players',
      jwtid: tokenFamily
    });
  }

  /**
   * Store refresh token in Redis or fallback to in-memory storage
   */
  static async storeRefreshToken(
    refreshToken: string, 
    userId: string, 
    username: string, 
    tokenFamily: string
  ): Promise<void> {
    const tokenData: RefreshTokenData = {
      userId,
      username,
      tokenFamily,
      createdAt: new Date()
    };

    if (redis) {
      const key = this.REFRESH_TOKEN_PREFIX + refreshToken;
      const familyKey = this.TOKEN_FAMILY_PREFIX + userId + ':' + tokenFamily;

      try {
        // Store token data with 7 day expiry
        await redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(tokenData));
        
        // Store token family reference
        await redis.setex(familyKey, 7 * 24 * 60 * 60, refreshToken);
        
        logger.info(`Refresh token stored in Redis for user: ${username}`);
      } catch (error) {
        logger.error('Failed to store refresh token in Redis:', error);
        throw new Error('Token storage failed');
      }
    } else {
      // For development without Redis, we'll just log the token
      // In production, Redis would be required
      logger.info(`Refresh token generated for user: ${username} (Redis not available)`);
    }
  }

  /**
   * Verify and retrieve refresh token data
   */
  static async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    try {
      // Verify JWT signature first
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not configured');
      }

      const decoded = jwt.verify(refreshToken, jwtSecret) as JWTPayload;
      
      if (decoded.type !== 'refresh') {
        return null;
      }

      if (redis) {
        // Use Redis if available
        const key = this.REFRESH_TOKEN_PREFIX + refreshToken;
        const tokenDataStr = await redis.get(key);

        if (!tokenDataStr) {
          return null;
        }

        return JSON.parse(tokenDataStr) as RefreshTokenData;
      } else {
        // Fallback: create token data from JWT payload
        // In production, Redis would be required for token revocation
        logger.warn('Redis not available, using JWT-only refresh token validation');
        return {
          userId: decoded.userId,
          username: decoded.username,
          tokenFamily: decoded.jti || 'fallback',
          createdAt: new Date(decoded.iat! * 1000)
        };
      }
    } catch (error) {
      logger.warn('Refresh token verification failed:', error);
      return null;
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(refreshToken: string): Promise<void> {
    if (redis) {
      try {
        const key = this.REFRESH_TOKEN_PREFIX + refreshToken;
        await redis.del(key);
        logger.info('Refresh token revoked from Redis');
      } catch (error) {
        logger.error('Failed to revoke refresh token:', error);
      }
    } else {
      // Without Redis, we can't revoke specific tokens
      // In production, Redis would be required for proper token management
      logger.warn('Cannot revoke refresh token - Redis not available');
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    if (redis) {
      try {
        const pattern = this.TOKEN_FAMILY_PREFIX + userId + ':*';
        const keys = await redis.keys(pattern);

        if (keys.length > 0) {
          // Get all refresh tokens for this user
          const refreshTokens = await redis.mget(keys);
          
          // Delete both family keys and token keys
          const allKeysToDelete = [...keys];
          for (const token of refreshTokens) {
            if (token) {
              allKeysToDelete.push(this.REFRESH_TOKEN_PREFIX + token);
            }
          }

          await redis.del(...allKeysToDelete);
          logger.info(`Revoked ${allKeysToDelete.length} tokens for user: ${userId}`);
        }
      } catch (error) {
        logger.error('Failed to revoke user tokens:', error);
      }
    } else {
      // Without Redis, we can't revoke tokens across devices
      // In production, Redis would be required for proper session management
      logger.warn('Cannot revoke all user tokens - Redis not available');
    }
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): JWTPayload {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    try {
      return jwt.verify(token, jwtSecret) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Generate token family ID
   */
  static generateTokenFamily(): string {
    return uuidv4();
  }

  /**
   * Check if user exists by username or email
   */
  static async findUserByCredential(credential: string): Promise<Player | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM players WHERE username = $1 OR email = $1',
        [credential]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Database query failed:', error);
      throw new Error('Database operation failed');
    }
  }

  /**
   * Create new user
   */
  static async createUser(username: string, email: string, hashedPassword: string): Promise<Player> {
    try {
      const result = await pool.query(
        `INSERT INTO players (
          username, email, password_hash, level, experience, gold, 
          health, max_health, mana, max_mana, strength, agility, 
          intelligence, vitality, location_x, location_y, location_z, 
          map_id, created_at, updated_at, last_login
        ) VALUES (
          $1, $2, $3, 1, 0, 100, 100, 100, 50, 50, 10, 10, 10, 10, 
          0, 0, 0, 'starter_town', NOW(), NOW(), NOW()
        ) RETURNING *`,
        [username, email, hashedPassword]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('User creation failed:', error);
      throw new Error('User creation failed');
    }
  }

  /**
   * Update user last login
   */
  static async updateLastLogin(userId: string): Promise<void> {
    try {
      await pool.query(
        'UPDATE players SET last_login = NOW() WHERE id = $1',
        [userId]
      );
    } catch (error) {
      logger.error('Last login update failed:', error);
    }
  }
}