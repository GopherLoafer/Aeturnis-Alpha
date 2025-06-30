/**
 * Aeturnis Online - Express Application Configuration
 * Production-ready Express API with enterprise-grade middleware and error handling
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { json, urlencoded } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Configuration and utilities
import { config, getCorsOrigins } from './config/environment';
import { logger } from './utils/logger';
import { responseMiddleware } from './utils/response';

// Middleware
import { 
  globalErrorHandler, 
  handle404, 
  initializeErrorHandling 
} from './middleware/errorHandler';
import { 
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
  requestLoggingMiddleware
} from './middleware/context';
import { sanitizeRequestBody, validateContentType } from './middleware/validation';

// Routes
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import realtimeRoutes from './routes/realtime.routes';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Create and configure Express application
 */
export const createApp = (): express.Application => {
  // Initialize error handling
  initializeErrorHandling();

  const app = express();

  /**
   * Security Middleware Stack
   */
  // Helmet with custom CSP for game assets
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-eval'"], // Allow eval for game engine
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "wss:", "ws:"], // Allow WebSocket connections
        mediaSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Disable for game assets
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: config.NODE_ENV === 'production'
    }
  }));

  // CORS with dynamic origin validation
  app.use(cors({
    origin: getCorsOrigins(),
    credentials: config.CORS_CREDENTIALS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-API-Key', 
      'X-Request-ID', 
      'API-Version',
      'X-Maintenance-Bypass'
    ],
    exposedHeaders: ['X-Request-ID', 'X-Response-Time', 'X-API-Version'],
  }));

  // Handle CORS preflight requests
  app.use(corsPreflightMiddleware);

  /**
   * Rate Limiting
   */
  // Global rate limiting
  const globalLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW,
    max: config.RATE_LIMIT_GLOBAL,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: any, res: any) => {
      logger.warn('Global rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later.',
          retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW / 1000),
        },
      });
    },
  });
  app.use(globalLimiter);

  // Auth endpoints rate limiting
  const authLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW,
    max: config.RATE_LIMIT_AUTH,
    message: {
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: any, res: any) => {
      logger.warn('Auth rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });
      res.status(429).json({
        success: false,
        error: {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: 'Too many authentication attempts, please try again later.',
          retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW / 1000),
        },
      });
    },
  });
  app.use('/api/auth', authLimiter);

  // API endpoints rate limiting
  const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW,
    max: config.RATE_LIMIT_API,
    message: {
      success: false,
      error: {
        code: 'API_RATE_LIMIT_EXCEEDED',
        message: 'Too many API requests, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: any, res: any) => {
      logger.warn('API rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });
      res.status(429).json({
        success: false,
        error: {
          code: 'API_RATE_LIMIT_EXCEEDED',
          message: 'Too many API requests, please try again later.',
          retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW / 1000),
        },
      });
    },
  });
  app.use('/api', apiLimiter);

  /**
   * Request Processing Middleware
   */
  // Request timeout
  app.use(requestTimeoutMiddleware(30000)); // 30 seconds

  // Compression with threshold
  app.use(compression({
    threshold: config.COMPRESSION_THRESHOLD,
    filter: (req: any, res: any) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  }));

  // Body parsing with size limits
  app.use(json({ 
    limit: config.REQUEST_SIZE_LIMIT,
    verify: (req, res, buf) => {
      // Store raw body for webhook verification if needed
      (req as any).rawBody = buf;
    },
  }));
  app.use(urlencoded({ 
    extended: true, 
    limit: config.REQUEST_SIZE_LIMIT 
  }));

  // Content type validation for API routes
  app.use('/api', validateContentType(['application/json', 'multipart/form-data']));

  /**
   * Custom Middleware
   */
  // Request ID generation
  app.use(requestIdMiddleware);

  // Request context
  app.use(requestContextMiddleware);

  // Security headers
  app.use(securityHeadersMiddleware);

  // API versioning
  app.use('/api', apiVersionMiddleware);

  // Performance monitoring
  app.use(performanceMiddleware);

  // Request size monitoring
  app.use(requestSizeMiddleware);

  // Request sanitization
  app.use(sanitizeRequestBody);

  // Response helpers
  app.use(responseMiddleware);

  // Maintenance mode check
  app.use(maintenanceModeMiddleware);

  // API key validation
  app.use('/api', apiKeyMiddleware);

  // Request logging (after context is established)
  if (config.LOG_LEVEL === 'debug') {
    app.use(requestLoggingMiddleware);
  }

  /**
   * API Documentation (Swagger)
   */
  if (config.ENABLE_SWAGGER) {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Aeturnis Online API',
          version: config.APP_VERSION,
          description: 'Mobile-first MMORPG Backend API with comprehensive authentication and game mechanics',
          contact: {
            name: 'API Support',
            email: 'support@aeturnis.com',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
        servers: [
          {
            url: config.NODE_ENV === 'production' 
              ? 'https://api.aeturnis.com' 
              : `http://localhost:${config.PORT}`,
            description: config.NODE_ENV === 'production' ? 'Production server' : 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT token for authenticated requests',
            },
            apiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
              description: 'API key for external service access',
            },
          },
          schemas: {
            SuccessResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object' },
                meta: {
                  type: 'object',
                  properties: {
                    requestId: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string' },
                  },
                },
              },
            },
            ErrorResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                    details: { type: 'object' },
                    requestId: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
        security: [
          { bearerAuth: [] },
          { apiKeyAuth: [] },
        ],
      },
      apis: ['./routes/*.ts', './middleware/*.ts'], // Include all route files
    };

    const swaggerSpec = swaggerJsdoc(swaggerOptions);
    
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info .title { color: #1f2937 }
        .swagger-ui .scheme-container { background: #f3f4f6; border-radius: 4px; padding: 10px; }
      `,
      customSiteTitle: 'Aeturnis Online API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    }));
    
    // JSON endpoint for API spec
    app.get('/api-docs', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(swaggerSpec);
    });
  }

  /**
   * Routes
   */
  // Health check routes (no /api prefix for monitoring tools)
  app.use('/', healthRoutes);

  // Authentication routes
  app.use('/api/auth', authRoutes);
  
  // Realtime routes
  app.use('/api/realtime', realtimeRoutes);

  // API routes will be added here
  // app.use('/api/users', userRoutes);
  // app.use('/api/characters', characterRoutes);
  // app.use('/api/game', gameRoutes);

  /**
   * Root endpoint
   */
  app.get('/', (req: any, res: any) => {
    res.success({
      message: 'Aeturnis Online API',
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
      timestamp: new Date().toISOString(),
      documentation: config.ENABLE_SWAGGER ? '/docs' : 'Documentation not available',
      health: '/health',
      endpoints: {
        auth: '/api/auth',
        health: '/health',
        docs: config.ENABLE_SWAGGER ? '/docs' : null,
      },
    });
  });

  // API info endpoint
  app.get('/api', (req: any, res: any) => {
    res.success({
      message: 'Aeturnis Online API v1',
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
      timestamp: new Date().toISOString(),
      features: {
        authentication: 'JWT with refresh tokens',
        rateLimit: 'Multi-tier rate limiting',
        documentation: config.ENABLE_SWAGGER ? 'Swagger UI available at /docs' : 'Documentation disabled',
        healthCheck: 'Comprehensive health monitoring',
        logging: 'Structured logging with Winston',
        monitoring: 'Performance and metrics tracking',
      },
      endpoints: {
        auth: {
          register: 'POST /api/auth/register',
          login: 'POST /api/auth/login',
          refresh: 'POST /api/auth/refresh',
          logout: 'POST /api/auth/logout',
          profile: 'GET /api/auth/me',
          status: 'GET /api/auth/status',
        },
        health: {
          basic: 'GET /health',
          detailed: 'GET /health/detailed',
          ready: 'GET /health/ready',
          live: 'GET /health/live',
        },
      },
    });
  });

  /**
   * Error Handling
   */
  // 404 handler for undefined routes
  app.use('*', handle404);

  // Global error handler
  app.use(globalErrorHandler);

  return app;
};

export default createApp;