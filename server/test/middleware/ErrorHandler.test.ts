
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../src/middleware/errorHandler';
import { AppError } from '../../src/utils/AppError';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/test',
      headers: {},
      body: {}
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false
    };
    
    mockNext = jest.fn();
  });

  describe('AppError Handling', () => {
    it('should handle 400 Bad Request errors', () => {
      const error = new AppError('Invalid input data', 400, 'VALIDATION_ERROR');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid input data',
          code: 'VALIDATION_ERROR',
          statusCode: 400
        }
      });
    });

    it('should handle 401 Unauthorized errors', () => {
      const error = new AppError('Authentication required', 401, 'AUTH_REQUIRED');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Authentication required',
          code: 'AUTH_REQUIRED',
          statusCode: 401
        }
      });
    });

    it('should handle 403 Forbidden errors', () => {
      const error = new AppError('Access denied', 403, 'ACCESS_DENIED');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Access denied',
          code: 'ACCESS_DENIED',
          statusCode: 403
        }
      });
    });

    it('should handle 404 Not Found errors', () => {
      const error = new AppError('Resource not found', 404, 'NOT_FOUND');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Resource not found',
          code: 'NOT_FOUND',
          statusCode: 404
        }
      });
    });

    it('should handle 500 Internal Server errors', () => {
      const error = new AppError('Database connection failed', 500, 'DATABASE_ERROR');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Database connection failed',
          code: 'DATABASE_ERROR',
          statusCode: 500
        }
      });
    });
  });

  describe('Generic Error Handling', () => {
    it('should handle generic JavaScript errors', () => {
      const error = new Error('Unexpected error occurred');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          statusCode: 500
        }
      });
    });

    it('should handle string errors', () => {
      const error = 'String error message';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          statusCode: 500
        }
      });
    });

    it('should handle null/undefined errors', () => {
      const error = null;
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          statusCode: 500
        }
      });
    });
  });

  describe('Response State Handling', () => {
    it('should not send response if headers already sent', () => {
      mockResponse.headersSent = true;
      const error = new AppError('Test error', 400);
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should handle missing response methods gracefully', () => {
      const incompleteResponse = {} as Response;
      const error = new AppError('Test error', 400);
      
      expect(() => {
        errorHandler(error, mockRequest as Request, incompleteResponse, mockNext);
      }).not.toThrow();
    });
  });

  describe('Development vs Production Error Details', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test:1:1';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.error).toHaveProperty('stack');
    });

    it('should exclude stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test:1:1';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.error).not.toHaveProperty('stack');
    });
  });
});
