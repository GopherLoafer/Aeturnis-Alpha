/**
 * Comprehensive Error Handling System
 * Custom error classes and global error handler for production-ready API
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { AppError as AppErrorNew, isOperationalError } from '../utils/AppError';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Base Application Error Class (Legacy - use AppErrorNew instead)
 * @deprecated Use AppError from utils/AppError.ts
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    requestId?: string
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
    
    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - 400 Bad Request
 */
export class ValidationError extends AppError {
  public readonly details: any;

  constructor(message: string, details?: any, requestId?: string) {
    super(message, 400, 'VALIDATION_ERROR', true, requestId);
    this.details = details;
  }
}

/**
 * Authentication Error - 401 Unauthorized
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', requestId?: string) {
    super(message, 401, 'AUTHENTICATION_ERROR', true, requestId);
  }
}

/**
 * Authorization Error - 403 Forbidden
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', requestId?: string) {
    super(message, 403, 'AUTHORIZATION_ERROR', true, requestId);
  }
}

/**
 * Not Found Error - 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', requestId?: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR', true, requestId);
  }
}

/**
 * Conflict Error - 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(message: string, requestId?: string) {
    super(message, 409, 'CONFLICT_ERROR', true, requestId);
  }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message = 'Too many requests', retryAfter?: number, requestId?: string) {
    super(message, 429, 'RATE_LIMIT_ERROR', true, requestId);
    this.retryAfter = retryAfter;
  }
}

/**
 * Database Error - 500 Internal Server Error
 */
export class DatabaseError extends AppError {
  public readonly query?: string;
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error, query?: string, requestId?: string) {
    super(message, 500, 'DATABASE_ERROR', true, requestId);
    this.originalError = originalError;
    this.query = query;
  }
}

/**
 * External Service Error - 502 Bad Gateway
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string, requestId?: string) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', true, requestId);
    this.service = service;
  }
}

/**
 * Maintenance Mode Error - 503 Service Unavailable
 */
export class MaintenanceError extends AppError {
  constructor(message = 'Service temporarily unavailable for maintenance', requestId?: string) {
    super(message, 503, 'MAINTENANCE_ERROR', true, requestId);
  }
}

/**
 * Interface for error response
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
    timestamp: string;
    path?: string;
    method?: string;
  };
  stack?: string;
}

/**
 * Transform error into standardized response format
 */
const formatErrorResponse = (error: Error, req: Request): ErrorResponse => {
  const requestId = req.headers['x-request-id'] as string;
  
  if (error instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: getErrorMessage(error),
        requestId: requestId || error.requestId,
        timestamp: error.timestamp,
        path: req.path,
        method: req.method,
      },
    };

    // Add specific error details
    if (error instanceof ValidationError && error.details) {
      response.error.details = error.details;
    }

    if (error instanceof RateLimitError && error.retryAfter) {
      response.error.details = { retryAfter: error.retryAfter };
    }

    // Include stack trace in development
    if (!config.NODE_ENV || config.NODE_ENV === 'development') {
      response.stack = error.stack;
    }

    return response;
  }

  // Handle non-operational errors
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: config.NODE_ENV === 'production' 
        ? 'An unexpected error occurred'
        : getErrorMessage(error),
      requestId,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
    },
    ...(config.NODE_ENV !== 'production' && { stack: error.stack }),
  };
};

/**
 * Log error with appropriate level and context
 */
const logError = (error: Error, req: Request): void => {
  const requestId = req.headers['x-request-id'] as string;
  const logContext = {
    requestId,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: (req as any).user?.id,
  };

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error('Application Error', {
        error: {
          message: getErrorMessage(error),
          code: error.code,
          statusCode: error.statusCode,
          stack: error.stack,
        },
        ...logContext,
      });
    } else if (error.statusCode >= 400) {
      logger.warn('Client Error', {
        error: {
          message: getErrorMessage(error),
          code: error.code,
          statusCode: error.statusCode,
        },
        ...logContext,
      });
    }
  } else {
    // Unexpected errors
    logger.error('Unexpected Error', {
      error: {
        message: getErrorMessage(error),
        name: error.name,
        stack: error.stack,
      },
      ...logContext,
    });
  }
};

/**
 * Check if error should trigger admin notification
 */
const shouldNotifyAdmins = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.statusCode >= 500 && error.isOperational;
  }
  return true; // All unexpected errors should notify admins
};

/**
 * Send admin notification for critical errors
 */
const notifyAdmins = async (error: Error, req: Request): Promise<void> => {
  try {
    // In a real application, this would send notifications via:
    // - Email
    // - Slack/Discord webhook
    // - PagerDuty
    // - SMS alerts
    
    logger.error('CRITICAL ERROR - Admin notification triggered', {
      error: {
        message: getErrorMessage(error),
        stack: error.stack,
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
      },
    });
  } catch (notificationError) {
    logger.error('Failed to send admin notification', {
      originalError: getErrorMessage(error),
      notificationError: notificationError instanceof Error ? notificationError.message : notificationError,
    });
  }
};

/**
 * Global Error Handler Middleware
 */
export const globalErrorHandler = async (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Log the error
  logError(error, req);

  // Notify admins for critical errors
  if (shouldNotifyAdmins(error)) {
    await notifyAdmins(error, req);
  }

  // Format and send error response
  const errorResponse = formatErrorResponse(error, req);
  
  // Set additional headers for specific error types
  if (error instanceof RateLimitError && error.retryAfter) {
    res.set('Retry-After', error.retryAfter.toString());
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  res.status(statusCode).json(errorResponse);
};

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors and pass to global handler
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });

    // In production, you might want to gracefully shutdown
    if (config.NODE_ENV === 'production') {
      logger.error('Shutting down due to unhandled promise rejection');
      process.exit(1);
    }
  });
};

/**
 * Handle uncaught exceptions
 */
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: {
        message: getErrorMessage(error),
        name: error.name,
        stack: error.stack,
      },
    });

    // Uncaught exceptions are serious - always shutdown
    logger.error('Shutting down due to uncaught exception');
    process.exit(1);
  });
};

/**
 * Handle database connection errors
 */
export const handleDatabaseError = (error: any): DatabaseError => {
  let message = 'Database operation failed';
  
  // PostgreSQL specific error handling
  if (error.code) {
    switch (error.code) {
      case '23505': // unique_violation
        message = 'Resource already exists';
        break;
      case '23503': // foreign_key_violation
        message = 'Referenced resource does not exist';
        break;
      case '23514': // check_violation
        message = 'Data validation failed';
        break;
      case '42P01': // undefined_table
        message = 'Database table does not exist';
        break;
      case '42703': // undefined_column
        message = 'Database column does not exist';
        break;
      case '08000': // connection_exception
      case '08003': // connection_does_not_exist
      case '08006': // connection_failure
        message = 'Database connection failed';
        break;
      default:
        message = `Database error: ${getErrorMessage(error)}`;
    }
  }

  return new DatabaseError(message, error, error.query);
};

/**
 * Handle 404 errors for undefined routes
 */
export const handle404 = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.headers['x-request-id'] as string;
  const error = new NotFoundError(`Route ${req.method} ${req.path}`, requestId);
  next(error);
};

/**
 * Async wrapper for route handlers
 */
export const asyncWrapper = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Initialize error handling
 */
export const initializeErrorHandling = (): void => {
  handleUnhandledRejection();
  handleUncaughtException();
  
  logger.info('Error handling initialized');
};