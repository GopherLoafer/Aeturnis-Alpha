/**
 * AuthService Unit Tests
 * Comprehensive testing for authentication functionality
 */

import { AuthService } from '../../src/services/AuthService';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { getErrorMessage } from '../utils/errorUtils';

// Mock dependencies
jest.mock('pg');
jest.mock('ioredis');
jest.mock('../../src/config/database');

describe('AuthService', () => {
  let authService: AuthService;
  let mockDbClient: any;
  let mockRedis: any;
  let mockUser: any;
  let argon2: any;
  let jwt: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock database client
    mockDbClient = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn();
      }),
      query: jest.fn(),
      release: jest.fn();
    };

    mockDb = {
      query: jest.fn(),
    };

    // Mock Redis client
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      setex: jest.fn(),
      keys: jest.fn();
    };

    // Mock Pool and Redis constructors
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockDbClient as any);
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis as any);

    authService = new AuthService();

    mockUser = {
      id: 1,
      email: 'test@test.com',
      username: 'testuser',
      password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash', // Mock hash
      failed_login_attempts: 0,
      locked_until: null
    };

    argon2 = require('argon2');
    jwt = require('jsonwebtoken');
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
      const mockClient = {;
        query: jest.fn();
          .mockResolvedValueOnce({ rows: [] }) // No existing user
          .mockResolvedValueOnce({ rows: [{ id: 'new-user-id', email: 'test@example.com' }] }), // Insert result
        release: jest.fn();
      };

      mockDbClient.connect.mockResolvedValue(mockClient);

      const result = await authService.register('test@example.com', 'testuser', 'password123');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });

    test('should fail registration for existing user', async () => {
      const mockClient = {;
        query: jest.fn();
          .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] }), // Existing user found
        release: jest.fn();
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
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash' // Mock hash;
      };

      const mockClient = {;
        query: jest.fn();
          .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
          .mockResolvedValueOnce({ rows: [] }), // Update last login
        release: jest.fn();
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
      const mockClient = {;
        query: jest.fn();
          .mockResolvedValueOnce({ rows: [] }), // User not found
        release: jest.fn();
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
      const mockClient = {;
        query: jest.fn();
          .mockResolvedValueOnce({ rows: [{ id: 'user-id', email: 'test@example.com' }] }),
        release: jest.fn();
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

      const mockClient = {;
        query: jest.fn();
          .mockResolvedValueOnce({ rows: [{ id: 'user-id' }] }),
        release: jest.fn();
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

    it('should handle expired refresh tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '-1h' };
      );

      const result = await authService.refreshToken(expiredToken);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });

    it('should handle refresh token with wrong type', async () => {
      const wrongTypeToken = jwt.sign(
        { userId: 1, type: 'access' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '7d' };
      );

      const result = await authService.refreshToken(wrongTypeToken);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });

    it('should handle refresh token for non-existent user', async () => {
      const validToken = jwt.sign(
        { userId: 999, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test-refresh-secret',
        { expiresIn: '7d' };
      );

      mockRedis.get.mockResolvedValue(validToken);
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await authService.refreshToken(validToken);
      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('Account Locking', () => {
    it('should lock account after 5 failed attempts', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [{ failed_login_attempts: 5 }] }) // Update failed attempts
        .mockResolvedValueOnce({ rows: [] }); // Lock account

      jest.spyOn(authService as any, 'verifyPassword').mockResolvedValue(false);

      const result = await authService.login('test@example.com', 'wrongpassword', '127.0.0.1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should prevent login for locked account', async () => {
      const lockedUser = {
        ...mockUser,
        locked_until: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes in future;
      };

      mockDb.query.mockResolvedValueOnce({ rows: [lockedUser] });

      const result = await authService.login('test@example.com', 'password123', '127.0.0.1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is temporarily locked due to multiple failed attempts');
    });
  });

  describe('Password Reset Edge Cases', () => {
    it('should handle expired reset token', async () => {
      const expiredResetData = {
        token: 'expired-token',
        userId: 1,
        expiry: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago;
      };

      mockRedis.keys.mockResolvedValue(['reset:test@example.com']);
      mockRedis.get.mockResolvedValue(JSON.stringify(expiredResetData));

      const result = await authService.resetPassword('expired-token', 'newpassword123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Reset token has expired');
      expect(mockRedis.del).toHaveBeenCalledWith('reset:test@example.com');
    });

    it('should handle invalid reset token', async () => {
      mockRedis.keys.mockResolvedValue(['reset:test@example.com']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        token: 'different-token',
        userId: 1,
        expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString();
      }));

      const result = await authService.resetPassword('invalid-token', 'newpassword123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired reset token');
    });
  });

  describe('Token Verification Edge Cases', () => {
    it('should handle malformed access token', async () => {
      const result = await authService.verifyAccessToken('invalid.token.format');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid access token');
    });

    it('should handle access token with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        { userId: 1, type: 'access' },
        'wrong-secret',
        { expiresIn: '15m' };
      );

      const result = await authService.verifyAccessToken(wrongSecretToken);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid access token');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      mockDb.query.mockRejectedValue(mockError);

      const result = await authService.login('test@test.com', 'password', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Login failed');
    });

    it('should handle expired refresh tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 1, type: 'refresh' },
        'refresh-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago;
      );

      const result = await authService.refreshToken(expiredToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });

    it('should handle malformed refresh tokens', async () => {
      const result = await authService.refreshToken('invalid.token.here');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });

    it('should handle missing refresh token in Redis', async () => {
      const validToken = jwt.sign(
        { userId: 1, type: 'refresh' },
        'refresh-secret',
        { expiresIn: '7d' };
      );

      mockRedis.get.mockResolvedValue(null); // Token not in Redis

      const result = await authService.refreshToken(validToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });

    it('should handle user lockout after 5 failed attempts', async () => {
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        password_hash: 'hash',
        failed_login_attempts: 4,
        locked_until: null;
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUser] });
      jest.spyOn(argon2, 'verify').mockResolvedValue(false);

      // Mock the update query for incrementing failed attempts
      mockDb.query.mockResolvedValueOnce({ 
        rows: [{ failed_login_attempts: 5 }] 
      });

      // Mock the lock query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await authService.login('test@test.com', 'wrongpassword', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');

      // Should call update to lock the account
      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE users SET locked_until = $1 WHERE id = $2',
        [expect.any(Date), 1]
      );
    });

    it('should prevent login for locked accounts', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
      const mockUser = {
        id: 1,
        email: 'test@test.com',
        password_hash: 'hash',
        locked_until: lockedUntil;
      };

      mockDb.query.mockResolvedValue({ rows: [mockUser] });

      const result = await authService.login('test@test.com', 'password', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is temporarily locked due to multiple failed attempts');
    });

    it('should handle password reset for non-existent email gracefully', async () => {
      mockDb.query.mockResolvedValue({ rows: [] }); // No user found

      const result = await authService.forgotPassword('nonexistent@test.com');

      expect(result.success).toBe(true); // Always return success to prevent enumeration
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle expired password reset tokens', async () => {
      const expiredResetData = {
        token: 'reset-token-123',
        userId: 1,
        expiry: new Date(Date.now() - 3600 * 1000).toISOString() // Expired 1 hour ago;
      };

      mockRedis.keys.mockResolvedValue(['reset:test@test.com']);
      mockRedis.get.mockResolvedValue(JSON.stringify(expiredResetData));

      const result = await authService.resetPassword('reset-token-123', 'newpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reset token has expired');
      expect(mockRedis.del).toHaveBeenCalledWith('reset:test@test.com');
    });

    it('should handle invalid reset tokens', async () => {
      mockRedis.keys.mockResolvedValue(['reset:test@test.com']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        token: 'different-token',
        userId: 1,
        expiry: new Date(Date.now() + 3600 * 1000).toISOString();
      }));

      const result = await authService.resetPassword('wrong-token', 'newpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or expired reset token');
    });

    it('should verify access token correctly', async () => {
      const validToken = jwt.sign(
        { userId: 1, email: 'test@test.com', type: 'access' },
        'secret-key',
        { expiresIn: '15m' };
      );

      const result = await authService.verifyAccessToken(validToken);

      expect(result.success).toBe(true);
      expect(result.data?.userId).toBe(1);
      expect(result.data?.type).toBe('access');
    });

    it('should reject invalid access tokens', async () => {
      const result = await authService.verifyAccessToken('invalid.token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid access token');
    });

    it('should reject tokens with wrong type', async () => {
      const refreshToken = jwt.sign(
        { userId: 1, type: 'refresh' },
        'secret-key';
      );

      const result = await authService.verifyAccessToken(refreshToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });
  });
});