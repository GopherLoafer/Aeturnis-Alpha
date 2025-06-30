import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWTPayload, AuthUser } from '@/types';
import { logger } from '@/database/connection';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      res.status(500).json({ 
        success: false, 
        error: 'Server configuration error' 
      });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      email: '' // Will be populated from database if needed
    };
    
    next();
  } catch (error) {
    logger.warn('Invalid token provided', { token: token.substring(0, 10) + '...' });
    res.status(403).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    next();
    return;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      next();
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      email: ''
    };
  } catch (error) {
    // Continue without authentication
    logger.debug('Optional auth failed, continuing without user');
  }
  
  next();
};