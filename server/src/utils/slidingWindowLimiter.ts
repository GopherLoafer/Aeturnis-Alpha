/**
 * Sliding Window Rate Limiter - Affinity Patch v1
 * Redis-based sliding window rate limiting for affinity experience awards
 */

import { CacheManager } from '../services/CacheManager';

export interface SlidingWindowConfig {
  windowSize: number; // Window size in seconds
  maxRequests: number; // Maximum requests allowed in window
}

export interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

export class SlidingWindowLimiter {
  private cacheManager: CacheManager;

  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }

  /**
   * Check if request is allowed under sliding window rate limit
   */
  async checkLimit(
    key: string,
    config: SlidingWindowConfig
  ): Promise<SlidingWindowResult> {
    const now = Date.now();
    const windowStart = now - (config.windowSize * 1000);

    // Get current requests in window
    const requestsData = await this.cacheManager.get(`sliding:${key}`) || '[]';
    let requests: number[] = [];
    
    try {
      requests = JSON.parse(requestsData);
    } catch {
      requests = [];
    }

    // Remove requests outside current window
    requests = requests.filter(timestamp => timestamp > windowStart);

    // Check if limit exceeded
    const allowed = requests.length < config.maxRequests;
    
    if (allowed) {
      // Add current request
      requests.push(now);
      
      // Store updated requests with expiration
      await this.cacheManager.set(
        `sliding:${key}`,
        JSON.stringify(requests),
        config.windowSize
      );
    }

    const remaining = Math.max(0, config.maxRequests - requests.length);
    const resetTime = requests.length > 0 ? requests[0] + (config.windowSize * 1000) : now;

    return {
      allowed,
      remaining,
      resetTime,
      totalRequests: requests.length
    };
  }

  /**
   * Reset sliding window for a specific key
   */
  async resetWindow(key: string): Promise<void> {
    await this.cacheManager.delete(`sliding:${key}`);
  }

  /**
   * Get current window status without incrementing
   */
  async getWindowStatus(
    key: string,
    config: SlidingWindowConfig
  ): Promise<SlidingWindowResult> {
    const now = Date.now();
    const windowStart = now - (config.windowSize * 1000);

    const requestsData = await this.cacheManager.get(`sliding:${key}`) || '[]';
    let requests: number[] = [];
    
    try {
      requests = JSON.parse(requestsData);
    } catch {
      requests = [];
    }

    // Remove requests outside current window
    requests = requests.filter(timestamp => timestamp > windowStart);

    const remaining = Math.max(0, config.maxRequests - requests.length);
    const resetTime = requests.length > 0 ? requests[0] + (config.windowSize * 1000) : now;

    return {
      allowed: requests.length < config.maxRequests,
      remaining,
      resetTime,
      totalRequests: requests.length
    };
  }
}