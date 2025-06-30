import { Pool, PoolConfig } from 'pg';
import Redis from 'ioredis';
import winston from 'winston';

// Database configuration interface
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

// Redis configuration interface
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

// Database configuration
export const getDatabaseConfig = (): DatabaseConfig => {
  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'aeturnis_online',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl: process.env.DATABASE_URL?.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
  };
};

// Redis configuration
export const getRedisConfig = (): RedisConfig => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'aeturnis:',
  };
};

// PostgreSQL connection pool
let pool: Pool | null = null;

export const getDatabase = (): Pool => {
  if (!pool) {
    const config = getDatabaseConfig();
    pool = new Pool(config);
    
    pool.on('error', (err) => {
      winston.error('Database pool error:', err);
    });

    pool.on('connect', () => {
      winston.info('Database connected successfully');
    });
  }
  
  return pool;
};

// Redis connection
let redisClient: Redis | null = null;

export const getRedis = (): Redis => {
  if (!redisClient) {
    const config = getRedisConfig();
    
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      winston.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      winston.info('Redis connected successfully');
    });

    redisClient.on('ready', () => {
      winston.info('Redis is ready to accept commands');
    });
  }
  
  return redisClient;
};

// Initialize database tables
export const initializeDatabase = async (): Promise<void> => {
  const db = getDatabase();
  
  try {
    // Create users table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email_verified BOOLEAN DEFAULT FALSE,
        email_verification_token VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE
      );
    `);

    // Create indexes for better performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
    `);

    // Create updated_at trigger function
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create trigger for users table
    await db.query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    winston.info('Database initialization completed successfully');
  } catch (error) {
    winston.error('Database initialization failed:', error);
    throw error;
  }
};

// Test database connection
export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    const db = getDatabase();
    const result = await db.query('SELECT NOW()');
    winston.info('Database connection test successful:', result.rows[0]);
    return true;
  } catch (error) {
    winston.error('Database connection test failed:', error);
    return false;
  }
};

// Test Redis connection
export const testRedisConnection = async (): Promise<boolean> => {
  try {
    const redis = getRedis();
    await redis.ping();
    winston.info('Redis connection test successful');
    return true;
  } catch (error) {
    winston.error('Redis connection test failed:', error);
    return false;
  }
};

// Graceful shutdown
export const closeConnections = async (): Promise<void> => {
  const promises: Promise<void>[] = [];
  
  if (pool) {
    promises.push(pool.end());
  }
  
  if (redisClient) {
    promises.push(redisClient.quit());
  }
  
  await Promise.all(promises);
  winston.info('All database connections closed');
};