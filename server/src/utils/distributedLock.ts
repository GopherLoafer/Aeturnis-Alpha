/**
 * Distributed Lock Implementation
 * Uses Redlock pattern for distributed locking across Redis instances
 */

import { v4 as uuidv4 } from 'uuid';
import { redisService } from '../services/RedisService';
import { logger } from './logger';

export interface LockOptions {
  retryCount?: number;
  retryDelay?: number;
  clockDriftFactor?: number;
  automaticExtensionThreshold?: number;
}

export interface Lock {
  resource: string;
  value: string;
  expiration: number;
  attemptsRemaining: number;
}

export class DistributedLock {
  private static instance: DistributedLock;
  private readonly keyPrefix = 'lock:';
  private readonly defaultRetryCount = 3;
  private readonly defaultRetryDelay = 200; // milliseconds
  private readonly clockDriftFactor = 0.01; // 1%

  private constructor() {}

  public static getInstance(): DistributedLock {
    if (!DistributedLock.instance) {
      DistributedLock.instance = new DistributedLock();
    }
    return DistributedLock.instance;
  }

  /**
   * Acquire a distributed lock
   */
  public async acquireLock(
    resource: string,
    ttl: number,
    options: LockOptions = {}
  ): Promise<Lock | null> {
    const {
      retryCount = this.defaultRetryCount,
      retryDelay = this.defaultRetryDelay,
    } = options;

    const lockKey = this.buildLockKey(resource);
    const lockValue = uuidv4();
    const expiration = Date.now() + ttl;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const acquired = await this.tryAcquireLock(lockKey, lockValue, ttl);
        
        if (acquired) {
          const lock: Lock = {
            resource,
            value: lockValue,
            expiration,
            attemptsRemaining: retryCount - attempt
          };

          logger.debug('Distributed lock acquired', {
            resource,
            lockValue,
            ttl,
            attempt: attempt + 1
          });

          return lock;
        }

        // Wait before retry (except on last attempt)
        if (attempt < retryCount) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      } catch (error) {
        logger.error('Error acquiring distributed lock', {
          resource,
          attempt: attempt + 1,
          error: error.message
        });
      }
    }

    logger.warn('Failed to acquire distributed lock after retries', {
      resource,
      retryCount: retryCount + 1
    });

    return null;
  }

  /**
   * Release a distributed lock
   */
  public async releaseLock(lock: Lock): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const lockKey = this.buildLockKey(lock.resource);

      // Use Lua script to ensure atomic check-and-delete
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redis.eval(luaScript, 1, lockKey, lock.value) as number;
      const released = result === 1;

      if (released) {
        logger.debug('Distributed lock released', {
          resource: lock.resource,
          lockValue: lock.value
        });
      } else {
        logger.warn('Failed to release distributed lock - lock not owned or expired', {
          resource: lock.resource,
          lockValue: lock.value
        });
      }

      return released;
    } catch (error) {
      logger.error('Error releasing distributed lock', {
        resource: lock.resource,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Extend a distributed lock TTL
   */
  public async extendLock(lock: Lock, additionalTtl: number): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const lockKey = this.buildLockKey(lock.resource);

      // Use Lua script to ensure atomic check-and-extend
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("PEXPIRE", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await redis.eval(
        luaScript, 
        1, 
        lockKey, 
        lock.value, 
        additionalTtl.toString()
      ) as number;

      const extended = result === 1;

      if (extended) {
        lock.expiration = Date.now() + additionalTtl;
        logger.debug('Distributed lock extended', {
          resource: lock.resource,
          additionalTtl,
          newExpiration: lock.expiration
        });
      }

      return extended;
    } catch (error) {
      logger.error('Error extending distributed lock', {
        resource: lock.resource,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Execute function with distributed lock
   */
  public async withLock<T>(
    resource: string,
    ttl: number,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lock = await this.acquireLock(resource, ttl, options);
    
    if (!lock) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }

    try {
      const startTime = Date.now();
      const result = await fn();
      const executionTime = Date.now() - startTime;

      logger.debug('Function executed with distributed lock', {
        resource,
        executionTime: `${executionTime}ms`,
        lockValue: lock.value
      });

      return result;
    } finally {
      await this.releaseLock(lock);
    }
  }

  /**
   * Check if a resource is currently locked
   */
  public async isLocked(resource: string): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const lockKey = this.buildLockKey(resource);
      
      const result = await redis.exists(lockKey);
      return result === 1;
    } catch (error) {
      logger.error('Error checking lock status', {
        resource,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get lock information for a resource
   */
  public async getLockInfo(resource: string): Promise<{
    isLocked: boolean;
    ttl?: number;
    value?: string;
  }> {
    try {
      const redis = redisService.getClient();
      const lockKey = this.buildLockKey(resource);
      
      const pipeline = redis.pipeline();
      pipeline.exists(lockKey);
      pipeline.ttl(lockKey);
      pipeline.get(lockKey);
      
      const results = await pipeline.exec();
      
      const exists = results?.[0]?.[1] as number;
      const ttl = results?.[1]?.[1] as number;
      const value = results?.[2]?.[1] as string;

      return {
        isLocked: exists === 1,
        ttl: ttl > 0 ? ttl : undefined,
        value: value || undefined
      };
    } catch (error) {
      logger.error('Error getting lock info', {
        resource,
        error: error.message
      });
      return { isLocked: false };
    }
  }

  /**
   * Force release a lock (use with caution)
   */
  public async forceReleaseLock(resource: string): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const lockKey = this.buildLockKey(resource);
      
      const result = await redis.del(lockKey);
      const released = result > 0;

      if (released) {
        logger.warn('Distributed lock force released', { resource });
      }

      return released;
    } catch (error) {
      logger.error('Error force releasing lock', {
        resource,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clean up expired locks
   */
  public async cleanupExpiredLocks(): Promise<number> {
    try {
      const redis = redisService.getClient();
      const pattern = `${this.keyPrefix}*`;
      let cleanedCount = 0;
      let cursor = '0';

      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        for (const key of keys) {
          const ttl = await redis.ttl(key);
          
          // Remove locks that have expired or have no TTL
          if (ttl === -1 || ttl === -2) {
            const deleted = await redis.del(key);
            if (deleted > 0) {
              cleanedCount++;
            }
          }
        }
      } while (cursor !== '0');

      if (cleanedCount > 0) {
        logger.info('Expired locks cleanup completed', { cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired locks', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get lock statistics
   */
  public async getLockStats(): Promise<{
    totalLocks: number;
    activeLocks: number;
    expiredLocks: number;
  }> {
    try {
      const redis = redisService.getClient();
      const pattern = `${this.keyPrefix}*`;
      let totalLocks = 0;
      let activeLocks = 0;
      let expiredLocks = 0;
      let cursor = '0';

      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        for (const key of keys) {
          totalLocks++;
          const ttl = await redis.ttl(key);
          
          if (ttl > 0) {
            activeLocks++;
          } else {
            expiredLocks++;
          }
        }
      } while (cursor !== '0');

      return {
        totalLocks,
        activeLocks,
        expiredLocks
      };
    } catch (error) {
      logger.error('Error getting lock stats', {
        error: error.message
      });
      return {
        totalLocks: 0,
        activeLocks: 0,
        expiredLocks: 0
      };
    }
  }

  /**
   * Try to acquire lock atomically
   */
  private async tryAcquireLock(key: string, value: string, ttl: number): Promise<boolean> {
    const redis = redisService.getClient();
    
    // Use SET with NX (only if not exists) and PX (expire in milliseconds)
    const result = await redis.set(key, value, 'PX', ttl, 'NX');
    return result === 'OK';
  }

  /**
   * Build lock key with prefix
   */
  private buildLockKey(resource: string): string {
    const cleanResource = resource.replace(/[^a-zA-Z0-9:_-]/g, '_');
    return `${this.keyPrefix}${cleanResource}`;
  }

  /**
   * Delay utility for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const distributedLock = DistributedLock.getInstance();

// Export convenience functions
export const acquireLock = (resource: string, ttl: number, options?: LockOptions) => 
  distributedLock.acquireLock(resource, ttl, options);

export const releaseLock = (lock: Lock) => 
  distributedLock.releaseLock(lock);

export const withLock = <T>(resource: string, ttl: number, fn: () => Promise<T>, options?: LockOptions) => 
  distributedLock.withLock(resource, ttl, fn, options);