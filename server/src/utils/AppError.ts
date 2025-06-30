/**
 * Application Error Handling System
 * Provides standardized error responses across all services
 */

export enum ErrorCode {
  // Authentication & Authorization (1000-1099)
  INVALID_CREDENTIALS = 1001,
  TOKEN_EXPIRED = 1002,
  TOKEN_INVALID = 1003,
  ACCOUNT_LOCKED = 1004,
  INSUFFICIENT_PERMISSIONS = 1005,
  RATE_LIMITED = 1006,
  REGISTRATION_FAILED = 1007,
  PASSWORD_RESET_FAILED = 1008,

  // Validation & Input (1100-1199)
  VALIDATION_ERROR = 1101,
  INVALID_INPUT = 1102,
  MISSING_REQUIRED_FIELD = 1103,
  INVALID_FORMAT = 1104,
  DUPLICATE_ENTRY = 1105,

  // Database & Storage (1200-1299)
  DATABASE_ERROR = 1201,
  RECORD_NOT_FOUND = 1202,
  CONSTRAINT_VIOLATION = 1203,
  CONNECTION_FAILED = 1204,
  TRANSACTION_FAILED = 1205,

  // External Services (1300-1399)
  REDIS_ERROR = 1301,
  CACHE_ERROR = 1302,
  EXTERNAL_API_ERROR = 1303,
  SERVICE_UNAVAILABLE = 1304,

  // Game Logic (1400-1499)
  CHARACTER_NOT_FOUND = 1401,
  INVALID_ACTION = 1402,
  COMBAT_ERROR = 1403,
  ZONE_ERROR = 1404,
  PROGRESSION_ERROR = 1405,
  AFFINITY_ERROR = 1406,

  // System & Internal (1500-1599)
  INTERNAL_ERROR = 1500,
  CONFIGURATION_ERROR = 1501,
  MAINTENANCE_MODE = 1502,
  RESOURCE_EXHAUSTED = 1503,

  // Socket & Real-time (1600-1699)
  CONNECTION_ERROR = 1601,
  ROOM_ERROR = 1602,
  BROADCAST_ERROR = 1603,
  PRESENCE_ERROR = 1604
}

export interface ErrorDetails {
  field?: string;
  value?: any;
  constraint?: string;
  resource?: string;
  id?: string;
  limit?: number;
  resetTime?: string;
  metadata?: Record<string, any>;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails;
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: ErrorDetails,
    requestId?: string
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();
    this.requestId = requestId;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON response format
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp.toISOString(),
        requestId: this.requestId,
        details: this.details
      }
    };
  }

  /**
   * Convert to socket error format
   */
  toSocketError() {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp.toISOString(),
        details: this.details
      }
    };
  }
}

/**
 * HTTP Status Code Mapping
 */
export const getHttpStatusFromErrorCode = (code: ErrorCode): number => {
  const statusMap: Record<ErrorCode, number> = {
    // Authentication & Authorization - 401/403
    [ErrorCode.INVALID_CREDENTIALS]: 401,
    [ErrorCode.TOKEN_EXPIRED]: 401,
    [ErrorCode.TOKEN_INVALID]: 401,
    [ErrorCode.ACCOUNT_LOCKED]: 403,
    [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
    [ErrorCode.RATE_LIMITED]: 429,
    [ErrorCode.REGISTRATION_FAILED]: 400,
    [ErrorCode.PASSWORD_RESET_FAILED]: 400,

    // Validation & Input - 400
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.INVALID_INPUT]: 400,
    [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
    [ErrorCode.INVALID_FORMAT]: 400,
    [ErrorCode.DUPLICATE_ENTRY]: 409,

    // Database & Storage - 500/404
    [ErrorCode.DATABASE_ERROR]: 500,
    [ErrorCode.RECORD_NOT_FOUND]: 404,
    [ErrorCode.CONSTRAINT_VIOLATION]: 400,
    [ErrorCode.CONNECTION_FAILED]: 503,
    [ErrorCode.TRANSACTION_FAILED]: 500,

    // External Services - 502/503
    [ErrorCode.REDIS_ERROR]: 503,
    [ErrorCode.CACHE_ERROR]: 503,
    [ErrorCode.EXTERNAL_API_ERROR]: 502,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503,

    // Game Logic - 400/404
    [ErrorCode.CHARACTER_NOT_FOUND]: 404,
    [ErrorCode.INVALID_ACTION]: 400,
    [ErrorCode.COMBAT_ERROR]: 400,
    [ErrorCode.ZONE_ERROR]: 400,
    [ErrorCode.PROGRESSION_ERROR]: 400,
    [ErrorCode.AFFINITY_ERROR]: 400,

    // System & Internal - 500/503
    [ErrorCode.INTERNAL_ERROR]: 500,
    [ErrorCode.CONFIGURATION_ERROR]: 500,
    [ErrorCode.MAINTENANCE_MODE]: 503,
    [ErrorCode.RESOURCE_EXHAUSTED]: 503,

    // Socket & Real-time - 400/503
    [ErrorCode.CONNECTION_ERROR]: 503,
    [ErrorCode.ROOM_ERROR]: 400,
    [ErrorCode.BROADCAST_ERROR]: 500,
    [ErrorCode.PRESENCE_ERROR]: 400
  };

  return statusMap[code] || 500;
};

/**
 * Factory functions for common errors
 */
export class AppErrorFactory {
  static validation(message: string, field?: string, value?: any, requestId?: string): AppError {
    return new AppError(
      message,
      ErrorCode.VALIDATION_ERROR,
      400,
      true,
      { field, value },
      requestId
    );
  }

  static authentication(message: string, requestId?: string): AppError {
    return new AppError(
      message,
      ErrorCode.INVALID_CREDENTIALS,
      401,
      true,
      undefined,
      requestId
    );
  }

  static authorization(message: string, requestId?: string): AppError {
    return new AppError(
      message,
      ErrorCode.INSUFFICIENT_PERMISSIONS,
      403,
      true,
      undefined,
      requestId
    );
  }

  static notFound(resource: string, id?: string, requestId?: string): AppError {
    return new AppError(
      `${resource} not found${id ? ` with id: ${id}` : ''}`,
      ErrorCode.RECORD_NOT_FOUND,
      404,
      true,
      { resource, id },
      requestId
    );
  }

  static database(message: string, constraint?: string, requestId?: string): AppError {
    return new AppError(
      message,
      ErrorCode.DATABASE_ERROR,
      500,
      true,
      { constraint },
      requestId
    );
  }

  static rateLimit(message: string, limit?: number, resetTime?: Date, requestId?: string): AppError {
    return new AppError(
      message,
      ErrorCode.RATE_LIMITED,
      429,
      true,
      { limit, resetTime: resetTime?.toISOString() },
      requestId
    );
  }

  static internal(message: string, requestId?: string): AppError {
    return new AppError(
      message,
      ErrorCode.INTERNAL_ERROR,
      500,
      false,
      undefined,
      requestId
    );
  }
}

/**
 * Check if error is operational (safe to expose to client)
 */
export const isOperationalError = (error: any): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};