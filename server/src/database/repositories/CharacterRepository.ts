/**
 * Character Repository
 * Database operations for character management in MMORPG
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';

export interface Character {
  id: number;
  user_id: string;
  name: string;
  class: string;
  level: number;
  experience: bigint;
  zone_id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation: number;
  health: number;
  max_health: number;
  mana: number;
  max_mana: number;
  strength: number;
  agility: number;
  intelligence: number;
  status: string;
  last_activity: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCharacterData {
  user_id: string;
  name: string;
  class?: string;
  zone_id?: string;
}

export interface UpdateCharacterPosition {
  zone_id?: string;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  rotation?: number;
}

export interface UpdateCharacterStats {
  health?: number;
  max_health?: number;
  mana?: number;
  max_mana?: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
}

export class CharacterRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Get character by ID with ownership verification
   */
  async getCharacterByIdAndUserId(characterId: number, userId: string): Promise<Character | null> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM characters WHERE id = $1 AND user_id = $2',
          [characterId, userId]
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get character by ID and user ID', {
        characterId,
        userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get all characters for a user
   */
  async getCharactersByUserId(userId: string): Promise<Character[]> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM characters WHERE user_id = $1 ORDER BY created_at DESC',
          [userId]
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get characters by user ID', {
        userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Create a new character
   */
  async createCharacter(data: CreateCharacterData): Promise<Character> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `INSERT INTO characters (user_id, name, class, zone_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [data.user_id, data.name, data.class || 'warrior', data.zone_id || 'starter_zone']
        );
        
        logger.info('Character created successfully', {
          characterId: result.rows[0].id,
          userId: data.user_id,
          name: data.name,
        });
        
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create character', {
        data,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update character position
   */
  async updateCharacterPosition(characterId: number, position: UpdateCharacterPosition): Promise<Character | null> {
    try {
      const client = await this.db.connect();
      try {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (position.zone_id !== undefined) {
          setClauses.push(`zone_id = $${paramIndex++}`);
          values.push(position.zone_id);
        }
        if (position.position_x !== undefined) {
          setClauses.push(`position_x = $${paramIndex++}`);
          values.push(position.position_x);
        }
        if (position.position_y !== undefined) {
          setClauses.push(`position_y = $${paramIndex++}`);
          values.push(position.position_y);
        }
        if (position.position_z !== undefined) {
          setClauses.push(`position_z = $${paramIndex++}`);
          values.push(position.position_z);
        }
        if (position.rotation !== undefined) {
          setClauses.push(`rotation = $${paramIndex++}`);
          values.push(position.rotation);
        }

        if (setClauses.length === 0) {
          throw new Error('No position data provided for update');
        }

        setClauses.push(`last_activity = CURRENT_TIMESTAMP`);
        values.push(characterId);

        const result = await client.query(
          `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character position', {
        characterId,
        position,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update character stats
   */
  async updateCharacterStats(characterId: number, stats: UpdateCharacterStats): Promise<Character | null> {
    try {
      const client = await this.db.connect();
      try {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.entries(stats).forEach(([key, value]) => {
          if (value !== undefined) {
            setClauses.push(`${key} = $${paramIndex++}`);
            values.push(value);
          }
        });

        if (setClauses.length === 0) {
          throw new Error('No stats data provided for update');
        }

        setClauses.push(`last_activity = CURRENT_TIMESTAMP`);
        values.push(characterId);

        const result = await client.query(
          `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character stats', {
        characterId,
        stats,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update character status
   */
  async updateCharacterStatus(characterId: number, status: string): Promise<Character | null> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `UPDATE characters SET status = $1, last_activity = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
          [status, characterId]
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character status', {
        characterId,
        status,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get characters in a specific zone
   */
  async getCharactersInZone(zoneId: string): Promise<Character[]> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `SELECT * FROM characters WHERE zone_id = $1 AND status = 'online' ORDER BY last_activity DESC`,
          [zoneId]
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get characters in zone', {
        zoneId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Check if character name is available
   */
  async isNameAvailable(name: string): Promise<boolean> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT COUNT(*) FROM characters WHERE LOWER(name) = LOWER($1)',
          [name]
        );
        
        return parseInt(result.rows[0].count) === 0;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to check character name availability', {
        name,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}