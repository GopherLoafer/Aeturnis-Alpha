/**
 * Socket.io Event Handlers
 * Central handler registration for all socket events
 */

import { Server as SocketIOServer } from 'socket.io';
import { SocketWithAuth } from '../middleware/auth';
import { handleConnection, handleDisconnect, handleReconnect } from './connection.handler';
import { registerCharacterHandlers } from './character.handler';
import { registerCombatHandlers } from './combat.handler';
import { registerChatHandlers } from './chat.handler';
import { logger } from '../../utils/logger';

export function attachHandlers(io: SocketIOServer): void {
  logger.info('Attaching Socket.io event handlers');

  io.on('connection', (socket: SocketWithAuth) => {
    logger.debug('New socket connection, setting up handlers', {
      socketId: socket.id,
      userId: socket.userId,
    });

    // Connection lifecycle handlers
    handleConnection(io, socket);
    
    socket.on('disconnect', (reason) => {
      handleDisconnect(socket, reason);
    });

    socket.on('reconnect', () => {
      handleReconnect(socket);
    });

    // Feature-specific handlers
    registerCharacterHandlers(io, socket);
    registerCombatHandlers(io, socket);
    registerChatHandlers(io, socket);

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId: socket.userId,
        error: error.message || error,
        stack: error.stack,
      });
    });

    logger.info('Socket handlers attached successfully', {
      socketId: socket.id,
      userId: socket.userId,
    });
  });

  logger.info('Socket.io event handlers attached successfully');
}