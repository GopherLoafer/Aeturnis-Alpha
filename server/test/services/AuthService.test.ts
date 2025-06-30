/**
 * AuthService Unit Tests
 * Comprehensive testing for authentication functionality
 */

import { AuthService } from '../../src/services/AuthService';
import { Pool } from 'pg';
import Redis from 'ioredis';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');
jest.mock('../../src/config/database');

describe('AuthService', () => {
  let authService: AuthService;
  let mockDbClient: any;
  let mockRedis: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock database client
    mockDbClient = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn()
      }),
      query: jest.fn(),
      release: jest.fn()
    };

    // Mock Redis client
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      setex: jest.fn()
    };

    // Mock Pool and Redis constructors
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockDbClient as any);
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis as any);

    authService = new AuthService();
  });

  describe('Token Management', () => {
    test('should generate valid access token', async () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      
      const token = (authService as any).generateAccessToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    test('should generate valid refresh token', async () => {
      const payload = { userId: 'test-user-id' };
      
      const token = (authService as any).generateRefreshToken(payload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    test('should validate tokens correctly', async () => {
      const payload = { userId: 'test-user-id', email: 'test@example.com' };
      const token = (authService as any).generateAccessToken(payload);
      
      const decoded = (authService as any).verifyAccessToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });
  });

  describe('Rate Limiting', () => {
    test('should track failed login attempts', async () => {
      const email = 'test@example.com';
      const key = `auth:failed:${email}`;
      
      mockRedis.get.mockResolvedValue('3'); // 3 failed attempts
      
      const result = await (authService as any).checkRateLimit(email);
      
      expect(mockRedis.get).toHaveBeenCalledWith(key);
      expect(result.attempts).toBe(3);
      expect(result.isLocked).toBe(false);
    });

    test('should lock account after 5 failed attempts', async () => {
      const email = 'test@example.com';
      
      mockRedis.get.mockResolvedValue('5'); // 5 failed attempts
      
      const result = await (authService as any).checkRateLimit(email);
      
      expect(result.attempts).toBe(5);
      expect(result.isLocked).toBe(true);
    });

    test('should increment failed attempts on login failure', async () => {
      const email = 'test@example.com';
      const key = `auth:failed:${email}`;
      
      mockRedis.get.mockResolvedValue('2');
      mockRedis.setex.mockResolvedValue('OK');
      
      await (authService as any).incrementFailedAttempts(email);
      
      expect(mockRedis.setex).toHaveBeenCalledWith(key, 900, '3'); // 15 minutes TTL
    });
  });

  describe('User Registration', () => {
    test('should successfully register new user', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // No existing user
          .mockResolvedValueOnce({ rows: [{ id: 'new-user-id', email: 'test@example.com' }] }), // Insert result
        release: jest.fn()
      };
      
      mockDbClient.connect.mockResolvedValue(mockClient);
      
      const result = await authService.register('test@example.com', 'testuser', 'password123');
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    test('should fail registration for existing user', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] }), // Existing user found
        release: jest.fn()
      };
      
      mockDbClient.connect.mockResolvedValue(mockClient);
      
      const result = await authService.register('existing@example.com', 'testuser', 'password123');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });
  });

  describe('User Login', () => {
    test('should successfully login with valid credentials', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        username: 'testuser',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash' // Mock hash
      };
      
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
          .mockResolvedValueOnce({ rows: [] }), // Update last login
        release: jest.fn()
      };
      
      mockDbClient.connect.mockResolvedValue(mockClient);
      mockRedis.get.mockResolvedValue('0'); // No failed attempts
      mockRedis.set.mockResolvedValue('OK');
      
      // Mock password verification
      jest.spyOn(require('argon2'), 'verify').mockResolvedValue(true);
      
      const result = await authService.login('test@example.com', 'password123');
      
      expect(result.success).toBe(true);
      expect(result.data?.user).toBeDefined();
      expect(result.data?.accessToken).toBeDefined();
      expect(result.data?.refreshToken).toBeDefined();
    });

    test('should fail login with invalid credentials', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }), // User not found
        release: jest.fn()
      };
      
      mockDbClient.connect.mockResolvedValue(mockClient);
      mockRedis.get.mockResolvedValue('0');
      mockRedis.setex.mockResolvedValue('OK');
      
      const result = await authService.login('nonexistent@example.com', 'password123');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    test('should fail login when account is locked', async () => {
      mockRedis.get.mockResolvedValue('5'); // 5 failed attempts = locked
      
      const result = await authService.login('locked@example.com', 'password123');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
    });
  });

  describe('Token Refresh', () => {
    test('should successfully refresh valid token', async () => {
      const refreshToken = 'valid-refresh-token';
      const userId = 'user-id';
      
      mockRedis.get.mockResolvedValue(refreshToken); // Token exists in Redis
      
      // Mock JWT verification
      jest.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ userId });
      
      const result = await authService.refreshToken(refreshToken);
      
      expect(result.success).toBe(true);
      expect(result.data?.accessToken).toBeDefined();
    });

    test('should fail refresh with invalid token', async () => {
      const refreshToken = 'invalid-refresh-token';
      
      mockRedis.get.mockResolvedValue(null); // Token not found in Redis
      
      const result = await authService.refreshToken(refreshToken);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid refresh token');
    });
  });

  describe('Password Reset', () => {
    test('should generate reset token for valid email', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'user-id', email: 'test@example.com' }] }),
        release: jest.fn()
      };
      
      mockDbClient.connect.mockResolvedValue(mockClient);
      mockRedis.setex.mockResolvedValue('OK');
      
      const result = await authService.forgotPassword('test@example.com');
      
      expect(result.success).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    test('should reset password with valid token', async () => {
      const resetToken = 'valid-reset-token';
      const email = 'test@example.com';
      const newPassword = 'newPassword123';
      
      mockRedis.get.mockResolvedValue(email); // Token maps to email
      mockRedis.del.mockResolvedValue(1);
      
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 'user-id' }] }),
        release: jest.fn()
      };
      
      mockDbClient.connect.mockResolvedValue(mockClient);
      
      const result = await authService.resetPassword(resetToken, newPassword);
      
      expect(result.success).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(`reset:${email}`);
    });
  });

  describe('Logout', () => {
    test('should successfully logout user', async () => {
      const accessToken = 'valid-access-token';
      const refreshToken = 'valid-refresh-token';
      const userId = 'user-id';
      
      mockRedis.setex.mockResolvedValue('OK'); // Blacklist access token
      mockRedis.del.mockResolvedValue(1); // Remove refresh token
      
      const result = await authService.logout(accessToken, refreshToken);
      
      expect(result.success).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalled(); // Access token blacklisted
      expect(mockRedis.del).toHaveBeenCalled(); // Refresh token removed
    });
  });
});