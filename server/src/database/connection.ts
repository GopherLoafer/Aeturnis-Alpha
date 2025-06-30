import pg from 'pg';
import { DatabaseConnection, RedisConnection } from '@/types';
import winston from 'winston';

const { Pool } = pg;

// Logger configuration
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'aeturnis-online' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Database connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis connection - optional for development
export let redis: any = null;

// Only initialize Redis if URL is provided
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });

    redis.on('error', (error: any) => {
      logger.warn('Redis connection error, disabling cache:', error.message);
      redis = null;
    });
  } catch (error) {
    logger.warn('Redis initialization failed, continuing without cache');
    redis = null;
  }
} else {
  logger.info('Redis not configured, authentication will work without refresh tokens');
}

// Database connection test
export async function testDatabaseConnection(): Promise<DatabaseConnection> {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful');
    return { isConnected: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
    logger.error('Database connection failed:', error);
    return { isConnected: false, lastError: errorMessage };
  }
}

// Redis connection test
export async function testRedisConnection(): Promise<RedisConnection> {
  try {
    if (!redis) {
      return { isConnected: false, lastError: 'Redis not initialized' };
    }
    await redis.ping();
    logger.info('Redis connection successful');
    return { isConnected: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown Redis error';
    logger.error('Redis connection failed:', error);
    return { isConnected: false, lastError: errorMessage };
  }
}

// Graceful shutdown
export async function closeConnections(): Promise<void> {
  try {
    await pool.end();
    if (redis) {
      await redis.quit();
    }
    logger.info('Database and Redis connections closed gracefully');
  } catch (error) {
    logger.error('Error closing connections:', error);
  }
}