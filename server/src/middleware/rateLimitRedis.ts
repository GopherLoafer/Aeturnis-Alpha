/**
 * Redis-Based Rate Limiting Middleware
 * Implements sliding window algorithm with per-IP and per-user support
 */

import { Request, Response, NextFunction } from 'express';
import { redisService } from '../services/RedisService';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: Request, res: Response) => void;
  whitelist?: string[];
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

export class RedisRateLimiter {
  private static instance: RedisRateLimiter;
  private readonly keyPrefix = 'ratelimit:';

  private constructor() {}

  public static getInstance(): RedisRateLimiter {
    if (!RedisRateLimiter.instance) {
      RedisRateLimiter.instance = new RedisRateLimiter();
    }
    return RedisRateLimiter.instance;
  }

  /**
   * Create rate limiting middleware
   */
  public createMiddleware(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Skip if Redis is not available
        if (!redisService.isHealthy()) {
          logger.warn('Redis not available, skipping rate limiting');
          return next();
        }

        // Generate rate limit key
        const key = config.keyGenerator ? config.keyGenerator(req) : this.defaultKeyGenerator(req);
        
        // Check whitelist
        if (config.whitelist && config.whitelist.includes(key)) {
          return next();
        }

        // Check rate limit
        const result = await this.checkRateLimit(key, config);

        // Set response headers
        res.set({
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toString(),
          'X-RateLimit-Window': config.windowMs.toString()
        });

        if (!result.allowed) {
          // Rate limit exceeded
          const message = config.message || 'Too many requests, please try again later';
          
          logger.warn('Rate limit exceeded', {
            key,
            totalRequests: result.totalRequests,
            maxRequests: config.maxRequests,
            windowMs: config.windowMs,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });

          if (config.onLimitReached) {
            config.onLimitReached(req, res);
          }

          res.status(429).json({
            error: 'Too Many Requests',
            message,
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          });
          return;
        }

        next();
      } catch (error) {
        logger.error('Rate limiting error', {
          error: getErrorMessage(error),
          ip: req.ip
        });
        // On error, allow the request to proceed
        next();
      }
    };
  }

  /**
   * Check rate limit using sliding window algorithm
   */
  public async checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redis = redisService.getClient();
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const redisKey = this.buildKey(key);

    // Use Lua script for atomic operations
    const luaScript = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])

      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

      -- Count current requests in window
      local current_requests = redis.call('ZCARD', key)

      -- Calculate remaining requests
      local remaining = math.max(0, max_requests - current_requests)
      
      -- Calculate reset time (end of current window)
      local reset_time = now + window_ms

      if current_requests < max_requests then
        -- Add current request to sorted set
        redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
        -- Set expiration for cleanup
        redis.call('EXPIRE', key, math.ceil(window_ms / 1000) + 1)
        return {1, remaining - 1, reset_time, current_requests + 1}
      else
        return {0, remaining, reset_time, current_requests}
      end
    `;

    const result = await redis.eval(
      luaScript,
      1,
      redisKey,
      windowStart.toString(),
      now.toString(),
      config.maxRequests.toString(),
      config.windowMs.toString()
    ) as [number, number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetTime: result[2],
      totalRequests: result[3]
    };
  }

  /**
   * Get rate limit status for a key
   */
  public async getRateLimitStatus(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redis = redisService.getClient();
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const redisKey = this.buildKey(key);

    try {
      // Remove expired entries and count current requests
      await redis.zremrangebyscore(redisKey, '-inf', windowStart);
      const currentRequests = await redis.zcard(redisKey);
      
      const remaining = Math.max(0, config.maxRequests - currentRequests);
      const resetTime = now + config.windowMs;

      return {
        allowed: currentRequests < config.maxRequests,
        remaining,
        resetTime,
        totalRequests: currentRequests
      };
    } catch (error) {
      logger.error('Error getting rate limit status', {
        key,
        error: getErrorMessage(error)
      });
      
      // Return permissive values on error
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: now + config.windowMs,
        totalRequests: 0
      };
    }
  }

  /**
   * Reset rate limit for a key
   */
  public async resetRateLimit(key: string): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const redisKey = this.buildKey(key);
      
      const result = await redis.del(redisKey);
      return result > 0;
    } catch (error) {
      logger.error('Error resetting rate limit', {
        key,
        error: getErrorMessage(error)
      });
      return false;
    }
  }

  /**
   * Default key generator (IP-based)
   */
  private defaultKeyGenerator(req: Request): string {
    return `ip:${req.ip}`;
  }

  /**
   * Build Redis key with prefix
   */
  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Clean up expired rate limit entries
   */
  public async cleanupExpiredEntries(): Promise<number> {
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
          
          // Remove keys that have expired
          if (ttl === -2) {
            const deleted = await redis.del(key);
            if (deleted > 0) {
              cleanedCount++;
            }
          }
        }
      } while (cursor !== '0');

      if (cleanedCount > 0) {
        logger.info('Rate limit cleanup completed', { cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up rate limit entries', {
        error: getErrorMessage(error)
      });
      return 0;
    }
  }
}

// Export singleton instance
export const redisRateLimiter = RedisRateLimiter.getInstance();

// Predefined rate limiters for common use cases
export const authRateLimit = redisRateLimiter.createMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 auth attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => `auth:${req.ip}:${req.body?.username || 'unknown'}`
});

export const chatRateLimit = redisRateLimiter.createMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 messages per minute
  message: 'Chat rate limit exceeded, please slow down',
  keyGenerator: (req) => `chat:${req.ip}:${req.body?.userId || 'unknown'}`
});

export const combatRateLimit = redisRateLimiter.createMiddleware({
  windowMs: 5 * 1000, // 5 seconds
  maxRequests: 20, // 20 combat actions per 5 seconds
  message: 'Combat action rate limit exceeded',
  keyGenerator: (req) => `combat:${req.ip}:${req.body?.userId || 'unknown'}`
});

export const movementRateLimit = redisRateLimiter.createMiddleware({
  windowMs: 1 * 1000, // 1 second
  maxRequests: 10, // 10 movement actions per second
  message: 'Movement rate limit exceeded',
  keyGenerator: (req) => `movement:${req.ip}:${req.body?.userId || 'unknown'}`
});

export const apiRateLimit = redisRateLimiter.createMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 API requests per minute
  message: 'API rate limit exceeded',
  keyGenerator: (req) => `api:${req.ip}`
});

// User-specific rate limiters
export const createUserRateLimit = (userId: string, windowMs: number, maxRequests: number) => {
  return redisRateLimiter.createMiddleware({
    windowMs,
    maxRequests,
    keyGenerator: () => `user:${userId}`,
    message: 'User rate limit exceeded'
  });
};

// IP-specific rate limiters
export const createIPRateLimit = (windowMs: number, maxRequests: number) => {
  return redisRateLimiter.createMiddleware({
    windowMs,
    maxRequests,
    keyGenerator: (req) => `ip:${req.ip}`,
    message: 'IP rate limit exceeded'
  });
};