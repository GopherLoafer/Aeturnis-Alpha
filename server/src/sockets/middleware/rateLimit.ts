/**
 * Socket.io Rate Limiting Middleware
 * Event-based rate limiting for real-time communication
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { getRedis } from '../../config/database';
import { logger } from '../../utils/logger';
import { SocketWithAuth } from './auth';

interface RateLimitConfig {
  points: number;
  duration: number;
  blockDuration?: number;
}

interface RateLimitData {
  points: number;
  totalHits: number;
  totalRequestsInWindow: number;
  msBeforeNext: number;
  isFirstInWindow: boolean;
}

// Rate limiting configuration per event type
const eventLimits: Map<string, RateLimitConfig> = new Map([
  // Connection events
  ['connect', { points: 5, duration: 60 }],
  ['disconnect', { points: 10, duration: 60 }],
  
  // Chat events
  ['chat:message', { points: 10, duration: 60 }],
  ['chat:whisper', { points: 5, duration: 60 }],
  ['chat:emote', { points: 15, duration: 60 }],
  
  // Character events
  ['character:move', { points: 30, duration: 60 }],
  ['character:action', { points: 20, duration: 60 }],
  ['character:select', { points: 3, duration: 300 }], // 5 minutes
  
  // Combat events
  ['combat:action', { points: 20, duration: 60 }],
  ['combat:join', { points: 5, duration: 60 }],
  ['combat:flee', { points: 3, duration: 60 }],
  
  // System events
  ['ping', { points: 60, duration: 60 }],
  ['heartbeat', { points: 120, duration: 60 }],
]);

// Global connection rate limiting
const globalConnectionLimit: RateLimitConfig = {
  points: 10, // 10 connections
  duration: 60, // per minute
  blockDuration: 300, // block for 5 minutes
};

export async function rateLimitMiddleware(
  socket: SocketWithAuth,
  next: (err?: ExtendedError) => void
): Promise<void> {
  try {
    // Check global connection rate limit
    const globalCheck = await checkGlobalRateLimit(socket);
    if (!globalCheck.allowed) {
      logger.warn('Socket connection blocked: Global rate limit exceeded', {
        socketId: socket.id,
        ip: socket.handshake.address,
        remainingPoints: globalCheck.remainingPoints,
        msBeforeNext: globalCheck.msBeforeNext,
      });
      
      return next(new Error('Connection rate limit exceeded'));
    }

    // Set up per-event rate limiting for this socket
    setupEventRateLimiting(socket);
    
    logger.debug('Rate limiting middleware applied', {
      socketId: socket.id,
      ip: socket.handshake.address,
      globalRemainingPoints: globalCheck.remainingPoints,
    });

    next();

  } catch (error) {
    logger.error('Rate limiting middleware error', {
      socketId: socket.id,
      ip: socket.handshake.address,
      error: error instanceof Error ? error.message : error,
    });

    // Fail open - if rate limiting fails, allow the connection
    next();
  }
}

async function checkGlobalRateLimit(socket: Socket): Promise<{
  allowed: boolean;
  remainingPoints: number;
  msBeforeNext: number;
}> {
  try {
    const redis = getRedis();
    const ip = socket.handshake.address;
    const key = `global_conn_limit:${ip}`;
    
    const result = await checkRateLimit(redis, key, globalConnectionLimit);
    
    return {
      allowed: result.remainingPoints > 0,
      remainingPoints: result.remainingPoints,
      msBeforeNext: result.msBeforeNext,
    };

  } catch (error) {
    logger.error('Failed to check global rate limit', {
      error: error instanceof Error ? error.message : error,
    });
    
    // Fail open
    return {
      allowed: true,
      remainingPoints: globalConnectionLimit.points,
      msBeforeNext: 0,
    };
  }
}

function setupEventRateLimiting(socket: SocketWithAuth): void {
  // Store original emit function
  const originalEmit = socket.emit.bind(socket);
  const originalOn = socket.on.bind(socket);

  // Wrap socket.on to add rate limiting to event listeners
  socket.on = function(event: string, listener: (...args: any[]) => void) {
    const wrappedListener = async (...args: any[]) => {
      // Check rate limit for this event
      const allowed = await checkEventRateLimit(socket, event);
      
      if (!allowed.success) {
        // Emit rate limit error to client
        socket.emit('error', {
          type: 'RATE_LIMIT_EXCEEDED',
          event,
          message: `Rate limit exceeded for ${event}`,
          retryAfter: allowed.retryAfter,
        });
        
        logger.warn('Event rate limit exceeded', {
          socketId: socket.id,
          userId: socket.userId,
          event,
          ip: socket.handshake.address,
          retryAfter: allowed.retryAfter,
        });
        
        return;
      }

      // Call original listener
      try {
        await listener.apply(this, args);
      } catch (error) {
        logger.error('Event handler error', {
          socketId: socket.id,
          userId: socket.userId,
          event,
          error: error instanceof Error ? error.message : error,
        });
      }
    };

    return originalOn(event, wrappedListener);
  };
}

async function checkEventRateLimit(socket: SocketWithAuth, event: string): Promise<{
  success: boolean;
  retryAfter?: number;
}> {
  try {
    const redis = getRedis();
    const config = eventLimits.get(event);
    
    if (!config) {
      // No rate limit configured for this event
      return { success: true };
    }

    const userId = socket.userId || 'anonymous';
    const key = `event_limit:${userId}:${event}`;
    
    const result = await checkRateLimit(redis, key, config);
    
    if (result.remainingPoints <= 0) {
      return {
        success: false,
        retryAfter: Math.ceil(result.msBeforeNext / 1000),
      };
    }

    return { success: true };

  } catch (error) {
    logger.error('Failed to check event rate limit', {
      event,
      error: error instanceof Error ? error.message : error,
    });
    
    // Fail open
    return { success: true };
  }
}

async function checkRateLimit(redis: any, key: string, config: RateLimitConfig): Promise<RateLimitData> {
  const now = Date.now();
  const windowStart = now - (config.duration * 1000);
  
  // Use Redis sorted set for sliding window
  const pipeline = redis.pipeline();
  
  // Remove old entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  
  // Count current entries
  pipeline.zcard(key);
  
  // Add current request
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  
  // Set expiration
  pipeline.expire(key, config.duration);
  
  const results = await pipeline.exec();
  const currentCount = results[1][1];
  
  const remainingPoints = Math.max(0, config.points - currentCount);
  const isFirstInWindow = currentCount === 1;
  const msBeforeNext = isFirstInWindow ? 0 : config.duration * 1000;
  
  return {
    points: config.points,
    totalHits: currentCount,
    totalRequestsInWindow: currentCount,
    remainingPoints,
    msBeforeNext,
    isFirstInWindow,
  };
}

export function configureEventRateLimit(event: string, config: RateLimitConfig): void {
  eventLimits.set(event, config);
  
  logger.info('Event rate limit configured', {
    event,
    points: config.points,
    duration: config.duration,
  });
}

export function getEventRateLimit(event: string): RateLimitConfig | undefined {
  return eventLimits.get(event);
}

export function removeEventRateLimit(event: string): boolean {
  return eventLimits.delete(event);
}

export async function getRateLimitStatus(socket: SocketWithAuth, event: string): Promise<{
  limit: number;
  remaining: number;
  resetTime: number;
} | null> {
  try {
    const redis = getRedis();
    const config = eventLimits.get(event);
    
    if (!config) {
      return null;
    }

    const userId = socket.userId || 'anonymous';
    const key = `event_limit:${userId}:${event}`;
    
    const result = await checkRateLimit(redis, key, config);
    
    return {
      limit: config.points,
      remaining: result.remainingPoints,
      resetTime: Date.now() + result.msBeforeNext,
    };

  } catch (error) {
    logger.error('Failed to get rate limit status', {
      event,
      error: error instanceof Error ? error.message : error,
    });
    
    return null;
  }
}