/**
 * Chat Event Handlers
 * Handles all chat communication including messages, whispers, and emotes
 */

import { Server as SocketIOServer } from 'socket.io';
import { SocketWithAuth } from '../middleware/auth';
import { PresenceManager } from '../presence/PresenceManager';
import { getRedis } from '../../config/database';
import { logger } from '../../utils/logger';
import { repositories } from '../../database/repositories';
import { getErrorMessage } from '../utils/errorUtils';

const presenceManager = new PresenceManager();

export interface ChatMessageData {
  channel: 'zone' | 'global' | 'guild';
  message: string;
  timestamp: number;
}

export interface WhisperData {
  targetUserId: string;
  message: string;
  timestamp: number;
}

export interface EmoteData {
  emote: string;
  target?: string;
  timestamp: number;
}

export function registerChatHandlers(io: SocketIOServer, socket: SocketWithAuth): void {

  socket.on('chat:message', async (data: ChatMessageData) => {
    const startTime = Date.now();
    
    try {
      // Validate message data
      if (!isValidChatMessage(data)) {
        socket.emit('chat:error', {
          code: 'INVALID_MESSAGE',
          message: 'Invalid message format',
        });
        return;
      }

      // Check message content for profanity and spam
      const contentCheck = await validateMessageContent(data.message);
      if (!contentCheck.valid) {
        socket.emit('chat:error', {
          code: 'CONTENT_BLOCKED',
          message: contentCheck.reason,
        });
        return;
      }

      // Check chat permissions for channel
      const hasPermission = await checkChatPermissions(socket, data.channel);
      if (!hasPermission.allowed) {
        socket.emit('chat:error', {
          code: 'PERMISSION_DENIED',
          message: hasPermission.reason,
        });
        return;
      }

      // Store message in chat history
      const messageId = await storeChatMessage(socket.userId, data);

      // Track activity
      await presenceManager.trackActivity(socket.userId, 'chat', {
        channel: data.channel,
        messageLength: data.message.length,
      });

      // Prepare message for broadcast
      const broadcastMessage = {
        id: messageId,
        userId: socket.userId,
        characterId: socket.characterId,
        channel: data.channel,
        message: data.message,
        timestamp: data.timestamp,
        serverTimestamp: Date.now(),
      };

      // Broadcast to appropriate room
      await broadcastChatMessage(socket, data.channel, broadcastMessage);

      const processTime = Date.now() - startTime;

      logger.debug('Chat message processed', {
        socketId: socket.id,
        userId: socket.userId,
        channel: data.channel,
        messageLength: data.message.length,
        processTime,
      });

    } catch (error) {
      logger.error('Chat message error', {
        socketId: socket.id,
        userId: socket.userId,
        channel: data.channel,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('chat:error', {
        code: 'MESSAGE_FAILED',
        message: 'Failed to send message',
      });
    }
  });

  socket.on('chat:whisper', async (data: WhisperData) => {
    try {
      // Validate whisper data
      if (!isValidWhisper(data)) {
        socket.emit('chat:error', {
          code: 'INVALID_WHISPER',
          message: 'Invalid whisper format',
        });
        return;
      }

      // Check if target user exists and is online
      const targetOnline = await isUserOnline(data.targetUserId);
      if (!targetOnline) {
        socket.emit('chat:error', {
          code: 'USER_OFFLINE',
          message: 'Target user is not online',
        });
        return;
      }

      // Check if sender is blocked by target
      const isBlocked = await checkIfBlocked(socket.userId, data.targetUserId);
      if (isBlocked) {
        socket.emit('chat:error', {
          code: 'USER_BLOCKED',
          message: 'You are blocked by this user',
        });
        return;
      }

      // Validate message content
      const contentCheck = await validateMessageContent(data.message);
      if (!contentCheck.valid) {
        socket.emit('chat:error', {
          code: 'CONTENT_BLOCKED',
          message: contentCheck.reason,
        });
        return;
      }

      // Store whisper in message history
      const messageId = await storeWhisperMessage(socket.userId, data);

      // Track activity
      await presenceManager.trackActivity(socket.userId, 'whisper', {
        targetUserId: data.targetUserId,
      });

      // Send whisper to target user's room
      const whisperMessage = {
        id: messageId,
        fromUserId: socket.userId,
        fromCharacterId: socket.characterId,
        toUserId: data.targetUserId,
        message: data.message,
        timestamp: data.timestamp,
        serverTimestamp: Date.now(),
      };

      // Send to target
      io.to(`user:${data.targetUserId}`).emit('chat:whisper_received', whisperMessage);

      // Send confirmation to sender
      socket.emit('chat:whisper_sent', {
        targetUserId: data.targetUserId,
        message: data.message,
        timestamp: Date.now(),
      });

      logger.debug('Whisper sent', {
        socketId: socket.id,
        fromUserId: socket.userId,
        toUserId: data.targetUserId,
      });

    } catch (error) {
      logger.error('Whisper error', {
        socketId: socket.id,
        userId: socket.userId,
        targetUserId: data.targetUserId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('chat:error', {
        code: 'WHISPER_FAILED',
        message: 'Failed to send whisper',
      });
    }
  });

  socket.on('chat:emote', async (data: EmoteData) => {
    try {
      if (!socket.characterId) {
        socket.emit('chat:error', {
          code: 'NO_CHARACTER',
          message: 'No character selected',
        });
        return;
      }

      // Validate emote data
      if (!isValidEmote(data)) {
        socket.emit('chat:error', {
          code: 'INVALID_EMOTE',
          message: 'Invalid emote format',
        });
        return;
      }

      // Check if emote is allowed
      const emoteCheck = await validateEmote(data.emote);
      if (!emoteCheck.valid) {
        socket.emit('chat:error', {
          code: 'EMOTE_BLOCKED',
          message: emoteCheck.reason,
        });
        return;
      }

      // Track activity
      await presenceManager.trackActivity(socket.userId, 'emote', {
        emote: data.emote,
        hasTarget: !!data.target,
      });

      // Get character's current zone
      const currentZone = await getCharacterZone(socket.characterId);
      if (!currentZone) {
        socket.emit('chat:error', {
          code: 'NO_ZONE',
          message: 'Character is not in a zone',
        });
        return;
      }

      // Prepare emote for broadcast
      const emoteMessage = {
        characterId: socket.characterId,
        userId: socket.userId,
        emote: data.emote,
        target: data.target,
        timestamp: data.timestamp,
        serverTimestamp: Date.now(),
      };

      // Broadcast emote to zone
      io.to(`zone:${currentZone}`).emit('chat:emote', emoteMessage);

      logger.debug('Emote broadcast', {
        socketId: socket.id,
        characterId: socket.characterId,
        emote: data.emote,
        zone: currentZone,
      });

    } catch (error) {
      logger.error('Emote error', {
        socketId: socket.id,
        characterId: socket.characterId,
        emote: data.emote,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('chat:error', {
        code: 'EMOTE_FAILED',
        message: 'Failed to process emote',
      });
    }
  });

  socket.on('chat:history', async (data: { channel: string; limit?: number }) => {
    try {
      const limit = Math.min(data.limit || 50, 100); // Max 100 messages
      
      // Check permissions to view channel history
      const hasPermission = await checkChatPermissions(socket, data.channel);
      if (!hasPermission.allowed) {
        socket.emit('chat:error', {
          code: 'PERMISSION_DENIED',
          message: hasPermission.reason,
        });
        return;
      }

      // Get chat history
      const history = await getChatHistory(data.channel, limit);

      // Send history to client
      socket.emit('chat:history', {
        channel: data.channel,
        messages: history,
        timestamp: Date.now(),
      });

    } catch (error) {
      logger.error('Chat history error', {
        socketId: socket.id,
        channel: data.channel,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('chat:error', {
        code: 'HISTORY_FAILED',
        message: 'Failed to load chat history',
      });
    }
  });

  socket.on('chat:typing', async (data: { channel: string; typing: boolean }) => {
    try {
      if (!socket.characterId) return;

      // Get current zone for zone chat
      let roomName = '';
      if (data.channel === 'zone') {
        const currentZone = await getCharacterZone(socket.characterId);
        if (!currentZone) return;
        roomName = `zone:${currentZone}`;
      } else if (data.channel === 'global') {
        roomName = 'global:chat';
      } else if (data.channel === 'guild') {
        // TODO: Get user's guild
        return;
      }

      // Broadcast typing status
      socket.to(roomName).emit('chat:typing_status', {
        characterId: socket.characterId,
        userId: socket.userId,
        channel: data.channel,
        typing: data.typing,
        timestamp: Date.now(),
      });

    } catch (error) {
      logger.error('Chat typing error', {
        socketId: socket.id,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
    }
  });
}

// Helper functions

function isValidChatMessage(data: ChatMessageData): boolean {
  return (
    typeof data.channel === 'string' &&
    ['zone', 'global', 'guild'].includes(data.channel) &&
    typeof data.message === 'string' &&
    data.message.trim().length > 0 &&
    data.message.length <= 500 &&
    typeof data.timestamp === 'number'
  );
}

function isValidWhisper(data: WhisperData): boolean {
  return (
    typeof data.targetUserId === 'string' &&
    data.targetUserId.length > 0 &&
    typeof data.message === 'string' &&
    data.message.trim().length > 0 &&
    data.message.length <= 500 &&
    typeof data.timestamp === 'number'
  );
}

function isValidEmote(data: EmoteData): boolean {
  return (
    typeof data.emote === 'string' &&
    data.emote.length > 0 &&
    data.emote.length <= 50 &&
    typeof data.timestamp === 'number'
  );
}

async function validateMessageContent(message: string): Promise<{
  valid: boolean;
  reason?: string;
}> {
  // TODO: Implement profanity filter and spam detection
  const trimmed = message.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Empty message' };
  }
  
  if (trimmed.length > 500) {
    return { valid: false, reason: 'Message too long' };
  }
  
  // Basic checks - in production would use proper content filtering
  const badWords = ['spam', 'scam']; // Placeholder
  const hasBadWords = badWords.some(word => 
    trimmed.toLowerCase().includes(word.toLowerCase())
  );
  
  if (hasBadWords) {
    return { valid: false, reason: 'Inappropriate content' };
  }
  
  return { valid: true };
}

async function checkChatPermissions(socket: SocketWithAuth, channel: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  switch (channel) {
    case 'zone':
      // Need to have a character and be in a zone
      if (!socket.characterId) {
        return { allowed: false, reason: 'No character selected' };
      }
      return { allowed: true };
      
    case 'global':
      // All authenticated users can use global chat
      return { allowed: true };
      
    case 'guild':
      // TODO: Check guild membership
      return { allowed: true }; // Placeholder
      
    default:
      return { allowed: false, reason: 'Unknown channel' };
  }
}

async function storeChatMessage(userId: string, data: ChatMessageData): Promise<string> {
  try {
    const redis = getRedis();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const messageData = {
      id: messageId,
      userId,
      channel: data.channel,
      message: data.message,
      timestamp: data.timestamp,
      serverTimestamp: Date.now(),
    };
    
    // Store in channel history
    const historyKey = `chat_history:${data.channel}`;
    await redis.lpush(historyKey, JSON.stringify(messageData));
    await redis.ltrim(historyKey, 0, 999); // Keep last 1000 messages
    await redis.expire(historyKey, 86400 * 7); // 7 days TTL
    
    return messageId;
  } catch (error) {
    logger.error('Failed to store chat message', {
      userId,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    return `temp_${Date.now()}`;
  }
}

async function storeWhisperMessage(userId: string, data: WhisperData): Promise<string> {
  try {
    const redis = getRedis();
    const messageId = `whisper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const messageData = {
      id: messageId,
      fromUserId: userId,
      toUserId: data.targetUserId,
      message: data.message,
      timestamp: data.timestamp,
      serverTimestamp: Date.now(),
    };
    
    // Store in both users' whisper history
    const fromKey = `whisper_history:${userId}`;
    const toKey = `whisper_history:${data.targetUserId}`;
    
    await redis.lpush(fromKey, JSON.stringify(messageData));
    await redis.lpush(toKey, JSON.stringify(messageData));
    
    // Keep last 500 whispers
    await redis.ltrim(fromKey, 0, 499);
    await redis.ltrim(toKey, 0, 499);
    
    // 30 days TTL
    await redis.expire(fromKey, 86400 * 30);
    await redis.expire(toKey, 86400 * 30);
    
    return messageId;
  } catch (error) {
    logger.error('Failed to store whisper message', {
      userId,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    return `temp_${Date.now()}`;
  }
}

async function broadcastChatMessage(socket: SocketWithAuth, channel: string, message: any): Promise<void> {
  switch (channel) {
    case 'zone':
      if (socket.characterId) {
        const currentZone = await getCharacterZone(socket.characterId);
        if (currentZone) {
          socket.to(`zone:${currentZone}`).emit('chat:message', message);
        }
      }
      break;
      
    case 'global':
      socket.to('global:chat').emit('chat:message', message);
      break;
      
    case 'guild':
      // TODO: Implement guild chat
      break;
  }
  
  // Also send to sender for confirmation
  socket.emit('chat:message_sent', {
    id: message.id,
    channel,
    timestamp: message.serverTimestamp,
  });
}

async function isUserOnline(userId: string): Promise<boolean> {
  try {
    const presence = await presenceManager.getPresence(userId);
    return presence.online;
  } catch (error) {
    return false;
  }
}

async function checkIfBlocked(fromUserId: string, toUserId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const blockKey = `blocks:${toUserId}`;
    const isBlocked = await redis.sismember(blockKey, fromUserId);
    return isBlocked === 1;
  } catch (error) {
    return false;
  }
}

async function validateEmote(emote: string): Promise<{
  valid: boolean;
  reason?: string;
}> {
  // TODO: Implement emote validation against allowed emotes list
  const allowedEmotes = ['smile', 'wave', 'bow', 'dance', 'cheer']; // Placeholder
  
  if (!allowedEmotes.includes(emote)) {
    return { valid: false, reason: 'Unknown emote' };
  }
  
  return { valid: true };
}

async function getCharacterZone(characterId: string): Promise<string | null> {
  // TODO: Implement database query to get character's current zone
  return 'starting_village'; // Placeholder
}

async function getChatHistory(channel: string, limit: number): Promise<any[]> {
  try {
    const redis = getRedis();
    const historyKey = `chat_history:${channel}`;
    const messages = await redis.lrange(historyKey, 0, limit - 1);
    
    return messages.map(msg => JSON.parse(msg)).reverse(); // Oldest first
  } catch (error) {
    logger.error('Failed to get chat history', {
      channel,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    return [];
  }
}