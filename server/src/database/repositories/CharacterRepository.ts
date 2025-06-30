/**
 * Character Repository - Step 2.1 Implementation
 * Database operations for character and race management in Aeturnis Online MMORPG
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';
  Character, 
  Race, 
  CharacterStats, 
  CreateCharacterInput, 
  UpdateCharacterStatsInput, 
  UpdateCharacterResourcesInput, 
  UpdateCharacterLocationInput,
  CharacterCreationData,
  CHARACTER_CONSTANTS
} from '../../types/character.types';

export interface CreateCharacterData extends CreateCharacterInput {
  // Additional database-specific properties can be added here
}

export interface UpdateCharacterPosition extends UpdateCharacterLocationInput {
  // Legacy compatibility
}

export class CharacterRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Get all available races
   */
  async getAllRaces(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM races ORDER BY name ASC';
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get races', {
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get race by ID
   */
  async getRaceById(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM races WHERE id = $1',
          [raceId];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get race by ID', {
        raceId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Create a new character with race bonuses applied
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      
      try {
        await client.query('BEGIN');

        // Get race data to apply bonuses
        const raceResult = await client.query(
          'SELECT * FROM races WHERE id = $1',
          [data.race_id];
        );
        
        if (raceResult.rows.length === 0) {
          throw new Error(`Race with ID ${data.race_id} not found`);
        }
        
        const race = raceResult.rows[0];
        
        // Calculate starting stats with race bonuses
        const startingStats = {
          strength: CHARACTER_CONSTANTS.DEFAULT_STATS.strength + race.strength_modifier,
          vitality: CHARACTER_CONSTANTS.DEFAULT_STATS.vitality + race.vitality_modifier,
          dexterity: CHARACTER_CONSTANTS.DEFAULT_STATS.dexterity + race.dexterity_modifier,
          intelligence: CHARACTER_CONSTANTS.DEFAULT_STATS.intelligence + race.intelligence_modifier,
          wisdom: CHARACTER_CONSTANTS.DEFAULT_STATS.wisdom + race.wisdom_modifier,;
        };
        
        // Calculate starting resources based on vitality and intelligence
        const startingHealth = race.starting_health + (startingStats.vitality * 5);
        const startingMana = race.starting_mana + (startingStats.intelligence * 3);
        
        const result = await client.query(
          `INSERT INTO characters (
            user_id, race_id, name, gender, 
            strength, vitality, dexterity, intelligence, wisdom,
            health, max_health, mana, max_mana,
            current_zone, spawn_zone, gold, appearance, settings
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING *`,
          [
            userId, data.race_id, data.name, data.gender,
            startingStats.strength, startingStats.vitality, startingStats.dexterity,
            startingStats.intelligence, startingStats.wisdom,
            startingHealth, startingHealth, startingMana, startingMana,
            race.starting_zone, race.starting_zone, race.starting_gold,;
            JSON.stringify(data.appearance || {}), JSON.stringify(data.settings || {});
          ]
        );
        
        await client.query('COMMIT');
        
        logger.info('Character created successfully', {
          characterId: result.rows[0].id,
          userId: userId,
          name: data.name,
          race: race.name,
        });
        
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create character', {
        userId,
        data,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get character by ID
   */
  async findById(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM characters WHERE id = $1 AND deleted_at IS NULL',
          [id];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get character by ID', {
        id,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get all characters for a user
   */
  async findByUserId(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM characters WHERE user_id = $1 AND deleted_at IS NULL ORDER BY last_active DESC',
          [userId];
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get characters by user ID', {
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get character with race stats calculated (using view)
   */
  async getCharacterStats(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM character_stats WHERE id = $1',
          [id];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get character stats', {
        id,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Update character stats
   */
  async updateStats(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.entries(partialStats).forEach(([key, value]) => {
          if (value !== undefined) {
            setClauses.push(`${key} = $${paramIndex++}`);
            values.push(value);
          }
        });

        if (setClauses.length === 0) {
          throw new Error('No stats data provided for update');
        }

        setClauses.push(`last_active = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await client.query(
          `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
          values;
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character stats', {
        id,
        partialStats,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Update character location
   */
  async updateLocation(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `UPDATE characters SET 
           current_zone = $1, position_x = $2, position_y = $3, last_active = CURRENT_TIMESTAMP 
           WHERE id = $4 AND deleted_at IS NULL 
           RETURNING *`,
          [zone, x, y, id];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character location', {
        id,
        zone,
        x,
        y,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Update character resources (health, mana)
   */
  async updateResources(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (health !== undefined) {
          setClauses.push(`health = $${paramIndex++}`);
          values.push(health);
        }
        if (mana !== undefined) {
          setClauses.push(`mana = $${paramIndex++}`);
          values.push(mana);
        }

        if (setClauses.length === 0) {
          throw new Error('No resource data provided for update');
        }

        setClauses.push(`last_active = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await client.query(
          `UPDATE characters SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
          values;
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character resources', {
        id,
        health,
        mana,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Soft delete a character
   */
  async softDelete(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `UPDATE characters SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`,
          [id];
        );
        
        return result.rowCount ?? 0 ?? 0 > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to soft delete character', {
        id,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Check if character name is available
   */
  async isNameAvailable(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT COUNT(*) FROM characters WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL',
          [name];
        );
        
        return parseInt(result.rows[0].count) === 0;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to check character name availability', {
        name,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Get characters in a specific zone
   */
  async getCharactersInZone(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `SELECT * FROM character_stats WHERE current_zone = $1 AND status IN ('normal', 'combat') ORDER BY last_active DESC`,
          [zoneId];
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get characters in zone', {
        zoneId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }

  /**
   * Update character status
   */
  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `UPDATE characters SET status = $1, last_active = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
          [status, id];
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update character status', {
        id,
        status,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      throw error;
    }
  }
}