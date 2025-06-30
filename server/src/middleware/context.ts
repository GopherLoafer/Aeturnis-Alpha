/**
 * Request Context and Performance Monitoring Middleware
 * Provides request tracking, performance monitoring, and context management
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, requestLogger, performanceLogger } from '../utils/logger';
import { config } from '../config/environment';
import { MaintenanceError, AuthenticationError } from './errorHandler';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Request context interface
 */
export interface RequestContext {
  requestId: string;
  timestamp: Date;
  startTime: number;
  userAgent?: string;
  ip: string;
  method: string;
  path: string;
  userId?: number;
  userRole?: string;
  apiKeyId?: string;
}

/**
 * Extend Request interface with context
 */
declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
      user?: {
        id: number;
        username: string;
        email: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}

/**
 * Request ID middleware
 * Generates unique request ID for tracking
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const existingId = req.headers['x-request-id'] as string;
  const requestId = existingId || uuidv4();
  
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

/**
 * Request context middleware
 * Creates comprehensive request context
 */
export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string;
  
  req.context = {
    requestId,
    timestamp: new Date(),
    startTime: Date.now(),
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    method: req.method,
    path: req.path,
  };
  
  // Add user context if available (set by auth middleware)
  if (req.user) {
    req.context.userId = req.user.id;
    req.context.userRole = req.user.role;
  }
  
  next();
};

/**
 * Performance monitoring middleware
 * Tracks response times and logs performance metrics
 */
export const performanceMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  
  // Use res.on('finish') instead of overriding res.end
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Log request details
    requestLogger(req, res, responseTime);
    
    // Log performance if enabled
    if (config.ENABLE_METRICS) {
      performanceLogger(`${req.method} ${req.path}`, responseTime, {
        statusCode: res.statusCode,
        requestId: req.context?.requestId,
        userId: req.context?.userId,
        contentLength: res.get('Content-Length'),
      });
    }
    
    // Set performance headers
    res.setHeader('X-Response-Time', `${responseTime}ms`);
  });
  
  next();
};

/**
 * API versioning middleware
 * Handles API version through headers and URL
 */
export const apiVersionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check for version in header
  const headerVersion = req.headers['api-version'] as string;
  
  // Check for version in URL path
  const urlVersionMatch = req.path.match(/^\/v(\d+)\//);
  const urlVersion = urlVersionMatch ? `v${urlVersionMatch[1]}` : null;
  
  // Default to v1 if no version specified
  const apiVersion = headerVersion || urlVersion || 'v1';
  
  // Validate version
  const supportedVersions = ['v1'];
  if (!supportedVersions.includes(apiVersion)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_API_VERSION',
        message: `API version ${apiVersion} is not supported`,
        supportedVersions,
      },
    });
    return;
  }
  
  // Add version to request
  req.headers['x-api-version'] = apiVersion;
  res.setHeader('X-API-Version', apiVersion);
  
  next();
};

/**
 * API key validation middleware
 * Validates API keys for external access
 */
export const apiKeyMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip API key validation for certain endpoints
  const skipPaths = ['/health', '/docs', '/api-docs'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  // Skip if user is already authenticated via JWT
  if (req.user) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    return next(); // Let JWT auth middleware handle if no API key
  }
  
  // In a real application, validate API key against database
  // For now, check against environment variable
  if (config.API_KEY_SECRET && apiKey !== config.API_KEY_SECRET) {
    const error = new AuthenticationError('Invalid API key', req.context?.requestId);
    return next(error);
  }
  
  // Add API key context
  if (req.context) {
    req.context.apiKeyId = apiKey;
  }
  
  next();
};

/**
 * Maintenance mode middleware
 * Blocks requests during maintenance with admin bypass
 */
export const maintenanceModeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!config.MAINTENANCE_MODE) {
    return next();
  }
  
  // Allow health checks during maintenance
  if (req.path.startsWith('/health')) {
    return next();
  }
  
  // Check for bypass key
  const bypassKey = req.headers['x-maintenance-bypass'] as string;
  if (config.MAINTENANCE_BYPASS_KEY && bypassKey === config.MAINTENANCE_BYPASS_KEY) {
    return next();
  }
  
  // Check if user is admin (requires authentication first)
  if (req.user?.role === 'admin') {
    return next();
  }
  
  const error = new MaintenanceError(
    'Service temporarily unavailable for maintenance',
    req.context?.requestId
  );
  next(error);
};

/**
 * Request timeout middleware
 * Sets request timeout to prevent hanging requests
 */
export const requestTimeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          requestId: req.context?.requestId,
          method: req.method,
          path: req.path,
          timeout: timeoutMs,
        });
        
        res.status(408).json({
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Request timeout',
            timeout: timeoutMs,
          },
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });
    
    res.on('close', () => {
      clearTimeout(timeout);
    });
    
    next();
  };
};

/**
 * Request size monitoring middleware
 * Monitors and logs large requests
 */
export const requestSizeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const contentLength = parseInt(req.get('Content-Length') || '0', 10);
  
  if (contentLength > 0) {
    // Log large requests
    if (contentLength > 1024 * 1024) { // 1MB
      logger.warn('Large request received', {
        requestId: req.context?.requestId,
        method: req.method,
        path: req.path,
        contentLength,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });
    }
    
    // Add content length to context
    if (req.context) {
      (req.context as any).contentLength = contentLength;
    }
  }
  
  next();
};

/**
 * Security headers middleware
 * Adds security-related headers
 */
export const securityHeadersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add cache control for API responses
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
};

/**
 * CORS preflight handling middleware
 * Handles CORS preflight requests
 */
export const corsPreflightMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Request-ID');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(204).send();
    return;
  }
  
  next();
};

/**
 * Request logging middleware
 * Logs incoming requests with context
 */
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.info('Incoming request', {
    requestId: req.context?.requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.context?.userId,
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
  });
  
  next();
};

export default {
  requestIdMiddleware,
  requestContextMiddleware,
  performanceMiddleware,
  apiVersionMiddleware,
  apiKeyMiddleware,
  maintenanceModeMiddleware,
  requestTimeoutMiddleware,
  requestSizeMiddleware,
  securityHeadersMiddleware,
  corsPreflightMiddleware,
  requestLoggingMiddleware,
};