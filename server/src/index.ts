/**
 * Aeturnis Online - Main Server Entry Point
 * Mobile-first MMORPG Backend Server with JWT Authentication
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { 
  initializeDatabase, 
  testDatabaseConnection, 
  testRedisConnection, 
  closeConnections 
} from './config/database';
import authRoutes from './routes/auth.routes';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure Winston Logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'aeturnis-online' },
  transports: [
    new winston.transports.File({ 
      filename: process.env.LOG_FILE_ERROR || 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: process.env.LOG_FILE_COMBINED || 'logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080'
];

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? allowedOrigins
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: {
    error: 'Too many requests from this IP',
    message: 'Please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10) / 1000)
    });
  }
});

app.use(globalLimiter);

// Body Parser Middleware
app.use(express.json({ 
  limit: process.env.MAX_FILE_SIZE || '10mb',
  strict: true
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.MAX_FILE_SIZE || '10mb' 
}));

// Request ID and Logging Middleware
app.use((req, res, next) => {
  // Generate unique request ID
  req.requestId = Math.random().toString(36).substring(2, 15) + 
                 Math.random().toString(36).substring(2, 15);

  // Log request if enabled
  if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
    logger.info(`${req.method} ${req.path}`, {
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  }

  next();
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealthy = await testDatabaseConnection();
    const redisHealthy = await testRedisConnection();
    
    const health = {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy'
      },
      requestId: req.requestId
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      requestId: req.requestId
    });
  }
});

// API Info Endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Aeturnis Online API Server',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        forgotPassword: 'POST /api/auth/forgot-password',
        resetPassword: 'POST /api/auth/reset-password',
        profile: 'GET /api/auth/me',
        status: 'GET /api/auth/status'
      },
      docs: '/api/docs (coming soon)'
    },
    requestId: req.requestId
  });
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// 404 Handler
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    requestId: req.requestId
  });

  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} does not exist`,
    requestId: req.requestId
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    requestId: req.requestId
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    requestId: req.requestId,
    ...(isDevelopment && { 
      stack: err.stack,
      details: err.details 
    })
  });
});

// Initialize Database and Start Server
const startServer = async (): Promise<void> => {
  try {
    logger.info('🚀 Starting Aeturnis Online Server...');

    // Test database connections
    const dbHealthy = await testDatabaseConnection();
    const redisHealthy = await testRedisConnection();

    if (!dbHealthy) {
      logger.error('❌ Database connection failed');
      process.exit(1);
    }

    if (!redisHealthy) {
      logger.error('❌ Redis connection failed');
      process.exit(1);
    }

    // Initialize database schema
    await initializeDatabase();
    logger.info('✅ Database initialized successfully');

    // Start HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Aeturnis Online Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        pid: process.pid
      });

      logger.info('📡 Server endpoints available:', {
        health: `http://localhost:${PORT}/health`,
        api: `http://localhost:${PORT}/api`,
        auth: `http://localhost:${PORT}/api/auth`
      });
    });

    // Graceful Shutdown Handlers
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await closeConnections();
          logger.info('All database connections closed');
          logger.info('✅ Server shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection:', {
        reason: reason,
        promise: promise
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;