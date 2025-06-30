/**
 * Realtime Service
 * Central service for broadcasting events across the application
 */

import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export class RealtimeService {
  private io: SocketIOServer;
  private metrics: Map<string, number> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * Broadcast event to all users in a specific zone
   */
  public async broadcastToZone(zoneName: string, event: string, data: any): Promise<void> {
    try {
      const roomName = `zone:${zoneName}`;
      this.io.to(roomName).emit(event, data);
      
      this.logBroadcast('zone', zoneName, event);
      this.trackMetric(`broadcast.zone.${event}`);
      
    } catch (error) {
      logger.error('Failed to broadcast to zone', {
        zoneName,
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Broadcast event to a specific user
   */
  public async broadcastToUser(userId: string, event: string, data: any): Promise<void> {
    try {
      const roomName = `user:${userId}`;
      this.io.to(roomName).emit(event, data);
      
      this.logBroadcast('user', userId, event);
      this.trackMetric(`broadcast.user.${event}`);
      
    } catch (error) {
      logger.error('Failed to broadcast to user', {
        userId,
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Broadcast event to a specific character
   */
  public async broadcastToCharacter(characterId: string, event: string, data: any): Promise<void> {
    try {
      const roomName = `character:${characterId}`;
      this.io.to(roomName).emit(event, data);
      
      this.logBroadcast('character', characterId, event);
      this.trackMetric(`broadcast.character.${event}`);
      
    } catch (error) {
      logger.error('Failed to broadcast to character', {
        characterId,
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Broadcast event to all guild members
   */
  public async broadcastToGuild(guildId: string, event: string, data: any): Promise<void> {
    try {
      // Verify guild exists
      const guildExists = await this.verifyGuildExists(guildId);
      if (!guildExists) {
        logger.warn('Attempted to broadcast to non-existent guild', { guildId });
        return;
      }

      const roomName = `guild:${guildId}`;
      this.io.to(roomName).emit(event, data);
      
      this.logBroadcast('guild', guildId, event);
      this.trackMetric(`broadcast.guild.${event}`);
      
    } catch (error) {
      logger.error('Failed to broadcast to guild', {
        guildId,
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Broadcast event to all combat participants
   */
  public async broadcastToCombat(sessionId: string, event: string, data: any): Promise<void> {
    try {
      const roomName = `combat:${sessionId}`;
      this.io.to(roomName).emit(event, data);
      
      this.logBroadcast('combat', sessionId, event);
      this.trackMetric(`broadcast.combat.${event}`);
      
    } catch (error) {
      logger.error('Failed to broadcast to combat', {
        sessionId,
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Broadcast event globally to all connected users
   */
  public async broadcastGlobal(event: string, data: any): Promise<void> {
    try {
      this.io.to('global:events').emit(event, data);
      
      this.logBroadcast('global', 'all', event);
      this.trackMetric(`broadcast.global.${event}`);
      
    } catch (error) {
      logger.error('Failed to broadcast globally', {
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Send announcement to all players
   */
  public async sendAnnouncement(message: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<void> {
    try {
      const announcement = {
        message,
        priority,
        timestamp: Date.now(),
        type: 'announcement'
      };

      await this.broadcastGlobal('system:announcement', announcement);
      
      logger.info('System announcement sent', {
        message,
        priority,
        timestamp: announcement.timestamp,
      });
      
    } catch (error) {
      logger.error('Failed to send announcement', {
        message,
        priority,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Notify specific users about system events
   */
  public async notifyUsers(userIds: string[], event: string, data: any): Promise<void> {
    try {
      const promises = userIds.map(userId => this.broadcastToUser(userId, event, data));
      await Promise.allSettled(promises);
      
      logger.debug('Bulk user notification sent', {
        userCount: userIds.length,
        event
      });
      
    } catch (error) {
      logger.error('Failed to notify users', {
        userCount: userIds.length,
        event,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Send real-time game state updates
   */
  public async sendGameStateUpdate(zoneName: string, updates: any): Promise<void> {
    try {
      await this.broadcastToZone(zoneName, 'game:state_update', {
        updates,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('Failed to send game state update', {
        zoneName,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get realtime service statistics
   */
  public getMetrics(): { [key: string]: number } {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Get connected clients count
   */
  public getConnectedCount(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * Get rooms information
   */
  public getRoomsInfo(): { roomName: string; clientCount: number }[] {
    const rooms = this.io.sockets.adapter.rooms;
    const roomsInfo: { roomName: string; clientCount: number }[] = [];
    
    rooms.forEach((clients, roomName) => {
      // Skip individual socket rooms
      if (!roomName.includes(':')) return;
      
      roomsInfo.push({
        roomName,
        clientCount: clients.size,
      });
    });
    
    return roomsInfo;
  }

  // Private helper methods

  private logBroadcast(type: string, target: string, event: string): void {
    logger.debug('Event broadcast', {
      type,
      target,
      event,
      timestamp: Date.now(),
    });
  }

  private trackMetric(metric: string): void {
    const current = this.metrics.get(metric) || 0;
    this.metrics.set(metric, current + 1);
  }

  private async verifyGuildExists(guildId: string): Promise<boolean> {
    // TODO: Implement guild existence check
    return true; // Placeholder
  }

  /**
   * Combat room management methods
   */

  public async joinCombatRoom(socketId: string, sessionId: string): Promise<void> {
    try {
      const roomName = `combat:${sessionId}`;
      const socket = this.io?.sockets.sockets.get(socketId);
      
      if (socket) {
        await socket.join(roomName);
        
        logger.debug('Socket joined combat room', {
          socketId,
          sessionId,
          roomName
        });
      }
      
    } catch (error) {
      logger.error('Failed to join combat room', {
        socketId,
        sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  public async leaveCombatRoom(socketId: string, sessionId: string): Promise<void> {
    try {
      const roomName = `combat:${sessionId}`;
      const socket = this.io?.sockets.sockets.get(socketId);
      
      if (socket) {
        await socket.leave(roomName);
        
        logger.debug('Socket left combat room', {
          socketId,
          sessionId,
          roomName
        });
      }
      
    } catch (error) {
      logger.error('Failed to leave combat room', {
        socketId,
        sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }
}