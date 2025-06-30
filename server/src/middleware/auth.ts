import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import { AccessTokenPayload, SafeUser } from '../types/index';
import { AuthService } from '../services/AuthService';
import { getErrorMessage } from '../utils/errorUtils';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      requestId?: string;
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;
  private jwtSecret: string;

  constructor() {
    this.authService = new AuthService();
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
  }

  // Main authentication middleware
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate request ID for tracking
      req.requestId = this.generateRequestId();

      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'No valid authorization token provided',
          requestId: req.requestId
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify and decode JWT
      let decoded: AccessTokenPayload;
      try {
        decoded = jwt.verify(token, this.jwtSecret) as AccessTokenPayload;
      } catch (jwtError) {
        winston.warn('Invalid JWT token:', {
          error: jwtError,
          requestId: req.requestId,
          ip: req.ip
        });

        res.status(401).json({
          error: 'Invalid token',
          message: 'The provided token is invalid or expired',
          requestId: req.requestId
        });
      }

      // Validate token type
      if (decoded.type !== 'access') {
        res.status(401).json({
          error: 'Invalid token type',
          message: 'Expected access token',
          requestId: req.requestId
        });
      }

      // Get user data from database
      const userResult = await this.authService.getUserById(decoded.userId);
      if (!userResult.success) {
        res.status(401).json({
          error: 'User not found',
          message: 'The user associated with this token no longer exists',
          requestId: req.requestId
        });
      }

      // Attach user to request object
      req.user = userResult.data;

      winston.info('User authenticated successfully', {
        userId: req.user.id,
        email: req.user.email,
        requestId: req.requestId,
        endpoint: req.path
      });

      next();

    } catch (error) {
      winston.error('Authentication middleware error: ', {
        error: error,
        requestId: req.requestId,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Authentication error',
        message: 'An error occurred during authentication',
        requestId: req.requestId
      });
    }
  };

  // Optional authentication (doesn't fail if no token)
  optionalAuthenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => { const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      next(); }
    }

    // If token is provided, validate it
    await this.authenticate(req, res, next);
  };

  // Middleware to check if user is verified
  requireVerified = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated',
        requestId: req.requestId
      });
    }

    if (!req.user.email_verified) {
      res.status(403).json({
        error: 'Email verification required',
        message: 'Please verify your email address before accessing this resource',
        requestId: req.requestId
      });
    }

    next();
  };

  // Rate limiting middleware for authentication endpoints
  createAuthRateLimit = () => {
    const attempts = new Map<string, { count: number; resetTime: number }>();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;

    return (req: Request, res: Response, next: NextFunction): void => {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      
      // Clean up expired entries
      for (const [key, value] of attempts.entries()) {
        if (now > value.resetTime) {
          attempts.delete(key);
        }
      }

      const clientAttempts = attempts.get(clientId);
      
      if (clientAttempts && clientAttempts.count >= maxAttempts) {
        const timeRemaining = Math.ceil((clientAttempts.resetTime - now) / 1000 / 60);
        
        res.status(429).json({
          error: 'Too many attempts',
          message: `Too many authentication attempts. Try again in ${timeRemaining} minutes.`,
          requestId: req.requestId,
          retryAfter: timeRemaining * 60
        });`
      }

      // Record this attempt
      if (clientAttempts) {
        clientAttempts.count++;
      } else {
        attempts.set(clientId, {
          count: 1,
          resetTime: now + windowMs
        });
      }

      next();
    };
  };

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

// Export middleware functions
export const authenticate = authMiddleware.authenticate;
export const optionalAuthenticate = authMiddleware.optionalAuthenticate;
export const requireVerified = authMiddleware.requireVerified;
export const authRateLimit = authMiddleware.createAuthRateLimit();

export default authMiddleware;