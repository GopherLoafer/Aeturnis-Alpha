/**
 * Affinity Rate Limiting Tests - Affinity Patch v1
 * Unit tests for cooldown and sliding window enforcement
 */

import { Pool } from 'pg';
import { CacheManager } from '../../src/services/CacheManager';
import { RealtimeService } from '../../src/services/RealtimeService';
import { AffinityService } from '../../src/services/AffinityService';
import { SlidingWindowLimiter } from '../../src/utils/slidingWindowLimiter';
import { getErrorMessage } from '../utils/errorUtils';
  AffinityError, 
  AFFINITY_ERRORS, 
  AFFINITY_CONSTANTS 
} from '../../src/types/affinity.types';

// Mock implementations
const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),;
} as unknown as Pool;

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),;
} as unknown as CacheManager;

const mockRealtimeService = {
  broadcastToUser: jest.fn(),
  broadcastToCharacter: jest.fn(),;
} as unknown as RealtimeService;

describe('AffinityService Rate Limiting', () => {
  let affinityService: AffinityService;
  let mockClient: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
    
    // Initialize service
    affinityService = new AffinityService(
      mockPool,
      mockCacheManager,
      mockRealtimeService
    );
  });

  describe('Per-Affinity Cooldown Enforcement', () => {
    test('should reject experience award when cooldown is active', async () => {
      // Setup: cooldown is active
      (mockCacheManager.get as jest.Mock).mockResolvedValue('true');

      await expect(
        affinityService.awardAffinityExp(
          'char-123',
          'sword',
          BigInt(100),
          'combat'
        )
      ).rejects.toThrow(AffinityError);

      await expect(
        affinityService.awardAffinityExp(
          'char-123',
          'sword',
          BigInt(100),
          'combat'
        )
      ).rejects.toMatchObject({
        code: AFFINITY_ERRORS.RATE_LIMITED,
        statusCode: 429
      });
    });

    test('should allow experience award when cooldown is not active', async () => {
      // Setup: no cooldown, valid affinity, successful DB operations
      (mockCacheManager.get as jest.Mock)
        .mockResolvedValueOnce(null) // sliding window check
        .mockResolvedValueOnce(null); // cooldown check
      
      const mockSlidingWindowResult = {
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 60000,
        totalRequests: 1;
      };
      
      // Mock sliding window limiter
      const slidingWindowSpy = jest.spyOn(SlidingWindowLimiter.prototype, 'checkLimit');
        .mockResolvedValue(mockSlidingWindowResult);

      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' });
        .mockResolvedValueOnce({ 
          rows: [{ id: 'affinity-1', name: 'sword', type: 'weapon' }] 
        });
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'char-affinity-1',
            character_id: 'char-123',
            affinity_id: 'affinity-1',
            experience: '1000',
            tier: 2
          }] 
        });
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'char-affinity-1',
            experience: '1100',
            tier: 2
          }] 
        });
        .mockResolvedValueOnce({ command: 'COMMIT' });

      const result = await affinityService.awardAffinityExp(
        'char-123',
        'sword',
        BigInt(100),
        'combat';
      );

      expect(result.success).toBe(true);
      expect(slidingWindowSpy).toHaveBeenCalledWith(
        'affinity:window:char-123',
        {
          windowSize: AFFINITY_CONSTANTS.SLIDING_WINDOW_DURATION,
          maxRequests: AFFINITY_CONSTANTS.SLIDING_WINDOW_LIMIT
        }
      );
      
      // Verify cooldown was set
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'affinity:ratelimit:char-123:sword',
        'true',
        { ttl: AFFINITY_CONSTANTS.EXP_AWARD_COOLDOWN / 1000 }
      );

      slidingWindowSpy.mockRestore();
    });

    test('should set correct cooldown duration', () => {
      expect(AFFINITY_CONSTANTS.EXP_AWARD_COOLDOWN).toBe(1500);
    });
  });

  describe('Sliding Window Rate Limiting', () => {
    test('should reject when sliding window limit is exceeded', async () => {
      const mockSlidingWindowResult = {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalRequests: 10;
      };
      
      const slidingWindowSpy = jest.spyOn(SlidingWindowLimiter.prototype, 'checkLimit');
        .mockResolvedValue(mockSlidingWindowResult);

      await expect(
        affinityService.awardAffinityExp(
          'char-123',
          'sword',
          BigInt(100),
          'combat'
        )
      ).rejects.toThrow(AffinityError);

      await expect(
        affinityService.awardAffinityExp(
          'char-123',
          'sword',
          BigInt(100),
          'combat'
        )
      ).rejects.toMatchObject({
        code: AFFINITY_ERRORS.RATE_LIMITED,
        statusCode: 429
      });

      slidingWindowSpy.mockRestore();
    });

    test('should allow when within sliding window limit', async () => {
      const mockSlidingWindowResult = {
        allowed: true,
        remaining: 5,
        resetTime: Date.now() + 60000,
        totalRequests: 5;
      };
      
      const slidingWindowSpy = jest.spyOn(SlidingWindowLimiter.prototype, 'checkLimit');
        .mockResolvedValue(mockSlidingWindowResult);

      // Setup: no cooldown, valid operations
      (mockCacheManager.get as jest.Mock).mockResolvedValue(null);
      
      // Mock successful DB operations
      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' });
        .mockResolvedValueOnce({ 
          rows: [{ id: 'affinity-1', name: 'sword', type: 'weapon' }] 
        });
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'char-affinity-1',
            character_id: 'char-123',
            affinity_id: 'affinity-1',
            experience: '1000',
            tier: 2
          }] 
        });
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'char-affinity-1',
            experience: '1100',
            tier: 2
          }] 
        });
        .mockResolvedValueOnce({ command: 'COMMIT' });

      const result = await affinityService.awardAffinityExp(
        'char-123',
        'sword',
        BigInt(100),
        'combat';
      );

      expect(result.success).toBe(true);
      expect(slidingWindowSpy).toHaveBeenCalledWith(
        'affinity:window:char-123',
        {
          windowSize: AFFINITY_CONSTANTS.SLIDING_WINDOW_DURATION,
          maxRequests: AFFINITY_CONSTANTS.SLIDING_WINDOW_LIMIT
        }
      );

      slidingWindowSpy.mockRestore();
    });

    test('should enforce correct sliding window limits', () => {
      expect(AFFINITY_CONSTANTS.SLIDING_WINDOW_LIMIT).toBe(10);
      expect(AFFINITY_CONSTANTS.SLIDING_WINDOW_DURATION).toBe(60);
    });
  });

  describe('Max Experience Guard', () => {
    test('should reject experience amount exceeding maximum', async () => {
      const largeAmount = BigInt(AFFINITY_CONSTANTS.MAX_EXP_AWARD + 1);

      await expect(
        affinityService.awardAffinityExp(
          'char-123',
          'sword',
          largeAmount,
          'combat'
        );
      ).rejects.toThrow(AffinityError);

      await expect(
        affinityService.awardAffinityExp(
          'char-123',
          'sword',
          largeAmount,
          'combat'
        );
      ).rejects.toMatchObject({
        code: AFFINITY_ERRORS.INVALID_EXPERIENCE_AMOUNT,
        statusCode: 400
      });
    });

    test('should allow experience amount at maximum limit', async () => {
      const maxAmount = BigInt(AFFINITY_CONSTANTS.MAX_EXP_AWARD);
      
      // Setup: successful rate limiting and DB operations
      const mockSlidingWindowResult = {
        allowed: true,
        remaining: 9,
        resetTime: Date.now() + 60000,
        totalRequests: 1;
      };
      
      const slidingWindowSpy = jest.spyOn(SlidingWindowLimiter.prototype, 'checkLimit');
        .mockResolvedValue(mockSlidingWindowResult);

      (mockCacheManager.get as jest.Mock).mockResolvedValue(null);
      
      mockClient.query
        .mockResolvedValueOnce({ command: 'BEGIN' });
        .mockResolvedValueOnce({ 
          rows: [{ id: 'affinity-1', name: 'sword', type: 'weapon' }] 
        });
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'char-affinity-1',
            character_id: 'char-123',
            affinity_id: 'affinity-1',
            experience: '1000',
            tier: 2
          }] 
        });
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'char-affinity-1',
            experience: (1000 + AFFINITY_CONSTANTS.MAX_EXP_AWARD).toString(),
            tier: 2
          }] 
        })
        .mockResolvedValueOnce({ command: 'COMMIT' });

      const result = await affinityService.awardAffinityExp(
        'char-123',
        'sword',
        maxAmount,
        'combat';
      );

      expect(result.success).toBe(true);
      expect(result.experience_awarded).toBe(maxAmount);

      slidingWindowSpy.mockRestore();
    });

    test('should enforce correct maximum experience limit', () => {
      expect(AFFINITY_CONSTANTS.MAX_EXP_AWARD).toBe(10000);
    });
  });
});

