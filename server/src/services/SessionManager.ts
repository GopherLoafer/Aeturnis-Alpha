/**
 * Session Manager
 * Handles user sessions with sliding TTL, metadata storage, and automatic cleanup
 */

import { v4 as uuidv4 } from 'uuid';
import { redisService } from './RedisService';
import { logger } from '../utils/logger';

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
  loginTime: Date;
  lastActivity: Date;
  deviceInfo?: {
    browser?: string;
    os?: string;
    device?: string;
  };
  location?: {
    country?: string;
    city?: string;
  };
  [key: string]: any;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  characterId?: string;
  username: string;
  roles: string[];
  metadata: SessionMetadata;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export interface CreateSessionOptions {
  ttl?: number;
  characterId?: string;
  metadata?: Partial<SessionMetadata>;
}

export class SessionManager {
  private static instance: SessionManager;
  private readonly defaultTTL = 1800; // 30 minutes in seconds
  private readonly keyPrefix = 'session:';
  private readonly userSessionsPrefix = 'user_sessions:';
  private readonly maxSessionsPerUser = 5;

  private constructor() {}

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Create a new session for a user
   */
  public async createSession(
    userId: string,
    username: string,
    roles: string[] = ['user'],
    options: CreateSessionOptions = {}
  ): Promise<SessionData> {
    try {
      const redis = redisService.getClient();
      const sessionId = uuidv4();
      const now = new Date();
      const ttl = options.ttl || this.defaultTTL;
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const sessionData: SessionData = {
        sessionId,
        userId,
        characterId: options.characterId,
        username,
        roles,
        metadata: {
          loginTime: now,
          lastActivity: now,
          ...options.metadata
        },
        createdAt: now,
        lastActivity: now,
        expiresAt
      };

      // Store session data
      const sessionKey = this.buildSessionKey(sessionId);
      const serializedSession = JSON.stringify(sessionData);
      
      await redis.setex(sessionKey, ttl, serializedSession);

      // Add session to user's active sessions
      await this.addToUserSessions(userId, sessionId, ttl);

      // Cleanup old sessions for this user
      await this.cleanupUserSessions(userId);

      logger.info('Session created successfully', {
        sessionId,
        userId,
        username,
        ttl,
        characterId: options.characterId
      });

      return sessionData;
    } catch (error) {
      logger.error('Failed to create session', {
        userId,
        username,
        error: error.message
      });
      throw new Error('Failed to create session');
    }
  }

  /**
   * Get session data by session ID
   */
  public async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const redis = redisService.getClient();
      const sessionKey = this.buildSessionKey(sessionId);
      
      const result = await redis.get(sessionKey);
      if (!result) {
        return null;
      }

      const sessionData: SessionData = JSON.parse(result);
      
      // Convert date strings back to Date objects
      sessionData.createdAt = new Date(sessionData.createdAt);
      sessionData.lastActivity = new Date(sessionData.lastActivity);
      sessionData.expiresAt = new Date(sessionData.expiresAt);
      sessionData.metadata.loginTime = new Date(sessionData.metadata.loginTime);
      sessionData.metadata.lastActivity = new Date(sessionData.metadata.lastActivity);

