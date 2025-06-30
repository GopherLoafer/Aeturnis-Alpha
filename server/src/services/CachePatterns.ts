/**
 * Cache Patterns Service
 * Implements Cache-Aside, Write-Through, and cache warming patterns
 */

import { cacheManager } from './CacheManager';
import { logger } from '../utils/logger';

export interface CacheAsideOptions {
  ttl?: number;
  refreshThreshold?: number; // Percentage of TTL remaining to trigger refresh
  backgroundRefresh?: boolean;
}

export interface WriteThoughOptions {
  ttl?: number;
  writeRetries?: number;
}

export type DataLoader<T> = () => Promise<T>;
export type DataWriter<T> = (data: T) => Promise<void>;

export class CachePatterns {
  private static instance: CachePatterns;
  private backgroundRefreshTasks = new Map<string, NodeJS.Timeout>();

  private constructor() {}

  public static getInstance(): CachePatterns {
    if (!CachePatterns.instance) {
      CachePatterns.instance = new CachePatterns();
    }
    return CachePatterns.instance;
  }

  /**
   * Cache-Aside Pattern
   * Load from cache, fallback to data source if miss
   */
  public async cacheAside<T>(
    key: string,
    loader: DataLoader<T>,
    options: CacheAsideOptions = {}
  ): Promise<T> {
    const { ttl = 3600, refreshThreshold = 0.1, backgroundRefresh = true } = options;

    try {
      // Try to get from cache first
      const cached = await cacheManager.get<T>(key);
      
      if (cached !== null) {
        // Check if we should trigger background refresh
        if (backgroundRefresh && refreshThreshold > 0) {
          const remainingTTL = await cacheManager.getTTL(key);
          const refreshTrigger = ttl * refreshThreshold;
          
          if (remainingTTL > 0 && remainingTTL <= refreshTrigger) {
            this.scheduleBackgroundRefresh(key, loader, ttl);
          }
        }
        
        logger.debug('Cache hit', { key });
        return cached;
      }

      // Cache miss - load from data source
      logger.debug('Cache miss, loading from source', { key });
      const data = await loader();
      
      // Store in cache
      await cacheManager.set(key, data, { ttl });
      
      return data;
    } catch (error) {
      logger.error('Cache-aside operation failed', {
        key,
        error: error.message
      });
      
      // Fallback to data source on cache error
      return await loader();
    }
  }

