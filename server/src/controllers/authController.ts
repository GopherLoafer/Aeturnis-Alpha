import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '@/services/authService';
import { logger } from '@/database/connection';
import { APIResponse } from '@/types';

// Enhanced validation schemas
const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must not exceed 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string()
    .email('Invalid email format')
    .max(100, 'Email must not exceed 100 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
});

const loginSchema = z.object({
  credential: z.string()
    .min(3, 'Username or email required')
    .max(100, 'Credential too long'),
  password: z.string()
    .min(1, 'Password required')
    .max(128, 'Password too long')
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required')
});

/**
 * User Registration Controller
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input data
    const validatedData = registerSchema.parse(req.body);
    const { username, email, password } = validatedData;

    // Validate password strength
    const passwordValidation = AuthService.validatePassword(password);
    if (!passwordValidation.isValid) {
      res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        data: { 
          passwordErrors: passwordValidation.errors 
        }
      } as APIResponse);
      return;
    }

    // Check if user already exists
    const existingUser = await AuthService.findUserByCredential(username);
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: 'Username already exists'
      } as APIResponse);
      return;
    }

    const existingEmail = await AuthService.findUserByCredential(email);
    if (existingEmail) {
      res.status(409).json({
        success: false,
        error: 'Email already registered'
      } as APIResponse);
      return;
    }

    // Hash password with Argon2
    const hashedPassword = await AuthService.hashPassword(password);

    // Create new player
    const newPlayer = await AuthService.createUser(username, email, hashedPassword);

    // Generate tokens
    const tokenFamily = AuthService.generateTokenFamily();
    const accessToken = AuthService.generateAccessToken(newPlayer.id, newPlayer.username);
    const refreshToken = AuthService.generateRefreshToken(newPlayer.id, newPlayer.username, tokenFamily);

    // Store refresh token in Redis
    await AuthService.storeRefreshToken(refreshToken, newPlayer.id, newPlayer.username, tokenFamily);

    logger.info(`New player registered: ${username} (${newPlayer.id})`);

    res.status(201).json({
      success: true,
      data: {
        player: {
          id: newPlayer.id,
          username: newPlayer.username,
          email: newPlayer.email,
          level: newPlayer.level,
          gold: newPlayer.gold,
          createdAt: newPlayer.created_at
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900 // 15 minutes in seconds
        }
      },
      message: 'Registration successful'
    } as APIResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid input data',
        data: { 
          validationErrors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }
      } as APIResponse);
      return;
    }

    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    } as APIResponse);
  }
};

/**
 * User Login Controller
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input data
    const validatedData = loginSchema.parse(req.body);
    const { credential, password } = validatedData;

    // Find user by username or email
    const user = await AuthService.findUserByCredential(credential);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as APIResponse);
      return;
    }

    // Check if account is active
    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: 'Account is deactivated'
      } as APIResponse);
      return;
    }

    // Check if account is banned
    if (user.is_banned && (!user.ban_expires_at || new Date() < new Date(user.ban_expires_at))) {
      res.status(403).json({
        success: false,
        error: 'Account is banned',
        data: {
          banReason: user.ban_reason,
          banExpiresAt: user.ban_expires_at
        }
      } as APIResponse);
      return;
    }

    // Verify password
    const isValidPassword = await AuthService.verifyPassword(user.password_hash, password);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as APIResponse);
      return;
    }

    // Update last login
    await AuthService.updateLastLogin(user.id);

    // Generate tokens
    const tokenFamily = AuthService.generateTokenFamily();
    const accessToken = AuthService.generateAccessToken(user.id, user.username);
    const refreshToken = AuthService.generateRefreshToken(user.id, user.username, tokenFamily);

    // Store refresh token in Redis
    await AuthService.storeRefreshToken(refreshToken, user.id, user.username, tokenFamily);

    logger.info(`Player logged in: ${user.username} (${user.id})`);

    res.json({
      success: true,
      data: {
        player: {
          id: user.id,
          username: user.username,
          email: user.email,
          level: user.level,
          gold: user.gold,
          health: user.health,
          mana: user.mana,
          strength: user.strength,
          agility: user.agility,
          intelligence: user.intelligence,
          location: {
            x: user.location_x,
            y: user.location_y,
            z: user.location_z,
            mapId: user.map_id
          },
          lastLogin: user.last_login
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900 // 15 minutes in seconds
        }
      },
      message: 'Login successful'
    } as APIResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid input data',
        data: { 
          validationErrors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }
      } as APIResponse);
      return;
    }

    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    } as APIResponse);
  }
};

/**
 * Refresh Token Controller
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate input data
    const validatedData = refreshTokenSchema.parse(req.body);
    const { refreshToken: token } = validatedData;

    // Verify refresh token
    const tokenData = await AuthService.verifyRefreshToken(token);
    if (!tokenData) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      } as APIResponse);
      return;
    }

    // Get current user data
    const user = await AuthService.findUserByCredential(tokenData.username);
    if (!user || !user.is_active) {
      // Revoke the compromised token
      await AuthService.revokeRefreshToken(token);
      res.status(401).json({
        success: false,
        error: 'User account not found or inactive'
      } as APIResponse);
      return;
    }

    // Revoke old refresh token
    await AuthService.revokeRefreshToken(token);

    // Generate new tokens with new family ID
    const newTokenFamily = AuthService.generateTokenFamily();
    const newAccessToken = AuthService.generateAccessToken(user.id, user.username);
    const newRefreshToken = AuthService.generateRefreshToken(user.id, user.username, newTokenFamily);

    // Store new refresh token
    await AuthService.storeRefreshToken(newRefreshToken, user.id, user.username, newTokenFamily);

    logger.info(`Tokens refreshed for user: ${user.username} (${user.id})`);

    res.json({
      success: true,
      data: {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: 900 // 15 minutes in seconds
        }
      },
      message: 'Tokens refreshed successfully'
    } as APIResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid input data',
        data: { 
          validationErrors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }
      } as APIResponse);
      return;
    }

    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    } as APIResponse);
  }
};

/**
 * Logout Controller
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];
    
    const { refreshToken: token } = req.body;

    if (!accessToken && !token) {
      res.status(400).json({
        success: false,
        error: 'Access token or refresh token required'
      } as APIResponse);
      return;
    }

    let userId: string | null = null;

    // Try to get user ID from access token
    if (accessToken) {
      try {
        const decoded = AuthService.verifyToken(accessToken);
        userId = decoded.userId;
      } catch (error) {
        // Token might be expired, try refresh token
      }
    }

    // Try to get user ID from refresh token if access token failed
    if (!userId && token) {
      const tokenData = await AuthService.verifyRefreshToken(token);
      if (tokenData) {
        userId = tokenData.userId;
      }
    }

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Invalid tokens'
      } as APIResponse);
      return;
    }

    // Revoke specific refresh token if provided
    if (token) {
      await AuthService.revokeRefreshToken(token);
    }

    logger.info(`User logged out: ${userId}`);

    res.json({
      success: true,
      message: 'Logout successful'
    } as APIResponse);

  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    } as APIResponse);
  }
};

/**
 * Logout from all devices Controller
 */
export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];

    if (!accessToken) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      } as APIResponse);
      return;
    }

    // Verify access token to get user ID
    const decoded = AuthService.verifyToken(accessToken);
    if (decoded.type !== 'access') {
      res.status(401).json({
        success: false,
        error: 'Invalid token type'
      } as APIResponse);
      return;
    }

    // Revoke all refresh tokens for this user
    await AuthService.revokeAllUserTokens(decoded.userId);

    logger.info(`User logged out from all devices: ${decoded.userId}`);

    res.json({
      success: true,
      message: 'Logged out from all devices successfully'
    } as APIResponse);

  } catch (error) {
    logger.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout from all devices failed'
    } as APIResponse);
  }
};