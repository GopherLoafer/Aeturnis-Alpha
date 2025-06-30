/**
 * Presence Management System
 * Tracks user online status, activity, and connection state
 */

import { Socket } from 'socket.io';
import { SocketWithAuth } from '../middleware/auth';
import { getRedis } from '../../config/database';
import { logger } from '../../utils/logger';

export interface PresenceData {
  online: boolean;
  lastSeen: number;
  socketId: string | null;
  characterId?: string;
  zone?: string;
  activity: string;
  ip?: string;
  userAgent?: string;
  disconnectReason?: string;
}

export class PresenceManager {
  private readonly PRESENCE_TTL = 3600; // 1 hour
  private readonly ACTIVITY_TIMEOUT = 300; // 5 minutes

  /**
   * Update user presence data
   */
  public async updatePresence(userId: string, data: Partial<PresenceData>): Promise<void> {
    try {
      const redis = getRedis();
      const key = `presence:${userId}`;
      
      // Get current presence data
      const current = await this.getPresence(userId);
      
      // Merge with new data
      const updated: PresenceData = {
        ...current,
        ...data,
        lastSeen: Date.now(),
      };

      // Store updated presence
      await redis.setex(key, this.PRESENCE_TTL, JSON.stringify(updated));

      // Track in global presence set if online
      if (updated.online) {
        await redis.zadd('online_users', Date.now(), userId);
      } else {
        await redis.zrem('online_users', userId);
      }

      logger.debug('Presence updated', {
        userId,
        online: updated.online,
        activity: updated.activity,
        socketId: updated.socketId,
      });

    } catch (error) {
      logger.error('Failed to update presence', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get user presence data
   */
  public async getPresence(userId: string): Promise<PresenceData> {
    try {
      const redis = getRedis();
      const key = `presence:${userId}`;
      
      const data = await redis.get(key);
      
      if (!data) {
        // Return default offline presence
        return {
          online: false,
          lastSeen: Date.now(),
          socketId: null,
          activity: 'offline',
        };
      }

      const presence: PresenceData = JSON.parse(data);
      
      // Check if presence is stale
      const isStale = Date.now() - presence.lastSeen > this.ACTIVITY_TIMEOUT * 1000;
      if (isStale && presence.online) {
        // Mark as offline if stale
        presence.online = false;
        presence.activity = 'away';
        await this.updatePresence(userId, presence);
      }

      return presence;

    } catch (error) {
      logger.error('Failed to get presence', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      
      // Return default offline presence on error
      return {
        online: false,
        lastSeen: Date.now(),
        socketId: null,
        activity: 'offline',
      };
    }
  }

  /**
   * Handle socket reconnection
   */
  public async handleReconnect(socket: SocketWithAuth, userId: string): Promise<void> {
    try {
      const redis = getRedis();
      
      // Update socket ID in presence
      await this.updatePresence(userId, {
        online: true,
        socketId: socket.id,
        activity: 'reconnected',
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
      });

      // Clean up any stale socket sessions
      await this.cleanupStaleSocketSessions(userId, socket.id);

      logger.info('Presence restored on reconnect', {
        userId,
        socketId: socket.id,
      });

    } catch (error) {
      logger.error('Failed to handle reconnect presence', {
        userId,
        socketId: socket.id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Track user activity
   */
  public async trackActivity(userId: string, activity: string, metadata?: any): Promise<void> {
    try {
      const redis = getRedis();
      
      // Update presence with new activity
      await this.updatePresence(userId, {
        activity,
        lastSeen: Date.now(),
      });

      // Store activity in timeline for analytics
      const activityKey = `activity:${userId}`;
      const activityData = {
        activity,
        timestamp: Date.now(),
        metadata,
      };
      
      await redis.lpush(activityKey, JSON.stringify(activityData));
      await redis.ltrim(activityKey, 0, 99); // Keep last 100 activities
      await redis.expire(activityKey, 86400); // 24 hour TTL

      logger.debug('Activity tracked', {
        userId,
        activity,
        timestamp: Date.now(),
      });

    } catch (error) {
      logger.error('Failed to track activity', {
        userId,
        activity,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Get list of online users
   */
  public async getOnlineUsers(limit = 100): Promise<{
    userId: string;
    lastSeen: number;
    activity: string;
  }[]> {
    try {
      const redis = getRedis();
      
      // Get online users from sorted set
      const userIds = await redis.zrevrange('online_users', 0, limit - 1);
      
      const onlineUsers = [];
      
      for (const userId of userIds) {
        const presence = await this.getPresence(userId);
        if (presence.online) {
          onlineUsers.push({
            userId,
            lastSeen: presence.lastSeen,
            activity: presence.activity,
          });
        }
      }

      return onlineUsers;

    } catch (error) {
      logger.error('Failed to get online users', {
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  }

  /**
   * Get user activity history
   */
  public async getActivityHistory(userId: string, limit = 20): Promise<any[]> {
    try {
      const redis = getRedis();
      const activityKey = `activity:${userId}`;
      
      const activities = await redis.lrange(activityKey, 0, limit - 1);
      
      return activities.map(activity => JSON.parse(activity));

    } catch (error) {
      logger.error('Failed to get activity history', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  }

  /**
   * Get presence statistics
   */
  public async getPresenceStats(): Promise<{
    totalOnline: number;
    totalRegistered: number;
    recentActivity: number;
  }> {
    try {
      const redis = getRedis();
      
      // Count online users
      const totalOnline = await redis.zcard('online_users');
      
      // Count users with presence data
      const presenceKeys = await redis.keys('presence:*');
      const totalRegistered = presenceKeys.length;
      
      // Count recent activity (last 5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const recentActivity = await redis.zcount('online_users', fiveMinutesAgo, '+inf');

      return {
        totalOnline,
        totalRegistered,
        recentActivity,
      };

    } catch (error) {
      logger.error('Failed to get presence stats', {
        error: error instanceof Error ? error.message : error,
      });
      
      return {
        totalOnline: 0,
        totalRegistered: 0,
        recentActivity: 0,
      };
    }
  }

  /**
   * Clean up stale socket sessions
   */
  private async cleanupStaleSocketSessions(userId: string, currentSocketId: string): Promise<void> {
    try {
      const redis = getRedis();
      
      // Get all socket sessions for this user
      const sessionKey = `user_sockets:${userId}`;
      const socketIds = await redis.smembers(sessionKey);
      
      // Remove stale socket IDs
      for (const socketId of socketIds) {
        if (socketId !== currentSocketId) {
          await redis.srem(sessionKey, socketId);
          await redis.del(`socket_session:${socketId}`);
        }
      }

      // Add current socket ID
      await redis.sadd(sessionKey, currentSocketId);
      await redis.expire(sessionKey, this.PRESENCE_TTL);

    } catch (error) {
      logger.error('Failed to cleanup stale socket sessions', {
        userId,
        currentSocketId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Set user away status after inactivity
   */
  public async setAwayStatus(userId: string): Promise<void> {
    try {
      const presence = await this.getPresence(userId);
      
      if (presence.online && presence.activity !== 'away') {
        await this.updatePresence(userId, {
          activity: 'away',
        });

        logger.debug('User set to away status', {
          userId,
          lastActivity: presence.activity,
        });
      }

    } catch (error) {
      logger.error('Failed to set away status', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Clean up offline users periodically
   */
  public async cleanupOfflineUsers(): Promise<void> {
    try {
      const redis = getRedis();
      const cutoff = Date.now() - (this.ACTIVITY_TIMEOUT * 1000);
      
      // Remove inactive users from online set
      await redis.zremrangebyscore('online_users', 0, cutoff);
      
      logger.debug('Cleaned up offline users', {
        cutoff: new Date(cutoff).toISOString(),
      });

    } catch (error) {
      logger.error('Failed to cleanup offline users', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}