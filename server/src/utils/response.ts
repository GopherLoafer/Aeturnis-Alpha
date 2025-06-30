/**
 * Standardized API Response Formatting
 * Consistent response structure for all API endpoints
 */

import { Response } from 'express';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Success response interface
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
    version: string;
    [key: string]: any;
  };
}

/**
 * Error response interface
 */
export interface ErrorResponse {
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
 * Pagination metadata interface
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  startIndex: number;
  endIndex: number;
}

/**
 * Paginated response interface
 */
export interface PaginatedResponse<T = any> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
  meta?: {
    requestId?: string;
    timestamp: string;
    version: string;
    [key: string]: any;
  };
}

/**
 * Create success response
 */
export const createSuccessResponse = <T>(
  data: T,
  meta?: Partial<SuccessResponse['meta']>
): SuccessResponse<T> => {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      ...meta,
    },
  };
};

/**
 * Create paginated response
 */
export const createPaginatedResponse = <T>(
  data: T[],
  pagination: PaginationMeta,
  meta?: Partial<PaginatedResponse['meta']>
): PaginatedResponse<T> => {
  return {
    success: true,
    data,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      ...meta,
    },
  };
};

/**
 * Create error response
 */
export const createErrorResponse = (
  code: string,
  message: string,
  details?: any,
  requestId?: string,
  path?: string,
  method?: string
): ErrorResponse => {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      requestId,
      timestamp: new Date().toISOString(),
      path,
      method,
    },
  };
};

/**
 * Calculate pagination metadata
 */
export const calculatePagination = (
  total: number,
  page: number = 1,
  limit: number = 10
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit - 1, total - 1);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    startIndex,
    endIndex,
  };
};

/**
 * Response handler class with common methods
 */
export class ResponseHandler {
  private res: Response;
  private requestId?: string;

  constructor(res: Response, requestId?: string) {
    this.res = res;
    this.requestId = requestId;
  }

  /**
   * Send success response
   */
  success<T>(data: T, statusCode: number = 200, meta?: any): Response {
    const response = createSuccessResponse(data, {
      requestId: this.requestId,
      ...meta,
    });
    return this.res.status(statusCode).json(response);
  }

  /**
   * Send paginated response
   */
  paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
    statusCode: number = 200,
    meta?: any
  ): Response {
    const pagination = calculatePagination(total, page, limit);
    const response = createPaginatedResponse(data, pagination, {
      requestId: this.requestId,
      ...meta,
    });
    return this.res.status(statusCode).json(response);
  }

  /**
   * Send created response
   */
  created<T>(data: T, meta?: any): Response {
    return this.success(data, 201, meta);
  }

  /**
   * Send accepted response
   */
  accepted<T>(data: T, meta?: any): Response {
    return this.success(data, 202, meta);
  }

  /**
   * Send no content response
   */
  noContent(): Response {
    return this.res.status(204).send();
  }

  /**
   * Send error response
   */
  error(
    code: string,
    message: string,
    statusCode: number = 400,
    details?: any
  ): Response {
    const response = createErrorResponse(
      code,
      message,
      details,
      this.requestId,
      this.res.req.path,
      this.res.req.method
    );
    return this.res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   */
  validationError(errors: any[]): Response {
    return this.error('VALIDATION_ERROR', 'Validation failed', 400, errors);
  }

  /**
   * Send not found response
   */
  notFound(resource: string = 'Resource'): Response {
    return this.error('NOT_FOUND', `${resource} not found`, 404);
  }

  /**
   * Send unauthorized response
   */
  unauthorized(message: string = 'Authentication required'): Response {
    return this.error('UNAUTHORIZED', message, 401);
  }

  /**
   * Send forbidden response
   */
  forbidden(message: string = 'Insufficient permissions'): Response {
    return this.error('FORBIDDEN', message, 403);
  }

  /**
   * Send conflict response
   */
  conflict(message: string): Response {
    return this.error('CONFLICT', message, 409);
  }

  /**
   * Send rate limit response
   */
  rateLimited(retryAfter?: number): Response {
    if (retryAfter) {
      this.res.set('Retry-After', retryAfter.toString());
    }
    return this.error(
      'RATE_LIMITED',
      'Too many requests',
      429,
      retryAfter ? { retryAfter } : undefined
    );
  }

  /**
   * Send internal server error response
   */
  internalError(message: string = 'Internal server error'): Response {
    return this.error('INTERNAL_ERROR', message, 500);
  }

  /**
   * Send service unavailable response
   */
  serviceUnavailable(message: string = 'Service temporarily unavailable'): Response {
    return this.error('SERVICE_UNAVAILABLE', message, 503);
  }
}

