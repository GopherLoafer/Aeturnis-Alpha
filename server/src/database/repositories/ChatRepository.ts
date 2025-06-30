/**
 * Chat Repository
 * Database operations for chat system management
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export interface ChatChannel {
  id: number;
  name: string;
  type: string;
  description?: string;
  password_hash?: string;
  max_members: number;
  member_count: number;
  is_moderated: boolean;
  auto_moderate: boolean;
  guild_id?: number;
  zone_id?: string;
  settings: any;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  id: number;
  channel_id: number;
  user_id: string;
  character_id?: number;
  content: string;
  message_type: string;
  edited_at?: Date;
  deleted_at?: Date;
  is_flagged: boolean;
  flagged_reason?: string;
  flagged_by?: string;
  attachments: any[];
  mentions: any[];
  created_at: Date;
}

export interface DirectMessage {
  id: number;
  sender_id: string;
  recipient_id: string;
  content: string;
  message_type: string;
  is_read: boolean;
  read_at?: Date;
  is_flagged: boolean;
  attachments: any[];
  created_at: Date;
}

export interface CreateMessageData {
  channel_id: number;
  user_id: string;
  character_id?: number;
  content: string;
  message_type?: string;
  mentions?: any[];
}

export class ChatRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Get channel by ID
   */
  async getChannel(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM chat_channels WHERE id = $1',
          [channelId];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get chat channel', {
        channelId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get channel by name
   */
  async getChannelByName(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM chat_channels WHERE LOWER(name) = LOWER($1)',
          [name];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get chat channel by name', {
        name,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Create a new chat message
   */
  async createMessage(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(;
          `INSERT INTO chat_messages (channel_id, user_id, character_id, content, message_type, mentions);
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            data.channel_id,
            data.user_id,
            data.character_id,
            data.content,
            data.message_type || 'text',
            JSON.stringify(data.mentions || []);
          ]
        );
        
        logger.info('Chat message created', {
          messageId: result.rows[0].id,
          channelId: data.channel_id,
          userId: data.user_id,
        });
        
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create chat message', {
        data,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get recent messages from a channel
   */
  async getChannelMessages(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `SELECT cm.*, c.name as character_name 
           FROM chat_messages cm
           LEFT JOIN characters c ON cm.character_id = c.id
           WHERE cm.channel_id = $1 AND cm.deleted_at IS NULL
           ORDER BY cm.created_at DESC
           LIMIT $2 OFFSET $3`,
          [channelId, limit, offset];
        );
        
        return result.rows.reverse(); // Return in chronological order
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get channel messages', {
        channelId,
        limit,
        offset,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Check if user is member of channel
   */
  async isChannelMember(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT id FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2',
          [channelId, userId];
        );
        
        return result.rows.length > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to check channel membership', {
        channelId,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Join a channel
   */
  async joinChannel(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');

        // Check if already a member
        const existingResult = await client.query(
          'SELECT id FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2',
          [channelId, userId];
        );

        if (existingResult.rows.length > 0) {
          await client.query('ROLLBACK');
          return; // Already a member
        }

        // Add member
        await client.query(
          `INSERT INTO chat_channel_members (channel_id, user_id);
           VALUES ($1, $2)`,
          [channelId, userId]
        );

        await client.query('COMMIT');
        
        logger.info('User joined channel', {
          channelId,
          userId,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to join channel', {
        channelId,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Create a direct message
   */
  async createDirectMessage(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(;
          `INSERT INTO direct_messages (sender_id, recipient_id, content, message_type);
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [senderId, recipientId, content, messageType]
        );
        
        logger.info('Direct message created', {
          messageId: result.rows[0].id,
          senderId,
          recipientId,
        });
        
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create direct message', {
        senderId,
        recipientId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get conversation between two users
   */
  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `SELECT * FROM direct_messages 
           WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
           ORDER BY created_at DESC
           LIMIT $3`,
          [userId1, userId2, limit];
        );
        
        return result.rows.reverse(); // Return in chronological order
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get conversation', {
        userId1,
        userId2,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Flag a message for moderation
   */
  async flagMessage(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        await client.query(
          `UPDATE chat_messages 
           SET is_flagged = true, flagged_reason = $1, flagged_by = $2
           WHERE id = $3`,
          [reason, flaggedBy, messageId]
        );
        
        logger.info('Message flagged', {
          messageId,
          reason,
          flaggedBy,`
});
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to flag message', {
        messageId,
        reason,
        flaggedBy,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get all public channels
   */
  async getPublicChannels(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `SELECT * FROM chat_channels 
           WHERE type = 'public' 
           ORDER BY member_count DESC, created_at ASC`;
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get public channels', {
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get zone-specific channels
   */
  async getZoneChannels(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM chat_channels WHERE zone_id = $1 ORDER BY created_at ASC',
          [zoneId];
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get zone channels', {
        zoneId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }
}