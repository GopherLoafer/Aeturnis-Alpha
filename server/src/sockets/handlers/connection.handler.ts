/**
 * Socket.io Connection Handler
 * Manages connection lifecycle, presence, and room management
 */

import { Server as SocketIOServer } from 'socket.io';
import { SocketWithAuth } from '../middleware/auth';
import { RoomManager } from '../rooms/RoomManager';
import { PresenceManager } from '../presence/PresenceManager';
import { logger } from '../../utils/logger';

const roomManager = new RoomManager();
const presenceManager = new PresenceManager();

export function handleConnection(io: SocketIOServer, socket: SocketWithAuth): void {
  const startTime = Date.now();
  
  logger.info('Socket connected', {
    socketId: socket.id,
    userId: socket.userId,
    characterId: socket.characterId,
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
  });

  // Join user's personal room
  roomManager.joinUserRoom(socket, socket.userId)
    .catch(error => {
      logger.error('Failed to join user room', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      });
    });

  // Update presence to online
  presenceManager.updatePresence(socket.userId, {
    online: true,
    lastSeen: Date.now(),
    socketId: socket.id,
    characterId: socket.characterId,
    activity: 'connected',
    ip: socket.handshake.address,
  }).catch(error => {
    logger.error('Failed to update presence on connection', {
      socketId: socket.id,
      userId: socket.userId,
      error: error.message,
    });
  });

  // Send initial sync data
  sendInitialSyncData(socket)
    .catch(error => {
      logger.error('Failed to send initial sync data', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      });
    });

  const connectionTime = Date.now() - startTime;
  
  logger.debug('Connection setup completed', {
    socketId: socket.id,
    userId: socket.userId,
    setupTime: connectionTime,
  });
}

export function handleDisconnect(socket: SocketWithAuth, reason: string): void {
  const startTime = Date.now();
  
  logger.info('Socket disconnected', {
    socketId: socket.id,
    userId: socket.userId,
    reason,
    connectedDuration: Date.now() - socket.handshake.time,
  });

  // Update presence to offline
  presenceManager.updatePresence(socket.userId, {
    online: false,
    lastSeen: Date.now(),
    socketId: null,
    activity: 'disconnected',
    disconnectReason: reason,
  }).catch(error => {
    logger.error('Failed to update presence on disconnect', {
      socketId: socket.id,
      userId: socket.userId,
      error: error.message,
    });
  });

  // Clean up user's rooms
  roomManager.cleanupUserRooms(socket, socket.userId)
    .catch(error => {
      logger.error('Failed to cleanup rooms on disconnect', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      });
    });

  // Broadcast disconnect to relevant rooms if character was active
  if (socket.characterId) {
    broadcastCharacterOffline(socket)
      .catch(error => {
        logger.error('Failed to broadcast character offline', {
          socketId: socket.id,
          userId: socket.userId,
          characterId: socket.characterId,
          error: error.message,
        });
      });
  }

  const disconnectTime = Date.now() - startTime;
  
  logger.debug('Disconnect cleanup completed', {
    socketId: socket.id,
    userId: socket.userId,
    cleanupTime: disconnectTime,
  });
}

export function handleReconnect(socket: SocketWithAuth): void {
  const startTime = Date.now();
  
  logger.info('Socket reconnected', {
    socketId: socket.id,
    userId: socket.userId,
    characterId: socket.characterId,
  });

  // Restore presence and state
  presenceManager.handleReconnect(socket, socket.userId)
    .then(() => {
      logger.debug('Presence restored on reconnect', {
        socketId: socket.id,
        userId: socket.userId,
      });
    })
    .catch(error => {
      logger.error('Failed to restore presence on reconnect', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      });
    });

  // Rejoin rooms
  roomManager.restoreUserRooms(socket, socket.userId)
    .then(() => {
      logger.debug('Rooms restored on reconnect', {
        socketId: socket.id,
        userId: socket.userId,
      });
    })
    .catch(error => {
      logger.error('Failed to restore rooms on reconnect', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      });
    });

  // Send sync data for any missed events
  sendReconnectSyncData(socket)
    .catch(error => {
      logger.error('Failed to send reconnect sync data', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message,
      });
    });

  const reconnectTime = Date.now() - startTime;
  
  logger.debug('Reconnect setup completed', {
    socketId: socket.id,
    userId: socket.userId,
    setupTime: reconnectTime,
  });
}

async function sendInitialSyncData(socket: SocketWithAuth): Promise<void> {
  try {
    // Get user's current state
    const presence = await presenceManager.getPresence(socket.userId);
    
    // Send initial data
    socket.emit('sync:initial', {
      userId: socket.userId,
      socketId: socket.id,
      presence,
      serverTime: Date.now(),
      version: '1.0.0',
    });

    // If user has an active character, send character data
    if (socket.characterId) {
      socket.emit('character:sync', {
        characterId: socket.characterId,
        // Character data would be fetched from database
      });
    }

    logger.debug('Initial sync data sent', {
      socketId: socket.id,
      userId: socket.userId,
      hasCharacter: !!socket.characterId,
    });

  } catch (error) {
    logger.error('Error sending initial sync data', {
      socketId: socket.id,
      userId: socket.userId,
      error: error instanceof Error ? error.message : error,
    });
    
    // Send error response
    socket.emit('sync:error', {
      message: 'Failed to load initial data',
      retry: true,
    });
  }
}

async function sendReconnectSyncData(socket: SocketWithAuth): Promise<void> {
  try {
    // Get last known state
    const presence = await presenceManager.getPresence(socket.userId);
    
    socket.emit('sync:reconnect', {
      userId: socket.userId,
      socketId: socket.id,
      presence,
      serverTime: Date.now(),
      reconnected: true,
    });

    logger.debug('Reconnect sync data sent', {
      socketId: socket.id,
      userId: socket.userId,
    });

  } catch (error) {
    logger.error('Error sending reconnect sync data', {
      socketId: socket.id,
      userId: socket.userId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

async function broadcastCharacterOffline(socket: SocketWithAuth): Promise<void> {
  if (!socket.characterId) return;

  try {
    // Broadcast to character's zone that they went offline
    socket.to(`character:${socket.characterId}`).emit('character:offline', {
      characterId: socket.characterId,
      userId: socket.userId,
      timestamp: Date.now(),
    });

    logger.debug('Character offline broadcast sent', {
      socketId: socket.id,
      userId: socket.userId,
      characterId: socket.characterId,
    });

  } catch (error) {
    logger.error('Error broadcasting character offline', {
      socketId: socket.id,
      userId: socket.userId,
      characterId: socket.characterId,
      error: error instanceof Error ? error.message : error,
    });
  }
}