  /**
   * Write-Through Pattern
   * Write to cache and data store simultaneously
   */
  public async writeThrough<T>(
    key: string,
    data: T,
    writer: DataWriter<T>,
    options: WriteThoughOptions = {}
  ): Promise<void> {
    const { ttl = 3600, writeRetries = 3 } = options;

    let writeSuccess = false;
    let lastError: Error | null = null;

    // Attempt to write to data store with retries
    for (let attempt = 1; attempt <= writeRetries; attempt++) {
      try {
        await writer(data);
        writeSuccess = true;
        break;
      } catch (error) {
        lastError = error;
        logger.warn(`Write-through data store write failed, attempt ${attempt}`, {
          key,
          error: error.message
        });
        
        if (attempt < writeRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    if (!writeSuccess) {
      logger.error('Write-through data store write failed after retries', {
        key,
        error: lastError?.message
      });
      throw lastError || new Error('Write-through failed');
    }

    // Write to cache (fire and forget - don't fail on cache errors)
    try {
      await cacheManager.set(key, data, { ttl });
      logger.debug('Write-through cache updated', { key });
    } catch (error) {
      logger.warn('Write-through cache update failed', {
        key,
        error: error.message
      });
    }
  }

  /**
   * Write-Behind Pattern (Write-Back)
   * Write to cache immediately, async write to data store
   */
  public async writeBehind<T>(
    key: string,
    data: T,
    writer: DataWriter<T>,
    options: WriteThoughOptions = {}
  ): Promise<void> {
    const { ttl = 3600 } = options;

    // Write to cache immediately
    await cacheManager.set(key, data, { ttl });
    logger.debug('Write-behind cache updated', { key });

    // Async write to data store
    setImmediate(async () => {
      try {
        await writer(data);
        logger.debug('Write-behind data store updated', { key });
      } catch (error) {
        logger.error('Write-behind data store update failed', {
          key,
          error: error.message
        });
        // TODO: Could implement a retry queue here
      }
    });
  }

  /**
   * Cache warming - preload data
   */
  public async warmCache<T>(
    key: string,
    loader: DataLoader<T>,
    ttl = 3600
  ): Promise<boolean> {
    try {
      logger.debug('Warming cache', { key });
      const data = await loader();
      await cacheManager.set(key, data, { ttl });
      logger.info('Cache warmed successfully', { key });
      return true;
    } catch (error) {
      logger.error('Cache warming failed', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Bulk cache warming
   */
  public async warmCacheBulk<T>(
    items: Array<{
      key: string;
      loader: DataLoader<T>;
      ttl?: number;
    }>,
    concurrency = 5
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process in batches to control concurrency
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      
      const promises = batch.map(async item => {
        try {
          await this.warmCache(item.key, item.loader, item.ttl);
          return true;
        } catch {
          return false;
        }
      });

      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
        }
      });
    }

    logger.info('Bulk cache warming completed', {
      total: items.length,
      success,
      failed
    });

    return { success, failed };
  }

  /**
   * Refresh cache entry
   */
  public async refreshCache<T>(
    key: string,
    loader: DataLoader<T>,
    ttl = 3600
  ): Promise<T> {
    try {
      logger.debug('Refreshing cache', { key });
      const data = await loader();
      await cacheManager.set(key, data, { ttl });
      return data;
    } catch (error) {
      logger.error('Cache refresh failed', {
        key,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get or set pattern (cache-aside with single call)
   */
  public async getOrSet<T>(
    key: string,
    loader: DataLoader<T>,
    ttl = 3600
  ): Promise<T> {
    return this.cacheAside(key, loader, { ttl });
  }

  /**
   * Invalidate cache pattern
   */
  public async invalidate(key: string): Promise<boolean> {
    try {
      const result = await cacheManager.delete(key);
      logger.debug('Cache invalidated', { key, success: result });
      return result;
    } catch (error) {
      logger.error('Cache invalidation failed', {
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Invalidate cache pattern by prefix
   */
  public async invalidatePattern(pattern: string): Promise<number> {
    try {
      const count = await cacheManager.deletePattern(pattern);
      logger.info('Cache pattern invalidated', { pattern, count });
      return count;
    } catch (error) {
      logger.error('Cache pattern invalidation failed', {
        pattern,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Tag-based cache invalidation
   */
  public async taggedCache<T>(
    key: string,
    tags: string[],
    loader: DataLoader<T>,
    ttl = 3600
  ): Promise<T> {
    // Store the data
    const data = await this.cacheAside(key, loader, { ttl });
    
    // Add to tag sets
    for (const tag of tags) {
      await cacheManager.addToSet(`tag:${tag}`, key);
      await cacheManager.expire(`tag:${tag}`, ttl + 300); // Extra 5 minutes
    }
    
    return data;
  }

  /**
   * Invalidate by tag
   */
  public async invalidateByTag(tag: string): Promise<number> {
    try {
      const keys = await cacheManager.getSetMembers<string>(`tag:${tag}`);
      let invalidated = 0;
      
      for (const key of keys) {
        const success = await cacheManager.delete(key);
        if (success) invalidated++;
      }
      
      // Clean up the tag set
      await cacheManager.delete(`tag:${tag}`);
      
      logger.info('Cache invalidated by tag', { tag, count: invalidated });
      return invalidated;
    } catch (error) {
      logger.error('Tag-based cache invalidation failed', {
        tag,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Schedule background refresh
   */
  private scheduleBackgroundRefresh<T>(
    key: string,
    loader: DataLoader<T>,
    ttl: number
  ): void {
    // Cancel existing refresh task
    const existingTask = this.backgroundRefreshTasks.get(key);
    if (existingTask) {
      clearTimeout(existingTask);
    }

    // Schedule new refresh
    const task = setTimeout(async () => {
      try {
        await this.refreshCache(key, loader, ttl);
        logger.debug('Background refresh completed', { key });
      } catch (error) {
        logger.error('Background refresh failed', {
          key,
          error: error.message
        });
      } finally {
        this.backgroundRefreshTasks.delete(key);
      }
    }, 1000); // 1 second delay

    this.backgroundRefreshTasks.set(key, task);
  }

  /**
   * Cleanup background tasks
   */
  public cleanup(): void {
    this.backgroundRefreshTasks.forEach(task => clearTimeout(task));
    this.backgroundRefreshTasks.clear();
  }
}

// Export singleton instance
export const cachePatterns = CachePatterns.getInstance();

// Common cache key generators
export const CacheKeys = {
  user: (userId: string) => `user:${userId}:profile`,
  character: (charId: string) => `char:${charId}:data`,
  session: (sessionId: string) => `session:${sessionId}`,
  rateLimit: (userId: string, action: string) => `ratelimit:${userId}:${action}`,
  temp: (purpose: string, id: string) => `temp:${purpose}:${id}`,
  leaderboard: (type: string) => `leaderboard:${type}`,
  guild: (guildId: string) => `guild:${guildId}:data`,
  zone: (zoneId: string) => `zone:${zoneId}:data`,
  combat: (sessionId: string) => `combat:${sessionId}:state`,
  inventory: (charId: string) => `char:${charId}:inventory`,
  skills: (charId: string) => `char:${charId}:skills`,
  achievements: (userId: string) => `user:${userId}:achievements`,
  friends: (userId: string) => `user:${userId}:friends`,
  settings: (userId: string) => `user:${userId}:settings`
};

// Export convenience functions
export const cacheAside = <T>(key: string, loader: DataLoader<T>, options?: CacheAsideOptions) =>
  cachePatterns.cacheAside(key, loader, options);

export const writeThrough = <T>(key: string, data: T, writer: DataWriter<T>, options?: WriteThoughOptions) =>
  cachePatterns.writeThrough(key, data, writer, options);

export const getOrSet = <T>(key: string, loader: DataLoader<T>, ttl?: number) =>
  cachePatterns.getOrSet(key, loader, ttl);

export const invalidateCache = (key: string) =>
  cachePatterns.invalidate(key);

export const invalidateCachePattern = (pattern: string) =>
  cachePatterns.invalidatePattern(pattern);