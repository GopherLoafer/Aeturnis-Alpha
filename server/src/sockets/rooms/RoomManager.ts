/**
 * Socket.io Room Management System
 * Handles room organization and access control for real-time communication
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { SocketWithAuth } from '../middleware/auth';
import { getRedis } from '../../config/database';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export interface RoomAccess {
  userId: string;
  characterId?: string;
  guildId?: string;
  permissions: string[];
}

export class RoomManager {
  private io?: SocketIOServer;

  public setIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Join user's personal room for direct messages and notifications
   */
  public async joinUserRoom(req: Request, res: Response): Promise<void> {
    const roomName = `user:${userId}`;
    
    try {
      await socket.join(roomName);
      
      logger.debug('User joined personal room', {
        socketId: socket.id,
        userId,
        roomName,
      });

      // Track room membership in Redis
      await this.trackRoomMembership(userId, roomName, 'user');
      
    } catch (error) {
      logger.error('Failed to join user room', {
        socketId: socket.id,
        userId,
        roomName,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Join character-specific room for player events
   */
  public async joinCharacterRoom(req: Request, res: Response): Promise<void> {
    const roomName = `character:${characterId}`;
    
    try {
      // Verify character ownership
      const hasAccess = await this.validateCharacterAccess(socket.userId, characterId);
      if (!hasAccess) {
        throw new Error('Character access denied');
      }

      await socket.join(roomName);
      
      logger.debug('Character joined room', {
        socketId: socket.id,
        userId: socket.userId,
        characterId,
        roomName,
      });

      // Update socket character ID
      socket.characterId = characterId;

      // Track room membership
      await this.trackRoomMembership(socket.userId, roomName, 'character');

      // Update presence with character info
      await this.updateCharacterPresence(socket.userId, characterId, true);
      
    } catch (error) {
      logger.error('Failed to join character room', {
        socketId: socket.id,
        userId: socket.userId,
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Join zone room for area-specific events
   */
  public async joinZone(req: Request, res: Response): Promise<void> {
    const roomName = `zone:${zoneName}`;
    
    try {
      // Verify character is in zone
      const hasAccess = await this.validateZoneAccess(socket.userId, socket.characterId, zoneName);
      if (!hasAccess) {
        throw new Error('Zone access denied');
      }

      // Leave previous zone room if any
      await this.leavePreviousZone(socket);

      await socket.join(roomName);
      
      logger.debug('Character joined zone', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: socket.characterId,
        zoneName,
        roomName,
      });

      // Track room membership
      await this.trackRoomMembership(socket.userId, roomName, 'zone', { zoneName });

      // Broadcast arrival to zone
      socket.to(roomName).emit('zone:character_entered', {
        characterId: socket.characterId,
        userId: socket.userId,
        zoneName,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      logger.error('Failed to join zone', {
        socketId: socket.id,
        userId: socket.userId,
        zoneName,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Join combat room for battle instances
   */
  public async joinCombat(req: Request, res: Response): Promise<void> {
    const roomName = `combat:${sessionId}`;
    
    try {
      // Verify player is in combat session
      const hasAccess = await this.validateCombatAccess(socket.userId, socket.characterId, sessionId);
      if (!hasAccess) {
        throw new Error('Combat session access denied');
      }

      await socket.join(roomName);
      
      logger.debug('Character joined combat', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: socket.characterId,
        sessionId,
        roomName,
      });

      // Track room membership
      await this.trackRoomMembership(socket.userId, roomName, 'combat', { sessionId });

      // Send current combat state
      const combatState = await this.getCombatState(sessionId);
      socket.emit('combat:state', combatState);
      
    } catch (error) {
      logger.error('Failed to join combat', {
        socketId: socket.id,
        userId: socket.userId,
        sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Join guild room for guild communications
   */
  public async joinGuild(req: Request, res: Response): Promise<void> {
    const roomName = `guild:${guildId}`;
    
    try {
      // Verify guild membership
      const hasAccess = await this.validateGuildAccess(socket.userId, guildId);
      if (!hasAccess) {
        throw new Error('Guild access denied');
      }

      await socket.join(roomName);
      
      logger.debug('User joined guild room', {
        socketId: socket.id,
        userId: socket.userId,
        guildId,
        roomName,
      });

      // Track room membership
      await this.trackRoomMembership(socket.userId, roomName, 'guild', { guildId });
      
    } catch (error) {
      logger.error('Failed to join guild', {
        socketId: socket.id,
        userId: socket.userId,
        guildId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Join global rooms for server-wide communications
   */
  public async joinGlobalRooms(req: Request, res: Response): Promise<void> {
    const globalRooms = ['global:chat', 'global:events'];
    
    try {
      for (const roomName of globalRooms) {
        await socket.join(roomName);
        await this.trackRoomMembership(socket.userId, roomName, 'global');`
}
      
      logger.debug('User joined global rooms', {
        socketId: socket.id,
        userId: socket.userId,
        rooms: globalRooms,
      });
      
    } catch (error) {
      logger.error('Failed to join global rooms', {
        socketId: socket.id,
        userId: socket.userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Clean up user's rooms on disconnect
   */
  public async cleanupUserRooms(socket: SocketWithAuth, userId: string): Promise<void> { try {
      // Get all rooms the user was in
      const userRooms = await this.getUserRooms(userId);
      
      // Leave all rooms
      for (const roomName of userRooms) {
        socket.leave(roomName); }
}

      // Clean up tracking data
      await this.clearRoomMembership(userId);
      
      logger.debug('User rooms cleaned up', {
        socketId: socket.id,
        userId,
        roomCount: userRooms.length,
      });
      
    } catch (error) {
      logger.error('Failed to cleanup user rooms', {
        socketId: socket.id,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
    }
  }

  /**
   * Restore user's rooms on reconnect
   */
  public async restoreUserRooms(socket: SocketWithAuth, userId: string): Promise<void> { try {
      // Get previously joined rooms
      const previousRooms = await this.getUserRooms(userId);
      
      // Rejoin each room with validation
      for (const roomName of previousRooms) {
        const [roomType, roomId] = roomName.split(':');
        
        try {
          switch (roomType) {
            case 'user':
              await this.joinUserRoom(socket, userId);
              break;
            case 'character':
              if (socket.characterId) {
                await this.joinCharacterRoom(socket, socket.characterId); }
}
              break;
            case 'zone':
              // Validate current zone access
              break;
            case 'guild':
              await this.joinGuild(socket, roomId);
              break;
            case 'global':
              await socket.join(roomName);
              break;
          }
        } catch (error) {
          logger.warn('Failed to restore room access', {
            userId,
            roomName,
            error: error instanceof Error ? getErrorMessage(error) : error,
          });
        }
      }
      
      logger.debug('User rooms restored', {
        socketId: socket.id,
        userId,
        restoredCount: previousRooms.length,
      });
      
    } catch (error) {
      logger.error('Failed to restore user rooms', {
        socketId: socket.id,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
    }
  }

  /**
   * Validate room access permissions
   */
  public async validateRoomAccess(req: Request, res: Response): Promise<void> {
    try {
      switch (roomType) {
        case 'user':
          return socket.userId === roomId;
          
        case 'character':
          return await this.validateCharacterAccess(socket.userId, roomId);
          
        case 'zone':
          return await this.validateZoneAccess(socket.userId, socket.characterId, roomId);
          
        case 'combat':
          return await this.validateCombatAccess(socket.userId, socket.characterId, roomId);
          
        case 'guild':
          return await this.validateGuildAccess(socket.userId, roomId);
          
        case 'global':
          return true; // Global rooms are accessible to all authenticated users
          
        default:
          return false;
      }
    } catch (error) {
      logger.error('Room access validation error', {
        userId: socket.userId,
        roomType,
        roomId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      return false;
    }
  }

  // Private helper methods

  private async trackRoomMembership(req: Request, res: Response): Promise<void> {
    try {
      const redis = getRedis();
      const key = `user_rooms:${userId}`;
      const membershipData = {
        roomName,
        roomType,
        joinedAt: Date.now(),
        metadata,;
      };
      
      await redis.hset(key, roomName, JSON.stringify(membershipData));
      await redis.expire(key, 3600); // 1 hour TTL
      
    } catch (error) {
      logger.error('Failed to track room membership', {
        userId,
        roomName,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
    }
  }

  private async getUserRooms(req: Request, res: Response): Promise<void> {
    try {
      const redis = getRedis();
      const key = `user_rooms:${userId}`;
      const rooms = await redis.hkeys(key);
      return rooms || [];
    } catch (error) {
      logger.error('Failed to get user rooms', {
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      return [];
    }
  }

  private async clearRoomMembership(req: Request, res: Response): Promise<void> {
    try {
      const redis = getRedis();
      const key = `user_rooms:${userId}`;
      await redis.del(key);
    } catch (error) {
      logger.error('Failed to clear room membership', {
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
    }
  }

  private async leavePreviousZone(req: Request, res: Response): Promise<void> {
    // Get current rooms and leave any zone rooms
    const rooms = Array.from(socket.rooms);
    const zoneRooms = rooms.filter(room => room.startsWith('zone:'));
    
    for (const roomName of zoneRooms) {
      socket.leave(roomName);`
}
  }

  private async validateCharacterAccess(req: Request, res: Response): Promise<void> {
    // TODO: Implement character ownership validation
    // This would query the database to verify the user owns this character
    return true; // Placeholder
  }

  private async validateZoneAccess(req: Request, res: Response): Promise<void> {
    // TODO: Implement zone access validation
    // This would check if the character is actually in this zone
    return true; // Placeholder
  }

  private async validateCombatAccess(req: Request, res: Response): Promise<void> {
    // TODO: Implement combat session validation
    // This would check if the character is part of this combat session
    return true; // Placeholder
  }

  private async validateGuildAccess(req: Request, res: Response): Promise<void> {
    // TODO: Implement guild membership validation
    // This would check if the user is a member of this guild
    return true; // Placeholder
  }

  private async getCombatState(req: Request, res: Response): Promise<void> {
    // TODO: Implement combat state retrieval
    // This would fetch the current state of the combat session
    return {}; // Placeholder
  }

  private async updateCharacterPresence(userId: string, characterId: string, online: boolean): Promise<void> { // TODO: Implement character presence update
    // This would update the character's online status }
}
}