describe('SlidingWindowLimiter', () => {
  let slidingWindowLimiter: SlidingWindowLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    slidingWindowLimiter = new SlidingWindowLimiter(mockCacheManager);
  });

  test('should allow requests within window limit', async () => {
    // Mock empty window (no previous requests)
    (mockCacheManager.get as jest.Mock).mockResolvedValue('[]');

    const result = await slidingWindowLimiter.checkLimit('test-key', {
      windowSize: 60,
      maxRequests: 10;
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(mockCacheManager.set).toHaveBeenCalled();
  });

  test('should reject requests exceeding window limit', async () => {
    // Mock full window (10 requests in last 60 seconds)
    const now = Date.now();
    const requests = Array.from({ length: 10 }, (_, i) => now - i * 1000);
    (mockCacheManager.get as jest.Mock).mockResolvedValue(JSON.stringify(requests));

    const result = await slidingWindowLimiter.checkLimit('test-key', {
      windowSize: 60,
      maxRequests: 10;
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(mockCacheManager.set).not.toHaveBeenCalled();
  });

  test('should clean up old requests outside window', async () => {
    const now = Date.now();
    // Mock requests: 5 old (outside window) + 3 recent (inside window)
    const oldRequests = Array.from({ length: 5 }, (_, i) => now - 70000 - i * 1000);
    const recentRequests = Array.from({ length: 3 }, (_, i) => now - i * 1000);
    const allRequests = [...oldRequests, ...recentRequests];
    
    (mockCacheManager.get as jest.Mock).mockResolvedValue(JSON.stringify(allRequests));

    const result = await slidingWindowLimiter.checkLimit('test-key', {
      windowSize: 60,
      maxRequests: 10;
    });

    expect(result.allowed).toBe(true);
    expect(result.totalRequests).toBe(4); // 3 recent + 1 new
    expect(result.remaining).toBe(6); // 10 - 4
  });
});