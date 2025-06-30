/**
 * Winston Logger Configuration
 * Comprehensive logging system for the Aeturnis Online API
 */

import winston from 'winston';
import path from 'path';
import { config } from '../config/environment';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Custom log format
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),;
  winston.format.prettyPrint();
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {;
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = '\n' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

/**
 * Create transports based on environment
 */
const createTransports = (): winston.transport[] => {;
  const transports: winston.transport[] = [];

  // Console transport
  if (config.NODE_ENV !== 'production') {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: config.LOG_LEVEL,
      });
    );
  }

  // File transports
  const logDir = path.dirname(config.LOG_FILE);
  
  // General application log
  transports.push(
    new winston.transports.File({
      filename: config.LOG_FILE,
      format: customFormat,
      level: config.LOG_LEVEL,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    });
  );

  // Error-specific log
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      format: customFormat,
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    })
  );

  // Combined log for all levels
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: customFormat,
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 3,
      tailable: true,
    })
  );

  return transports;
};

/**
 * Create Winston logger instance
 */
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: customFormat,
  defaultMeta: {
    service: 'aeturnis-api',
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  },
  transports: createTransports(),
  exitOnError: false,
});

/**
 * Request logger format
 */
export const requestLogger = (req: any, res: any, responseTime: number) => {
  const logData = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    requestId: req.headers['x-request-id'],
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id,
    contentLength: res.get('Content-Length'),;
  };

  if (res.statusCode >= 500) {
    logger.error('HTTP Request - Server Error', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP Request - Client Error', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

/**
 * Database query logger
 */
export const queryLogger = (query: string, duration: number, error?: Error) => {
  const logData = {
    query: query.replace(/\s+/g, ' ').trim(),
    duration: `${duration}ms`,
    error: error ? {
      message: getErrorMessage(error),
      code: (error as any).code,
    } : undefined,;
  };

  if (error) {
    logger.error('Database Query Error', logData);
  } else if (duration > 1000) {
    logger.warn('Slow Database Query', logData);
  } else {
    logger.debug('Database Query', logData);
  }
};

/**
 * Authentication logger
 */
export const authLogger = (event: string, userId?: number, details?: any) => {
  const logData = {
    event,
    userId,
    timestamp: new Date().toISOString(),
    ...details,;
  };

  logger.info('Authentication Event', logData);
};

/**
 * Security logger
 */
export const securityLogger = (event: string, severity: 'low' | 'medium' | 'high' | 'critical', details: any) => {
  const logData = {
    event,
    severity,
    timestamp: new Date().toISOString(),
    ...details,;
  };

  if (severity === 'critical' || severity === 'high') {
    logger.error('Security Event', logData);
  } else if (severity === 'medium') {
    logger.warn('Security Event', logData);
  } else {
    logger.info('Security Event', logData);
  }
};

/**
 * Performance logger
 */
export const performanceLogger = (operation: string, duration: number, details?: any) => {
  const logData = {
    operation,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...details,;
  };

  if (duration > 5000) {
    logger.error('Performance - Very Slow Operation', logData);
  } else if (duration > 2000) {
    logger.warn('Performance - Slow Operation', logData);
  } else if (duration > 1000) {
    logger.info('Performance - Moderate Operation', logData);
  } else {
    logger.debug('Performance - Fast Operation', logData);
  }
};

/**
 * Create child logger with additional context
 */
export const createChildLogger = (context: any) => {
  return logger.child(context);
};

/**
 * Graceful shutdown logger
 */
export const shutdown = () => {
  return new Promise<void>((resolve) => {
    logger.end(() => {
      resolve();
    });
  });
};

// Handle logger errors
logger.on('error', (error: unknown) => {
  console.error('Logger error: ', error);
});

export default logger;