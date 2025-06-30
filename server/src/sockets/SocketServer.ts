/**
 * Aeturnis Online - Socket.io Server
 * Production-ready real-time communication system with Redis scaling
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { authenticateSocket } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { attachHandlers } from './handlers';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { getCorsOrigins } from '../config/environment';
import { getErrorMessage } from '../utils/errorUtils';

export class SocketServer {
  private io: SocketIOServer;
  private redisClient: any;
  private redisSub: any;
  private isStarted: boolean = false;

  constructor(httpServer: HTTPServer) {
    // Initialize Socket.io with production-ready configuration
    this.io = new SocketIOServer(httpServer, {
      // CORS configuration matching Express API
      cors: {
        origin: getCorsOrigins(),
        credentials: config.CORS_CREDENTIALS,
        methods: ['GET', 'POST'],
      },
      
      // Transport configuration with polling → websocket upgrade
      transports: ['polling', 'websocket'],
      upgradeTimeout: 30000, // 30 seconds for upgrade
      
      // Connection timeout and heartbeat
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      
      // Reconnection settings
      maxHttpBufferSize: 1e6, // 1MB max buffer
      
      // Namespace configuration
      allowEIO3: false, // Force Engine.IO v4+
      
      // Production optimizations
      serveClient: config.NODE_ENV === 'development',
      cookie: {
        name: 'aeturnis-socket',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
      },
    });

    logger.info('Socket.io server initialized', {
      cors: getCorsOrigins(),
      transports: ['polling', 'websocket'],
      environment: config.NODE_ENV,
    });
  }

  public async start(req: Request, res: Response): Promise<void> {
    try {
      // Connect to Redis for horizontal scaling
      await this.setupRedisAdapter();
      
      // Apply authentication middleware
      this.io.use(authenticateSocket as any);
      
      // Apply rate limiting middleware
      this.io.use(rateLimitMiddleware as any);
      
      // Attach all event handlers
      attachHandlers(this.io);
      
      // Set up connection monitoring
      this.setupConnectionMonitoring();
      
      // Set up graceful shutdown
      this.setupGracefulShutdown();
      
      this.isStarted = true;
      
      logger.info('Socket.io server started successfully', {
        redisConnected: !!this.redisClient,
        middlewareCount: 2,
        handlersAttached: true,
       );
});
      
    } catch (error) {
      logger.error('Failed to start Socket.io server', {
        error: error instanceof Error ? getErrorMessage(error) : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async setupRedisAdapter(req: Request, res: Response): Promise<void> {
    try {
      // Create Redis clients for pub/sub
      this.redisClient = createClient({
        url: config.REDIS_URL || `redis://${config.REDIS_HOST}:${config.REDIS_PORT}`,
        password: config.REDIS_PASSWORD,
      });

      this.redisSub = this.redisClient.duplicate();

      // Connect to Redis
      await this.redisClient.connect();
      await this.redisSub.connect();

      // Set up Redis adapter for Socket.io
      this.io.adapter(createAdapter(this.redisClient, this.redisSub));

      logger.info('Redis adapter configured for Socket.io scaling', {
        redisHost: config.REDIS_HOST,
        redisPort: config.REDIS_PORT,
      });

    } catch (error) {
      logger.warn('Redis adapter setup failed, running without scaling', {
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      
      // Continue without Redis if it's not available
      // Socket.io will work in single-instance mode
    }
  }

  private setupConnectionMonitoring(): void {
    // Track connection metrics
    this.io.on('connection', (socket: any) => {
      const connectionCount = this.io.engine.clientsCount;
      
      logger.info('Client connected', {
        socketId: socket.id,
        userId: (socket as any).userId,
        totalConnections: connectionCount,
        userAgent: socket.handshake.headers['user-agent'],
        ip: socket.handshake.address,
      });

      socket.on('disconnect', (reason) => {
        const remainingConnections = this.io.engine.clientsCount;
        
        logger.info('Client disconnected', {
          socketId: socket.id,
          userId: (socket as any).userId,
          reason,
          remainingConnections,
          connectedTime: Date.now() - socket.handshake.time,
        });
      });

      // Track socket errors
      socket.on('error', (error: unknown) => {
        logger.error('Socket error', {
          socketId: socket.id,
          userId: (socket as any).userId,
          error: getErrorMessage(error),
          stack: error.stack,
        });
      });
    });

    // Log server-level events
    this.io.engine.on('connection_error', (error: unknown) => {
      logger.error('Socket.io connection error', {
        error: getErrorMessage(error),
        code: error.code,
        context: error.context,
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      if (!this.isStarted)`;
      logger.info('Gracefully shutting down Socket.io server...');
      
      try {
        // Close all socket connections
        this.io.close((err) => {
          if (err) {
            logger.error('Error closing Socket.io server', { error: err.message});
          } else {
            logger.info('Socket.io server closed successfully');
          }
        });

        // Close Redis connections
        if (this.redisClient) {
          await this.redisClient.quit();
          logger.info('Redis client disconnected');
        }
        
        if (this.redisSub) {
          await this.redisSub.quit();
          logger.info('Redis subscriber disconnected');
        }

        this.isStarted = false;
        
      } catch (error) {
        logger.error('Error during Socket.io shutdown', {
          error: error instanceof Error ? getErrorMessage(error) : error,
        });
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  public getIO(): SocketIOServer {
    return this.io;
  }

  public isReady(): boolean {
    return this.isStarted;
  }

  public getConnectionCount(): number {
    return this.io.engine.clientsCount;
  }

  public async getStats(req: Request, res: Response): Promise<void> {
    return {
      connections: this.io.engine.clientsCount,
      rooms: this.io.sockets.adapter.rooms.size,
      adapters: this.redisClient ? ['redis'] : ['memory'],
      uptime: Date.now() - this.io.engine.server.startTime,
    };
  }
}