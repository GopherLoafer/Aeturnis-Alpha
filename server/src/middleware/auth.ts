import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/services/authService';
import { AuthUser, APIResponse } from '@/types';
import { logger } from '@/database/connection';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware to authenticate JWT access tokens
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    } as APIResponse);
    return;
  }

  try {
    const decoded = AuthService.verifyToken(token);
    
    // Ensure this is an access token
    if (decoded.type !== 'access') {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid token type. Access token required.' 
      } as APIResponse);
      return;
    }

    req.user = {
      id: decoded.userId,
      username: decoded.username,
      email: '' // Will be populated from database if needed
    };
    
    next();
  } catch (error) {
    logger.warn('Invalid access token provided', { 
      token: token.substring(0, 10) + '...',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(403).json({ 
      success: false, 
      error: 'Invalid or expired access token' 
    } as APIResponse);
  }
};

/**
 * Middleware for optional authentication
 * Continues without error if no token provided
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = AuthService.verifyToken(token);
    
    // Only accept access tokens for optional auth
    if (decoded.type === 'access') {
      req.user = {
        id: decoded.userId,
        username: decoded.username,
        email: ''
      };
    }
  } catch (error) {
    // Continue without authentication
    logger.debug('Optional auth failed, continuing without user', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  next();
};

/**
 * Middleware specifically for refresh token endpoints
 */
export const authenticateRefreshToken = (req: Request, res: Response, next: NextFunction): void => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(401).json({ 
      success: false, 
      error: 'Refresh token required' 
    } as APIResponse);
    return;
  }

  try {
    const decoded = AuthService.verifyToken(refreshToken);
    
    // Ensure this is a refresh token
    if (decoded.type !== 'refresh') {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid token type. Refresh token required.' 
      } as APIResponse);
      return;
    }

    req.user = {
      id: decoded.userId,
      username: decoded.username,
      email: ''
    };
    
    next();
  } catch (error) {
    logger.warn('Invalid refresh token provided', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(403).json({ 
      success: false, 
      error: 'Invalid or expired refresh token' 
    } as APIResponse);
  }
};