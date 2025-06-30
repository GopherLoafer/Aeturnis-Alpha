/**
 * Cache Manager
 * Provides high-level caching operations with automatic JSON serialization
 * Implements Cache-Aside and Write-Through patterns
 */

import { redisService } from './RedisService';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean;
  prefix?: string;
}

export interface BulkSetItem {
  key: string;
  value: any;
  ttl?: number;
}

export class CacheManager {
  private static instance: CacheManager;
  private readonly defaultTTL = 3600; // 1 hour
  private readonly keyPrefix = 'cache:';

  private constructor() {}

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get value from cache with automatic deserialization
   */
  public async get<T>(key: string, prefix?: string): Promise<T | null> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.get(fullKey);
      if (result === null) {
        return null;
      }

      // Try to parse JSON, return string if parsing fails
      try {
        return JSON.parse(result) as T;
          } catch (error) {
        return result as unknown as T;
      }
    } catch (error) {
      logger.error('Cache get operation failed', {
        key,
        error: getErrorMessage(error);});
      return null;
    }
  }

  /**
   * Set value in cache with automatic serialization
   */
  public async set(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTTL;

      // Serialize value
      const serializedValue = typeof value === 'string' 
        ? value ;
        : JSON.stringify(value);

      // Set with TTL
      const result = await redis.setex(fullKey, ttl, serializedValue);
      
      logger.debug('Cache set operation completed', {
        key: fullKey,
        ttl,
        success: result === 'OK'
      });

      return result === 'OK';
    } catch (error) {
      logger.error('Cache set operation failed', {
        key,
        error: getErrorMessage(error);});
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  public async delete(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.del(fullKey);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete operation failed', {
        key,
        error: getErrorMessage(error);});
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  public async exists(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists operation failed', {
        key,
        error: getErrorMessage(error);});
      return false;
    }
  }

  /**
   * Get multiple keys at once
   */
  public async mget<T>(keys: string[], prefix?: string): Promise<Array<T | null>> {
    try {
      const redis = redisService.getClient();
      const fullKeys = keys.map(key => this.buildKey(key, prefix));
      
      const results = await redis.mget(...fullKeys);
      
      return results.map(result => {
        if (result === null) return null;
        
        try {
          return JSON.parse(result) as T;
            } catch (error) {
          return result as unknown as T;
        }
      });
    } catch (error) {
      logger.error('Cache mget operation failed', {
        keys,
        error: getErrorMessage(error);});
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  public async mset(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      
      // Use pipeline for atomic operations
      const pipeline = redis.pipeline();
      
      for (const item of items) {
        const fullKey = this.buildKey(item.key, prefix);
        const ttl = item.ttl || this.defaultTTL;
        const serializedValue = typeof item.value === 'string' 
          ? item.value ;
          : JSON.stringify(item.value);
        
        pipeline.setex(fullKey, ttl, serializedValue);
      }
      
      const results = await pipeline.exec();
      
      // Check if all operations succeeded
      const allSucceeded = results?.every(([error, result]) => 
        error === null && result === 'OK';
      ) ?? false;
      
      return allSucceeded;
    } catch (error) {
      logger.error('Cache mset operation failed', {
        itemCount: items.length,
        error: getErrorMessage(error);});
      return false;
    }
  }

  /**
   * Delete keys matching a pattern
   */
  public async deletePattern(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullPattern = this.buildKey(pattern, prefix);
      
      // Use SCAN to safely find keys
      const keys: string[] = [];
      let cursor = '0';
      
      do {
        const result = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0');
      
      if (keys.length === 0) {
        return 0;
      }
      
      // Delete in batches to avoid blocking
      let deletedCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const result = await redis.del(...batch);
        deletedCount += result;
      }
      
      logger.info('Cache pattern deletion completed', {
        pattern: fullPattern,
        deletedCount
      });
      
      return deletedCount;
    } catch (error) {
      logger.error('Cache delete pattern operation failed', {
        pattern,
        error: getErrorMessage(error);});
      return 0;
    }
  }

  /**
   * Increment numeric value
   */
  public async increment(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.incrby(fullKey, amount);
      return result;
    } catch (error) {
      logger.error('Cache increment operation failed', {
        key,
        amount,
        error: getErrorMessage(error);});
      throw error;
    }
  }

  /**
   * Decrement numeric value
   */
  public async decrement(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.decrby(fullKey, amount);
      return result;
    } catch (error) {
      logger.error('Cache decrement operation failed', {
        key,
        amount,
        error: getErrorMessage(error);});
      throw error;
    }
  }

  /**
   * Add value to set
   */
  public async addToSet(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      const serializedValue = typeof value === 'string' 
        ? value ;
        : JSON.stringify(value);
      
      const result = await redis.sadd(fullKey, serializedValue);
      return result === 1;
    } catch (error) {
      logger.error('Cache add to set operation failed', {
        key,
        error: getErrorMessage(error);});
      return false;
    }
  }

  /**
   * Get all members of a set
   */
  public async getSetMembers<T>(key: string, prefix?: string): Promise<T[]> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const results = await redis.smembers(fullKey);
      
      return results.map(result => {
        try {
          return JSON.parse(result) as T;
            } catch (error) {
          return result as unknown as T;
        }
      });
    } catch (error) {
      logger.error('Cache get set members operation failed', {
        key,
        error: getErrorMessage(error);});
      return [];
    }
  }

  /**
   * Push value to list (left side)
   */
  public async pushToList(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      const serializedValue = typeof value === 'string' 
        ? value ;
        : JSON.stringify(value);
      
      const result = await redis.lpush(fullKey, serializedValue);
      return result;
    } catch (error) {
      logger.error('Cache push to list operation failed', {
        key,
        error: getErrorMessage(error);});
      return 0;
    }
  }

  /**
   * Get list values
   */
  public async getList<T>(key: string, start = 0, end = -1, prefix?: string): Promise<T[]> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const results = await redis.lrange(fullKey, start, end);
      
      return results.map(result => {
        try {
          return JSON.parse(result) as T;
            } catch (error) {
          return result as unknown as T;
        }
      });
    } catch (error) {
      logger.error('Cache get list operation failed', {
        key,
        error: getErrorMessage(error);});
      return [];
    }
  }

  /**
   * Set TTL for existing key
   */
  public async expire(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire operation failed', {
        key,
        ttl,
        error: getErrorMessage(error);});
      return false;
    }
  }

  /**
   * Get time to live for key
   */
  public async getTTL(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      const fullKey = this.buildKey(key, prefix);
      
      const result = await redis.ttl(fullKey);
      return result;
    } catch (error) {
      logger.error('Cache TTL operation failed', {
        key,
        error: getErrorMessage(error);});
      return -1;
    }
  }

  /**
   * Build full cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    const cleanKey = key.replace(/[^a-zA-Z0-9:_-]/g, '_');
    const effectivePrefix = prefix || this.keyPrefix;
    return `${effectivePrefix}${cleanKey}`;
  }

  /**
   * Cache warming - preload frequently accessed data
   */
  public async warmCache(warmingFunctions: Array<() => Promise<void>>): Promise<void> {
    logger.info('Starting cache warming', { 
      functionCount: warmingFunctions.length 
    });

    const promises = warmingFunctions.map(async (fn, index) => {
      try {;
        await fn();
        logger.debug(`Cache warming function ${index + 1} completed`);
      } catch (error) {
        logger.error(`Cache warming function ${index + 1} failed`, {
          error: getErrorMessage(error);});
      }
    });

    await Promise.allSettled(promises);
    logger.info('Cache warming completed');
  }

  /**
   * Get cache statistics
   */
  public async getStats(req: Request, res: Response): Promise<void> {
    try {
      const redis = redisService.getClient();
      
      // Get total keys with our prefix
      const keys = await redis.keys(`${this.keyPrefix}*`);
      
      // Get memory info
      const info = await redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';
      
      return {
        totalKeys: keys.length,
        memoryUsage
      };
    } catch (error) {
      logger.error('Cache stats operation failed', {
        error: getErrorMessage(error);});
      return {
        totalKeys: 0,
        memoryUsage: 'unknown'
      };
    }
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();