/**
 * Aeturnis Online - Main Server Entry Point
 * Production-ready Express API with enterprise-grade middleware and error handling
 */

import { createServer } from 'http';
import { config, validateCriticalEnvVars } from './config/environment';
import { logger } from './utils/logger';
import { createApp } from './app';
import { SocketServer } from './sockets/SocketServer';
import { RealtimeService } from './services/RealtimeService';
import { 
import { getErrorMessage } from '../utils/errorUtils';
  initializeDatabase, 
  testDatabaseConnection, 
  testRedisConnection, 
  closeConnections 
} from './config/database';

/**
 * Initialize and Start Server
 */
const startServer = async (): Promise<void> => {
  try {
    // Validate critical environment variables
    validateCriticalEnvVars();

    logger.info('🚀 Starting Aeturnis Online Server...', {
      environment: config.NODE_ENV,
      version: config.APP_VERSION,
      port: config.PORT,
      host: config.HOST,
    });

    // Test database connections
    const dbHealthy = await testDatabaseConnection();
    const redisHealthy = await testRedisConnection();

    if (!dbHealthy) {
      logger.warn('⚠️  Database connection failed - continuing without database for testing');
    }

    if (!redisHealthy) {
      logger.warn('⚠️  Redis connection failed - continuing without Redis');
    }

    // Initialize database schema (skip if database unavailable)
    if (dbHealthy) {
      try {
        await initializeDatabase();
        logger.info('✅ Database initialized successfully');
      } catch (error) {
        logger.warn('Database initialization failed, continuing without full database setup');
      }
    }

    // Create Express application
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io server
    const socketServer = new SocketServer(httpServer);
    await socketServer.start();

    // Initialize Realtime Service
    const realtimeService = new RealtimeService(socketServer.getIO());

    // Make realtime service globally available
    (global as any).realtimeService = realtimeService;

    // Start HTTP server
    const server = httpServer.listen(config.PORT, config.HOST, () => {
      logger.info('🚀 Aeturnis Online Server started successfully', {
        port: config.PORT,
        host: config.HOST,
        environment: config.NODE_ENV,
        version: config.APP_VERSION,
        nodeVersion: process.version,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      });

      // Log available endpoints
      const baseUrl = `http://${config.HOST}:${config.PORT}`;
      const wsUrl = `ws://${config.HOST}:${config.PORT}`;
      logger.info('📡 Server endpoints available:', {
        api: `${baseUrl}/`,
        health: `${baseUrl}/health`,
        auth: `${baseUrl}/api/auth`,
        websocket: `${wsUrl}/socket.io/`,
        realtime: 'Socket.io enabled',
        ...(config.ENABLE_SWAGGER && { docs: `${baseUrl}/docs` }),
      });

      if (config.MAINTENANCE_MODE) {
        logger.warn('⚠️  Maintenance mode is enabled');
      }

      if (config.NODE_ENV === 'development') {
        logger.info('🔧 Development mode features enabled:', {
          detailedErrors: true,
          requestLogging: config.LOG_LEVEL === 'debug',
          swagger: config.ENABLE_SWAGGER,
        });
      }
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
          logger.error('Error during shutdown:', {
            error: error instanceof Error ? getErrorMessage(error) : error,
            stack: error instanceof Error ? error.stack : undefined,
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      switch (error.code) {
        case 'EACCES':
          logger.error(`Port ${config.PORT} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`Port ${config.PORT} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Promise Rejection:', {
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

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', {
        error: getErrorMessage(error),
        name: error.name,
        stack: error.stack,
      });

      // Uncaught exceptions are serious - always shutdown
      logger.error('Shutting down due to uncaught exception');
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', {
      error: error instanceof Error ? getErrorMessage(error) : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// Start the server
startServer().catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});