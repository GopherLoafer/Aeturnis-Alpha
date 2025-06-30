/**
 * Session Manager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../src/services/SessionManager';
import { redisService } from '../../src/services/RedisService';

// Mock Redis service
jest.mock('../../src/services/RedisService', () => ({
  redisService: {
    getClient: jest.fn(),
    isHealthy: jest.fn().mockReturnValue(true)
  }
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-session-id')
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockRedisClient: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Redis client
    mockRedisClient = {
      setex: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
      smembers: jest.fn(),
      srem: jest.fn(),
      scan: jest.fn()
    };

    // Mock redisService.getClient to return our mock
    jest.mocked(redisService.getClient).mockReturnValue(mockRedisClient);
    
    sessionManager = SessionManager.getInstance();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a new session successfully', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');
      mockRedisClient.sadd.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.smembers.mockResolvedValue(['test-session-id']);

      const result = await sessionManager.createSession(
        'user123',
        'testuser',
        ['user'],
        {
          ttl: 1800,
          characterId: 'char123',
          metadata: { ipAddress: '127.0.0.1' }
        }
      );

      expect(result.sessionId).toBe('test-session-id');
      expect(result.userId).toBe('user123');
      expect(result.username).toBe('testuser');
      expect(result.characterId).toBe('char123');
      expect(result.roles).toEqual(['user']);
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });

    it('should handle Redis errors during session creation', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        sessionManager.createSession('user123', 'testuser')
      ).rejects.toThrow('Failed to create session');
    });
  });

  describe('getSession', () => {
    const mockSessionData = {
      sessionId: 'test-session-id',
      userId: 'user123',
      username: 'testuser',
      roles: ['user'],
      metadata: {
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800000).toISOString() // 30 minutes from now
    };

    it('should return session data for valid session', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSessionData));

      const result = await sessionManager.getSession('test-session-id');

      expect(result).toBeTruthy();
      expect(result?.sessionId).toBe('test-session-id');
      expect(result?.userId).toBe('user123');
      expect(mockRedisClient.get).toHaveBeenCalledWith('session:test-session-id');
    });

    it('should return null for non-existent session', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await sessionManager.getSession('non-existent-id');

      expect(result).toBeNull();
    });

    it('should return null and cleanup expired session', async () => {
      const expiredSessionData = {
        ...mockSessionData,
        expiresAt: new Date(Date.now() - 1000).toISOString() // 1 second ago
      };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(expiredSessionData));
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.srem.mockResolvedValue(1);

      const result = await sessionManager.getSession('test-session-id');

      expect(result).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await sessionManager.getSession('test-session-id');

      expect(result).toBeNull();
    });
  });

  describe('extendSession', () => {
    const mockSessionData = {
      sessionId: 'test-session-id',
      userId: 'user123',
      username: 'testuser',
      roles: ['user'],
      metadata: {
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800000).toISOString()
    };

    it('should extend session TTL successfully', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSessionData));
      mockRedisClient.setex.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await sessionManager.extendSession('test-session-id', 3600);

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });

    it('should return false for non-existent session', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await sessionManager.extendSession('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('destroySession', () => {
    const mockSessionData = {
      sessionId: 'test-session-id',
      userId: 'user123',
      username: 'testuser',
      roles: ['user'],
      metadata: {
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800000).toISOString()
    };

    it('should destroy session successfully', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSessionData));
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.srem.mockResolvedValue(1);

      const result = await sessionManager.destroySession('test-session-id');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('session:test-session-id');
    });

    it('should handle Redis errors during session destruction', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await sessionManager.destroySession('test-session-id');

      expect(result).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    it('should return all active sessions for a user', async () => {
      const sessionIds = ['session1', 'session2'];
      mockRedisClient.smembers.mockResolvedValue(sessionIds);
      
      // Mock getSession for each session ID
      const mockSessionData1 = {
        sessionId: 'session1',
        userId: 'user123',
        username: 'testuser',
        roles: ['user'],
        metadata: { loginTime: new Date().toISOString(), lastActivity: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800000).toISOString()
      };

      const mockSessionData2 = {
        sessionId: 'session2',
        userId: 'user123',
        username: 'testuser',
        roles: ['user'],
        metadata: { loginTime: new Date().toISOString(), lastActivity: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800000).toISOString()
      };

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockSessionData1))
        .mockResolvedValueOnce(JSON.stringify(mockSessionData2));

      const result = await sessionManager.getUserSessions('user123');

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('session1');
      expect(result[1].sessionId).toBe('session2');
    });

    it('should filter out invalid sessions', async () => {
      const sessionIds = ['session1', 'invalid-session'];
      mockRedisClient.smembers.mockResolvedValue(sessionIds);
      mockRedisClient.srem.mockResolvedValue(1);
      
      const mockSessionData = {
        sessionId: 'session1',
        userId: 'user123',
        username: 'testuser',
        roles: ['user'],
        metadata: { loginTime: new Date().toISOString(), lastActivity: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800000).toISOString()
      };

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(mockSessionData))
        .mockResolvedValueOnce(null); // Invalid session returns null

      const result = await sessionManager.getUserSessions('user123');

      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('session1');
      expect(mockRedisClient.srem).toHaveBeenCalledWith('user_sessions:user123', 'invalid-session');
    });
  });

  describe('destroyUserSessions', () => {
    it('should destroy all user sessions', async () => {
      const mockSessionData = {
        sessionId: 'session1',
        userId: 'user123',
        username: 'testuser',
        roles: ['user'],
        metadata: { loginTime: new Date().toISOString(), lastActivity: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800000).toISOString()
      };

      // Mock getUserSessions to return one session
      mockRedisClient.smembers.mockResolvedValue(['session1']);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSessionData));
      
      // Mock destroySession operations
      mockRedisClient.del.mockResolvedValue(1);
      mockRedisClient.srem.mockResolvedValue(1);

      const result = await sessionManager.destroyUserSessions('user123');

      expect(result).toBe(1);
    });
  });

  describe('updateSessionCharacter', () => {
    it('should update session character successfully', async () => {
      const mockSessionData = {
        sessionId: 'test-session-id',
        userId: 'user123',
        username: 'testuser',
        characterId: 'old-char',
        roles: ['user'],
        metadata: { loginTime: new Date().toISOString(), lastActivity: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1800000).toISOString()
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockSessionData));
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await sessionManager.updateSessionCharacter('test-session-id', 'new-char');

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });

    it('should return false for non-existent session', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await sessionManager.updateSessionCharacter('non-existent-id', 'char123');

      expect(result).toBe(false);
    });
  });
});