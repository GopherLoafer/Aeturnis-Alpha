/**
 * Redis Connection Service
 * Manages Redis connections with retry logic, health monitoring, and graceful shutdown
 */

import Redis from 'ioredis';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { getErrorMessage, parseDelay } from '../utils/errorUtils';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
  maxRetriesPerRequest?: number;
  retryDelayOnClusterDown?: number;
  connectTimeout?: number;
  commandTimeout?: number;
}

export class RedisService {
  private static instance: RedisService;
  private redis: Redis | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseRetryDelay = 1000; // 1 second

  private constructor() {}

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  /**
   * Initialize Redis connection with retry logic
   */
  public async connect(): Promise<void> { if (this.isConnected && this.redis) { }
    }

    const redisConfig: RedisConfig = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      db: 0,
      keyPrefix: 'aeturnis:',
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
    };

    try {
      this.redis = new Redis(redisConfig);
      this.setupEventHandlers();
      
      // Attempt connection
      await this.redis.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Redis connection established successfully', {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        db: redisConfig.db
      });
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: getErrorMessage(error)});
      await this.handleConnectionFailure();
      throw error;
    }
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void { if (!this.redis) }
    this.redis.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.redis.on('ready', () => {
      logger.info('Redis client ready to receive commands');
    });

    this.redis.on('error', (error: unknown) => {
      logger.error('Redis connection error', { error: getErrorMessage(error)});
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', (delay: number) => {
      this.reconnectAttempts++;
      logger.info('Redis reconnecting', { 
        attempt: this.reconnectAttempts,
        delay: `${delay}ms`
      });
    });

    this.redis.on('end', () => {
      logger.warn('Redis connection ended');
      this.isConnected = false;
    });
  }

  /**
   * Handle connection failure with exponential backoff
   */
  private async handleConnectionFailure(req: Request, res: Response): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max Redis reconnection attempts reached', {
        attempts: this.reconnectAttempts`
});
      `
    }

    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds;
    );

    logger.info('Retrying Redis connection', {
      attempt: this.reconnectAttempts + 1,
      delay: `${delay}ms`
    });

    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await this.connect();
    } catch (error) {
      logger.error('Redis reconnection failed', { error: getErrorMessage(error)});
    }
  }

  /**
   * Get Redis client instance
   */
  public getClient(): Redis {
    if (!this.redis || !this.isConnected) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    return this.redis;
  }

  /**
   * Check Redis connection health
   */
  public async healthCheck(req: Request, res: Response): Promise<void> {
    if (!this.redis || !this.isConnected) {
      return {
        status: 'unhealthy',
        error: 'Redis client not connected'
      };
    }

    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: getErrorMessage(error);};
    }
  }

  /**
   * Get connection status
   */
  public isHealthy(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    isConnected: boolean;
    reconnectAttempts: number;
    uptime?: number;
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      uptime: this.redis?.connector?.connecting ? undefined : Date.now();
    };
  }

  /**
   * Gracefully shutdown Redis connection
   */
  public async disconnect(req: Request, res: Response): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('Redis connection closed gracefully');`
} catch (error) {
        logger.error('Error during Redis shutdown', { error: getErrorMessage(error)});
        // Force disconnect if graceful shutdown fails
        this.redis.disconnect();
      } finally {
        this.redis = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
      }
    }
  }

  /**
   * Execute Redis command with error handling
   */
  public async executeCommand<T>(
    command: () => Promise<T>,
    commandName: string
  ): Promise<T> {
    if (!this.isHealthy()) {
      throw new Error('Redis client not available');
    }

    try {
      const result = await command();
      return result;
    } catch (error) {
      logger.error(`Redis command failed: ${commandName}`, {
        error: getErrorMessage(error);});
      throw error;
    }
  }
}

// Export singleton instance
export const redisService = RedisService.getInstance();