/**
 * Express middleware to add response helper methods
 */
export const responseMiddleware = (req: any, res: Response, next: any): void => {
  const requestId = req.headers['x-request-id'] as string;
  const responseHandler = new ResponseHandler(res, requestId);

  // Add helper methods to response object
  res.success = responseHandler.success.bind(responseHandler);
  res.paginated = responseHandler.paginated.bind(responseHandler);
  res.created = responseHandler.created.bind(responseHandler);
  res.accepted = responseHandler.accepted.bind(responseHandler);
  res.noContent = responseHandler.noContent.bind(responseHandler);
  res.error = responseHandler.error.bind(responseHandler);
  res.validationError = responseHandler.validationError.bind(responseHandler);
  res.notFound = responseHandler.notFound.bind(responseHandler);
  res.unauthorized = responseHandler.unauthorized.bind(responseHandler);
  res.forbidden = responseHandler.forbidden.bind(responseHandler);
  res.conflict = responseHandler.conflict.bind(responseHandler);
  res.rateLimited = responseHandler.rateLimited.bind(responseHandler);
  res.internalError = responseHandler.internalError.bind(responseHandler);
  res.serviceUnavailable = responseHandler.serviceUnavailable.bind(responseHandler);

  next();
};

/**
 * Health check response format
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    [serviceName: string]: {
      status: 'up' | 'down' | 'degraded';
      responseTime?: number;
      message?: string;
      lastChecked: string;
    };
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu?: {
      usage: number;
    };
  };
}

/**
 * Create health check response
 */
export const createHealthCheckResponse = (
  services: HealthCheckResponse['services'],
  system: HealthCheckResponse['system']
): HealthCheckResponse => {
  const serviceStatuses = Object.values(services).map(service => service.status);
  const overallStatus = serviceStatuses.every(status => status === 'up')
    ? 'healthy'
    : serviceStatuses.some(status => status === 'down')
    ? 'unhealthy'
    : 'degraded';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || '1.0.0',
    services,
    system,
  };
};

/**
 * API response statistics for monitoring
 */
export interface ResponseStats {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: string;
  userAgent?: string;
  ip?: string;
  userId?: number;
}

/**
 * Track response statistics
 */
export const trackResponseStats = (
  req: any,
  res: Response,
  responseTime: number
): ResponseStats => {
  return {
    requestId: req.headers['x-request-id'] as string,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    responseTime,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
  };
};

// Extend Express Response interface with helper methods
declare global {
  namespace Express {
    interface Response {
      success: <T>(data: T, statusCode?: number, meta?: any) => Response;
      paginated: <T>(
        data: T[],
        total: number,
        page: number,
        limit: number,
        statusCode?: number,
        meta?: any
      ) => Response;
      created: <T>(data: T, meta?: any) => Response;
      accepted: <T>(data: T, meta?: any) => Response;
      noContent: () => Response;
      error: (code: string, message: string, statusCode?: number, details?: any) => Response;
      validationError: (errors: any[]) => Response;
      notFound: (resource?: string) => Response;
      unauthorized: (message?: string) => Response;
      forbidden: (message?: string) => Response;
      conflict: (message: string) => Response;
      rateLimited: (retryAfter?: number) => Response;
      internalError: (message?: string) => Response;
      serviceUnavailable: (message?: string) => Response;
    }
  }
}

export default {
  createSuccessResponse,
  createPaginatedResponse,
  createErrorResponse,
  calculatePagination,
  ResponseHandler,
  responseMiddleware,
  createHealthCheckResponse,
  trackResponseStats,
};