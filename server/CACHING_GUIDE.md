# Aeturnis Online - Caching and Session Management Guide

## Overview

This guide demonstrates how to use the comprehensive Redis-based caching and session management system implemented for Aeturnis Online. The system provides high-performance caching patterns, distributed session management, rate limiting, and distributed locking capabilities.

## Core Services

### 1. Redis Service
Central Redis connection management with automatic reconnection and health monitoring.

```typescript
import { redisService } from '../services/RedisService';

// Initialize connection
await redisService.connect();

// Check health
const health = await redisService.healthCheck();
console.log('Redis status:', health.status);

// Get Redis client for direct operations
const redis = redisService.getClient();
```

### 2. Cache Manager
High-level caching operations with automatic JSON serialization.

```typescript
import { cacheManager } from '../services/CacheManager';

// Basic operations
await cacheManager.set('user:123', { name: 'John', level: 50 }, { ttl: 3600 });
const user = await cacheManager.get<User>('user:123');
await cacheManager.delete('user:123');

// Bulk operations
const users = await cacheManager.mget<User>(['user:123', 'user:456']);
await cacheManager.mset([
  { key: 'user:123', value: userData1, ttl: 3600 },
  { key: 'user:456', value: userData2, ttl: 1800 }
]);

// Collections
await cacheManager.addToSet('online:users', 'user:123');
const onlineUsers = await cacheManager.getSetMembers<string>('online:users');

// Counters
const visits = await cacheManager.increment('page:visits');
```

### 3. Session Manager
User session management with sliding TTL and metadata tracking.

```typescript
import { sessionManager } from '../services/SessionManager';

// Create session
const session = await sessionManager.createSession(
  'user123',
  'johnsmith',
  ['user', 'player'],
  {
    ttl: 1800,
    characterId: 'char456',
    metadata: {
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0...',
      deviceInfo: { browser: 'Chrome', os: 'Windows' }
    }
  }
);

// Get and extend session
const currentSession = await sessionManager.getSession(session.sessionId);
await sessionManager.extendSession(session.sessionId, 3600);

// Update session data
await sessionManager.updateSessionCharacter(session.sessionId, 'newChar789');

// Cleanup
await sessionManager.destroySession(session.sessionId);
await sessionManager.destroyUserSessions('user123');
```

### 4. Cache Patterns
Advanced caching patterns for optimal performance.

```typescript
import { cachePatterns, CacheKeys } from '../services/CachePatterns';

// Cache-Aside Pattern
const userProfile = await cachePatterns.cacheAside(
  CacheKeys.user('123'),
  async () => {
    // Load from database
    return await userRepository.findById('123');
  },
  { ttl: 3600, refreshThreshold: 0.1 }
);

// Write-Through Pattern
await cachePatterns.writeThrough(
  CacheKeys.character('456'),
  updatedCharacter,
  async (data) => {
    // Write to database
    await characterRepository.update('456', data);
  },
  { ttl: 1800 }
);

// Cache warming
await cachePatterns.warmCache(
  CacheKeys.leaderboard('global'),
  async () => await generateLeaderboard(),
  7200
);

// Tag-based invalidation
await cachePatterns.taggedCache(
  CacheKeys.guild('guild123'),
  ['guild', 'social', 'leaderboard'],
  async () => await guildRepository.findById('guild123')
);

await cachePatterns.invalidateByTag('guild');
```

### 5. Distributed Locking
Redlock-based distributed locking for critical sections.

```typescript
import { distributedLock, withLock } from '../utils/distributedLock';

// Manual lock management
const lock = await distributedLock.acquireLock('combat:user123', 5000);
if (lock) {
  try {
    // Critical section
    await processCombatAction(user123);
  } finally {
    await distributedLock.releaseLock(lock);
  }
}

// Automatic lock management
await withLock('trade:user123:user456', 10000, async () => {
  // Trade logic with automatic lock handling
  await processTradeTransaction(user123, user456);
});
```

### 6. Rate Limiting
Redis-based sliding window rate limiting.

