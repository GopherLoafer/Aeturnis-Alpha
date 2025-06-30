
import { withLock, acquireLock, releaseLock, extendLock } from '../../src/utils/distributedLock';
import { redisService } from '../../src/services/RedisService';

jest.mock('../../src/services/RedisService');

describe('Distributed Lock', () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      eval: jest.fn(),
      del: jest.fn(),
      set: jest.fn();
    };
    
    (redisService.getClient as jest.Mock).mockReturnValue(mockRedis);
    jest.clearAllMocks();
  });

  describe('Lock Acquisition', () => {
    it('should successfully acquire lock', async () => {
      mockRedis.eval.mockResolvedValue('OK');

      const lockId = await acquireLock('test-resource', 5000);
      
      expect(lockId).toBeDefined();
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("set"'),
        1,
        'lock:test-resource',
        expect.any(String),
        'PX',
        5000,
        'NX'
      );
    });

    it('should fail to acquire lock when already held', async () => {
      mockRedis.eval.mockResolvedValue(null);

      const lockId = await acquireLock('test-resource', 5000);
      
      expect(lockId).toBeNull();
    });

    it('should handle Redis errors during acquisition', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection error'));

      const lockId = await acquireLock('test-resource', 5000);
      
      expect(lockId).toBeNull();
    });
  });

  describe('Lock Extension', () => {
    it('should successfully extend lock', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await extendLock('test-resource', 'test-lock-id', 10000);
      
      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        'lock:test-resource',
        'test-lock-id',
        10000
      );
    });

    it('should fail to extend non-existent lock', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await extendLock('test-resource', 'wrong-lock-id', 10000);
      
      expect(result).toBe(false);
    });

    it('should handle Redis errors during extension', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const result = await extendLock('test-resource', 'test-lock-id', 10000);
      
      expect(result).toBe(false);
    });
  });

  describe('Lock Release', () => {
    it('should successfully release lock', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await releaseLock('test-resource', 'test-lock-id');
      
      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        'lock:test-resource',
        'test-lock-id'
      );
    });

    it('should fail to release lock with wrong ID', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await releaseLock('test-resource', 'wrong-lock-id');
      
      expect(result).toBe(false);
    });

    it('should handle Redis errors during release', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const result = await releaseLock('test-resource', 'test-lock-id');
      
      expect(result).toBe(false);
    });
  });

  describe('withLock Helper', () => {
    it('should execute function with lock protection', async () => {
      mockRedis.eval
        .mockResolvedValueOnce('OK') // acquire
        .mockResolvedValueOnce(1);   // release

      const testFunction = jest.fn().mockResolvedValue('test-result');

      const result = await withLock('test-resource', testFunction, {
        ttl: 5000,
        retries: 3,
        retryDelay: 100;
      });

      expect(result).toBe('test-result');
      expect(testFunction).toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalledTimes(2); // acquire + release
    });

    it('should retry lock acquisition on failure', async () => {
      mockRedis.eval
        .mockResolvedValueOnce(null)  // fail 1
        .mockResolvedValueOnce(null)  // fail 2
        .mockResolvedValueOnce('OK')  // success
        .mockResolvedValueOnce(1);    // release

      const testFunction = jest.fn().mockResolvedValue('success');

      const result = await withLock('test-resource', testFunction, {
        ttl: 5000,
        retries: 3,
        retryDelay: 50;
      });

      expect(result).toBe('success');
      expect(mockRedis.eval).toHaveBeenCalledTimes(4); // 3 acquire attempts + 1 release
    });

    it('should throw error when lock acquisition fails after retries', async () => {
      mockRedis.eval.mockResolvedValue(null); // always fail

      const testFunction = jest.fn();

      await expect(
        withLock('test-resource', testFunction, {
          ttl: 5000,
          retries: 2,
          retryDelay: 10
        });
      ).rejects.toThrow('Failed to acquire lock for test-resource after 2 retries');

      expect(testFunction).not.toHaveBeenCalled();
    });

    it('should release lock even if function throws', async () => {
      mockRedis.eval
        .mockResolvedValueOnce('OK') // acquire
        .mockResolvedValueOnce(1);   // release

      const testFunction = jest.fn().mockRejectedValue(new Error('Function error'));

      await expect(
        withLock('test-resource', testFunction, { ttl: 5000 });
      ).rejects.toThrow('Function error');

      expect(mockRedis.eval).toHaveBeenCalledTimes(2); // acquire + release
    });

    it('should extend lock for long-running operations', async () => {
      mockRedis.eval
        .mockResolvedValueOnce('OK') // acquire
        .mockResolvedValue(1);       // extend and release

      const longRunningFunction = jest.fn().mockImplementation(async () => {
        // Simulate long operation;
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'completed';
      });

      const result = await withLock('test-resource', longRunningFunction, {
        ttl: 200,
        extendInterval: 50;
      });

      expect(result).toBe('completed');
      expect(mockRedis.eval).toHaveBeenCalledTimes(2); // acquire + release (extension happens in background)
    });
  });

  describe('Lock Statistics', () => {
    it('should track lock acquisition metrics', async () => {
      mockRedis.eval.mockResolvedValue('OK');

      await acquireLock('test-resource', 5000);
      
      // Statistics tracking would be implementation specific
      // This test ensures the function completes without error
      expect(mockRedis.eval).toHaveBeenCalled();
    });
  });
});