      // Check if session has expired
      if (sessionData.expiresAt < new Date()) {
        await this.destroySession(sessionId);
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Extend session with sliding window TTL
   */
  public async extendSession(sessionId: string, additionalTTL?: number): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      const sessionKey = this.buildSessionKey(sessionId);
      
      // Get current session data
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      // Update last activity and expiration
      const now = new Date();
      const ttl = additionalTTL || this.defaultTTL;
      const newExpiresAt = new Date(now.getTime() + ttl * 1000);

      sessionData.lastActivity = now;
      sessionData.metadata.lastActivity = now;
      sessionData.expiresAt = newExpiresAt;

      // Save updated session
      const serializedSession = JSON.stringify(sessionData);
      await redis.setex(sessionKey, ttl, serializedSession);

      // Update user sessions TTL
      const userSessionsKey = this.buildUserSessionsKey(sessionData.userId);
      await redis.expire(userSessionsKey, ttl);

      logger.debug('Session extended successfully', {
        sessionId,
        userId: sessionData.userId,
        newExpiresAt,
        ttl
      });

      return true;
    } catch (error) {
      logger.error('Failed to extend session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Update session character
   */
  public async updateSessionCharacter(sessionId: string, characterId: string): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      if (!sessionData) {
        return false;
      }

      sessionData.characterId = characterId;
      sessionData.lastActivity = new Date();
      sessionData.metadata.lastActivity = new Date();

      const redis = redisService.getClient();
      const sessionKey = this.buildSessionKey(sessionId);
      const ttl = Math.ceil((sessionData.expiresAt.getTime() - Date.now()) / 1000);
      
      if (ttl <= 0) {
        await this.destroySession(sessionId);
        return false;
      }

      const serializedSession = JSON.stringify(sessionData);
      await redis.setex(sessionKey, ttl, serializedSession);

      logger.debug('Session character updated', {
        sessionId,
        characterId,
        userId: sessionData.userId
      });

      return true;
    } catch (error) {
      logger.error('Failed to update session character', {
        sessionId,
        characterId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Destroy a session
   */
  public async destroySession(sessionId: string): Promise<boolean> {
    try {
      const redis = redisService.getClient();
      
      // Get session data before deletion
      const sessionData = await this.getSession(sessionId);
      
      // Delete session
      const sessionKey = this.buildSessionKey(sessionId);
      await redis.del(sessionKey);

      // Remove from user sessions if we have the data
      if (sessionData) {
        await this.removeFromUserSessions(sessionData.userId, sessionId);
        
        logger.info('Session destroyed successfully', {
          sessionId,
          userId: sessionData.userId,
          username: sessionData.username
        });
      }

      return true;
    } catch (error) {
      logger.error('Failed to destroy session', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get all active sessions for a user
   */
  public async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const redis = redisService.getClient();
      const userSessionsKey = this.buildUserSessionsKey(userId);
      
      const sessionIds = await redis.smembers(userSessionsKey);
      const sessions: SessionData[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.getSession(sessionId);
        if (sessionData) {
          sessions.push(sessionData);
        } else {
          // Remove invalid session from user's session list
          await redis.srem(userSessionsKey, sessionId);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Destroy all sessions for a user
   */
  public async destroyUserSessions(userId: string): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId);
      let destroyedCount = 0;

      for (const session of sessions) {
        const success = await this.destroySession(session.sessionId);
        if (success) {
          destroyedCount++;
        }
      }

      logger.info('User sessions destroyed', {
        userId,
        destroyedCount,
        totalSessions: sessions.length
      });

      return destroyedCount;
    } catch (error) {
      logger.error('Failed to destroy user sessions', {
        userId,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Clean up expired sessions
   */
  public async cleanupExpiredSessions(): Promise<number> {
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
          const sessionId = key.replace(this.keyPrefix, '');
          const sessionData = await this.getSession(sessionId);
          
          if (!sessionData) {
            cleanedCount++;
          }
        }
      } while (cursor !== '0');

      logger.info('Expired sessions cleanup completed', {
        cleanedCount
      });

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  public async getSessionStats(): Promise<{
    totalActiveSessions: number;
    averageSessionDuration: number;
    uniqueUsers: number;
  }> {
    try {
      const redis = redisService.getClient();
      const pattern = `${this.keyPrefix}*`;
      let totalSessions = 0;
      let totalDuration = 0;
      const uniqueUsers = new Set<string>();
      let cursor = '0';

      do {
        const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        for (const key of keys) {
          const sessionId = key.replace(this.keyPrefix, '');
          const sessionData = await this.getSession(sessionId);
          
          if (sessionData) {
            totalSessions++;
            uniqueUsers.add(sessionData.userId);
            
            const duration = Date.now() - sessionData.createdAt.getTime();
            totalDuration += duration;
          }
        }
      } while (cursor !== '0');

      const averageSessionDuration = totalSessions > 0 
        ? Math.round(totalDuration / totalSessions / 1000) 
        : 0;

      return {
        totalActiveSessions: totalSessions,
        averageSessionDuration,
        uniqueUsers: uniqueUsers.size
      };
    } catch (error) {
      logger.error('Failed to get session stats', {
        error: error.message
      });
      return {
        totalActiveSessions: 0,
        averageSessionDuration: 0,
        uniqueUsers: 0
      };
    }
  }

  /**
   * Add session to user's active sessions
   */
  private async addToUserSessions(userId: string, sessionId: string, ttl: number): Promise<void> {
    const redis = redisService.getClient();
    const userSessionsKey = this.buildUserSessionsKey(userId);
    
    await redis.sadd(userSessionsKey, sessionId);
    await redis.expire(userSessionsKey, ttl + 3600); // Extra hour for cleanup
  }

  /**
   * Remove session from user's active sessions
   */
  private async removeFromUserSessions(userId: string, sessionId: string): Promise<void> {
    const redis = redisService.getClient();
    const userSessionsKey = this.buildUserSessionsKey(userId);
    
    await redis.srem(userSessionsKey, sessionId);
  }

  /**
   * Cleanup old sessions for a user (keep only max allowed)
   */
  private async cleanupUserSessions(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserSessions(userId);
      
      if (sessions.length <= this.maxSessionsPerUser) {
        return;
      }

      // Sort by creation time, oldest first
      sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // Remove oldest sessions
      const sessionsToRemove = sessions.slice(0, sessions.length - this.maxSessionsPerUser);
      
      for (const session of sessionsToRemove) {
        await this.destroySession(session.sessionId);
      }

      logger.info('User session cleanup completed', {
        userId,
        removedSessions: sessionsToRemove.length,
        remainingSessions: this.maxSessionsPerUser
      });
    } catch (error) {
      logger.error('Failed to cleanup user sessions', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Build session key
   */
  private buildSessionKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  /**
   * Build user sessions key
   */
  private buildUserSessionsKey(userId: string): string {
    return `${this.userSessionsPrefix}${userId}`;
  }
}

// Export singleton instance
export const sessionManager = SessionManager.getInstance();