```typescript
import { 
  authRateLimit, 
  chatRateLimit, 
  combatRateLimit,
  redisRateLimiter 
} from '../middleware/rateLimitRedis';

// Apply predefined rate limiters
app.post('/auth/login', authRateLimit, loginHandler);
app.post('/chat/message', chatRateLimit, chatHandler);
app.post('/combat/action', combatRateLimit, combatHandler);

// Custom rate limiter
const customRateLimit = redisRateLimiter.createMiddleware({
  windowMs: 60000,
  maxRequests: 50,
  keyGenerator: (req) => `api:${req.ip}:${req.user?.id}`,
  message: 'Too many API requests'
});

app.use('/api/', customRateLimit);

// Manual rate limit checking
const result = await redisRateLimiter.checkRateLimit(
  'user:123:combat',
  { windowMs: 5000, maxRequests: 10 }
);

if (!result.allowed) {
  return res.status(429).json({ error: 'Rate limit exceeded' });
}
```

## Cache Key Conventions

The system uses standardized cache key naming conventions:

```typescript
// User data
CacheKeys.user('123') // → 'user:123:profile'
CacheKeys.settings('123') // → 'user:123:settings'
CacheKeys.achievements('123') // → 'user:123:achievements'

// Character data
CacheKeys.character('456') // → 'char:456:data'
CacheKeys.inventory('456') // → 'char:456:inventory'
CacheKeys.skills('456') // → 'char:456:skills'

// Game systems
CacheKeys.guild('789') // → 'guild:789:data'
CacheKeys.zone('zone1') // → 'zone:zone1:data'
CacheKeys.combat('combat123') // → 'combat:combat123:state'
CacheKeys.leaderboard('global') // → 'leaderboard:global'

// Temporary data
CacheKeys.temp('password_reset', '123') // → 'temp:password_reset:123'
CacheKeys.rateLimit('123', 'login') // → 'ratelimit:123:login'
```

## Integration Examples

### Express Route with Caching
```typescript
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await cachePatterns.cacheAside(
      CacheKeys.user(req.params.id),
      async () => {
        return await userRepository.findById(req.params.id);
      },
      { ttl: 1800 }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Socket.io with Session Management
```typescript
io.use(async (socket, next) => {
  const sessionId = socket.handshake.auth.sessionId;
  
  if (!sessionId) {
    return next(new Error('No session provided'));
  }

  const session = await sessionManager.getSession(sessionId);
  
  if (!session) {
    return next(new Error('Invalid session'));
  }

  // Extend session on activity
  await sessionManager.extendSession(sessionId);
  
  socket.userId = session.userId;
  socket.characterId = session.characterId;
  next();
});
```

### Background Tasks
```typescript
// Cache cleanup task
setInterval(async () => {
  await cacheManager.deletePattern('temp:*');
  await sessionManager.cleanupExpiredSessions();
  await distributedLock.cleanupExpiredLocks();
}, 300000); // Every 5 minutes

// Cache warming task
setInterval(async () => {
  await cachePatterns.warmCacheBulk([
    {
      key: CacheKeys.leaderboard('global'),
      loader: () => generateGlobalLeaderboard(),
      ttl: 7200
    },
    {
      key: CacheKeys.leaderboard('weekly'),
      loader: () => generateWeeklyLeaderboard(),
      ttl: 3600
    }
  ]);
}, 1800000); // Every 30 minutes
```

## Performance Tips

1. **Use appropriate TTLs**: Short TTL for frequently changing data, longer TTL for static data
2. **Implement background refresh**: Use `refreshThreshold` for automatic cache warming
3. **Leverage bulk operations**: Use `mget`/`mset` for multiple cache operations
4. **Monitor cache hit rates**: Check cache statistics regularly
5. **Use tags for group invalidation**: Tag related cache entries for efficient cleanup
6. **Implement circuit breakers**: Gracefully handle Redis failures in critical paths

## Monitoring and Health Checks

The system provides comprehensive health monitoring:

```typescript
// Check overall health
const health = await redisService.healthCheck();

// Get cache statistics
const cacheStats = await cacheManager.getStats();

// Get session statistics
const sessionStats = await sessionManager.getSessionStats();

// Get lock statistics
const lockStats = await distributedLock.getLockStats();
```

Access health endpoints:
- `GET /health/redis` - Redis-specific health check
- `GET /health/detailed` - Comprehensive system health including cache stats

## Error Handling

All services implement graceful error handling:

- **Redis connection failures**: Automatic reconnection with exponential backoff
- **Cache operation failures**: Fallback to data source with logging
- **Session errors**: Session cleanup and user notification
- **Rate limit errors**: Proper HTTP status codes and retry information
- **Lock acquisition failures**: Timeout handling and resource cleanup

This comprehensive caching and session management system provides a robust foundation for the Aeturnis Online MMORPG's performance and scalability requirements.