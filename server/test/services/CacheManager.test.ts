/**
 * Cache Manager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '../../src/services/CacheManager';
import { redisService } from '../../src/services/RedisService';

// Mock Redis service
vi.mock('../../src/services/RedisService', () => ({
  redisService: {
    getClient: vi.fn(),
    isHealthy: vi.fn().mockReturnValue(true)
  }
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockRedisClient: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock Redis client
    mockRedisClient = {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      mget: vi.fn(),
      pipeline: vi.fn(),
      scan: vi.fn(),
      incrby: vi.fn(),
      decrby: vi.fn(),
      sadd: vi.fn(),
      smembers: vi.fn(),
      lpush: vi.fn(),
      lrange: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      keys: vi.fn(),
      info: vi.fn()
    };

    // Setup pipeline mock
    const mockPipeline = {
      setex: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 'OK'], [null, 'OK']])
    };
    mockRedisClient.pipeline.mockReturnValue(mockPipeline);

    // Mock redisService.getClient to return our mock
    vi.mocked(redisService.getClient).mockReturnValue(mockRedisClient);
    
    cacheManager = CacheManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('should return parsed JSON data', async () => {
      const testData = { id: 1, name: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cacheManager.get<typeof testData>('test:key');

      expect(result).toEqual(testData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('cache:test:key');
    });

    it('should return null for non-existent keys', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cacheManager.get('test:key');

      expect(result).toBeNull();
    });

    it('should return string data as-is when JSON parsing fails', async () => {
      const testString = 'plain string data';
      mockRedisClient.get.mockResolvedValue(testString);

      const result = await cacheManager.get<string>('test:key');

      expect(result).toBe(testString);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheManager.get('test:key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set data with default TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await cacheManager.set('test:key', { id: 1 });

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'cache:test:key',
        3600,
        JSON.stringify({ id: 1 })
      );
    });

    it('should set data with custom TTL', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await cacheManager.set('test:key', 'test data', { ttl: 1800 });

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'cache:test:key',
        1800,
        'test data'
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheManager.set('test:key', 'data');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await cacheManager.delete('test:key');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('cache:test:key');
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await cacheManager.delete('test:key');

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cacheManager.exists('test:key');

      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await cacheManager.exists('test:key');

      expect(result).toBe(false);
    });
  });

  describe('mget', () => {
    it('should return multiple values', async () => {
      const testData1 = { id: 1 };
      const testData2 = { id: 2 };
      mockRedisClient.mget.mockResolvedValue([
        JSON.stringify(testData1),
        JSON.stringify(testData2),
        null
      ]);

      const result = await cacheManager.mget(['key1', 'key2', 'key3']);

      expect(result).toEqual([testData1, testData2, null]);
    });
  });

  describe('mset', () => {
    it('should set multiple values', async () => {
      const items = [
        { key: 'key1', value: { id: 1 }, ttl: 1800 },
        { key: 'key2', value: { id: 2 } }
      ];

      const result = await cacheManager.mset(items);

      expect(result).toBe(true);
    });
  });

  describe('increment', () => {
    it('should increment numeric value', async () => {
      mockRedisClient.incrby.mockResolvedValue(5);

      const result = await cacheManager.increment('counter', 3);

      expect(result).toBe(5);
      expect(mockRedisClient.incrby).toHaveBeenCalledWith('cache:counter', 3);
    });
  });

  describe('decrement', () => {
    it('should decrement numeric value', async () => {
      mockRedisClient.decrby.mockResolvedValue(2);

      const result = await cacheManager.decrement('counter', 3);

      expect(result).toBe(2);
      expect(mockRedisClient.decrby).toHaveBeenCalledWith('cache:counter', 3);
    });
  });

  describe('addToSet', () => {
    it('should add value to set', async () => {
      mockRedisClient.sadd.mockResolvedValue(1);

      const result = await cacheManager.addToSet('set:key', 'value');

      expect(result).toBe(true);
      expect(mockRedisClient.sadd).toHaveBeenCalledWith('cache:set:key', 'value');
    });
  });

  describe('getSetMembers', () => {
    it('should return set members', async () => {
      const testData = ['value1', 'value2'];
      mockRedisClient.smembers.mockResolvedValue(testData);

      const result = await cacheManager.getSetMembers('set:key');

      expect(result).toEqual(testData);
    });
  });

  describe('pushToList', () => {
    it('should push value to list', async () => {
      mockRedisClient.lpush.mockResolvedValue(2);

      const result = await cacheManager.pushToList('list:key', 'value');

      expect(result).toBe(2);
    });
  });

  describe('getList', () => {
    it('should return list values', async () => {
      const testData = ['value1', 'value2'];
      mockRedisClient.lrange.mockResolvedValue(testData);

      const result = await cacheManager.getList('list:key');

      expect(result).toEqual(testData);
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      // Mock scan to return keys in batches
      mockRedisClient.scan
        .mockResolvedValueOnce(['100', ['cache:test:1', 'cache:test:2']])
        .mockResolvedValueOnce(['0', ['cache:test:3']]);
      
      mockRedisClient.del.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const result = await cacheManager.deletePattern('test:*');

      expect(result).toBe(3);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.keys.mockResolvedValue(['cache:key1', 'cache:key2']);
      mockRedisClient.info.mockResolvedValue('used_memory_human:100M\n');

      const result = await cacheManager.getStats();

      expect(result).toEqual({
        totalKeys: 2,
        memoryUsage: '100M'
      });
    });
  });
});