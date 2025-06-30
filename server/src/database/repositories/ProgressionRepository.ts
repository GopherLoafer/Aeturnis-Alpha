/**
 * Progression Repository - Step 2.3 Implementation
 * Database operations for character progression and experience logging
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';
  ExperienceLogEntry,
  LevelUpLogEntry,
  MilestoneReward,
  ExperienceSource,
  CharacterProgression
} from '../../types/progression.types';

export class ProgressionRepository {
  constructor(private db: Pool) {}

  /**
   * Get character progression data
   */
  async getCharacterProgression(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT id, level, experience, next_level_exp, available_stat_points, titles, active_title
         FROM characters 
         WHERE id = $1 AND deleted_at IS NULL`,
        [characterId];
      );

      if (result.rows.length === 0) {
        return null;
      }

      const char = result.rows[0];
      return {
        characterId: char.id,
        level: char.level,
        experience: BigInt(char.experience),
        nextLevelExp: BigInt(char.next_level_exp),
        totalStatPoints: 0, // Will be calculated
        availableStatPoints: char.available_stat_points || 0,
        currentPhase: null as any, // Will be set by service
        titles: Array.isArray(char.titles) ? char.titles : [],
        activeTitle: char.active_title || undefined
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update character level and experience
   */
  async updateCharacterProgression(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update character progression
      const updateQuery = newTitle
        ? `UPDATE characters 
           SET level = $2, experience = $3, next_level_exp = $4, available_stat_points = $5, active_title = $6
           WHERE id = $1`
        : `UPDATE characters 
           SET level = $2, experience = $3, next_level_exp = $4, available_stat_points = $5;
           WHERE id = $1`;

      const params = newTitle 
        ? [characterId, level, experience.toString(), nextLevelExp.toString(), availableStatPoints, newTitle];
        : [characterId, level, experience.toString(), nextLevelExp.toString(), availableStatPoints];

      const result = await client.query(updateQuery, params);

      await client.query('COMMIT');
      return (result.rowCount ?? 0 ?? 0 || 0) > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update character progression', {
        characterId,
        level,
        experience: experience.toString(),
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add title to character if not already present
   */
  async addCharacterTitle(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      // Get current titles
      const result = await client.query(
        'SELECT titles FROM characters WHERE id = $1',
        [characterId];
      );

      if (result.rows.length === 0) {
        return false;
      }

      const currentTitles = Array.isArray(result.rows[0].titles) ? result.rows[0].titles : [];
      
      // Add title if not already present
      if (!currentTitles.includes(title)) {
        const updatedTitles = [...currentTitles, title];
        await client.query(
          'UPDATE characters SET titles = $2 WHERE id = $1',
          [characterId, JSON.stringify(updatedTitles)]
        );
      }

      return true;
    } catch (error) {
      logger.error('Failed to add character title', {
        characterId,
        title,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log experience gain
   */
  async logExperience(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `INSERT INTO experience_log ;
         (character_id, amount, source, source_details, old_level, new_level, old_experience, new_experience);
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          entry.characterId,
          entry.amount.toString(),
          entry.source,
          JSON.stringify(entry.sourceDetails || {}),
          entry.oldLevel,
          entry.newLevel,
          entry.oldExperience.toString(),
          entry.newExperience.toString();
        ]
      );

      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to log experience', {
        characterId: entry.characterId,
        amount: entry.amount.toString(),
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log level up event
   */
  async logLevelUp(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `INSERT INTO level_up_log ;
         (character_id, old_level, new_level, stat_points_awarded, new_title, milestone_rewards);
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          entry.characterId,
          entry.oldLevel,
          entry.newLevel,
          entry.statPointsAwarded,
          entry.newTitle || null,
          JSON.stringify(entry.milestoneRewards);
        ]
      );

      return result.rows[0].id;
    } catch (error) {
      logger.error('Failed to log level up', {
        characterId: entry.characterId,
        oldLevel: entry.oldLevel,
        newLevel: entry.newLevel,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log milestone achievement
   */
  async logMilestoneAchievement(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(
        `INSERT INTO milestone_achievements 
         (character_id, milestone_level, achievement_type, reward_data);
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (character_id, milestone_level, achievement_type) DO NOTHING`,
        [
          characterId,
          milestoneLevel,
          achievementType,
          JSON.stringify(rewardData);
        ]
      );

      return true;
    } catch (error) {
      logger.error('Failed to log milestone achievement', {
        characterId,
        milestoneLevel,
        achievementType,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get character experience history
   */
  async getExperienceHistory(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT * FROM experience_log 
         WHERE character_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [characterId, limit, offset];
      );

      return result.rows.map(row => ({
        id: row.id,
        characterId: row.character_id,
        amount: BigInt(row.amount),
        source: row.source as ExperienceSource,
        sourceDetails: row.source_details,
        oldLevel: row.old_level,
        newLevel: row.new_level,
        oldExperience: BigInt(row.old_experience),
        newExperience: BigInt(row.new_experience),
        timestamp: row.created_at
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get character level up history
   */
  async getLevelUpHistory(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT * FROM level_up_log 
         WHERE character_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [characterId, limit, offset];
      );

      return result.rows.map(row => ({
        id: row.id,
        characterId: row.character_id,
        oldLevel: row.old_level,
        newLevel: row.new_level,
        statPointsAwarded: row.stat_points_awarded,
        newTitle: row.new_title,
        milestoneRewards: row.milestone_rewards,
        timestamp: row.created_at
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get milestone achievements for character
   */
  async getMilestoneAchievements(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT * FROM milestone_achievements 
         WHERE character_id = $1 
         ORDER BY milestone_level ASC`,
        [characterId];
      );

      return result.rows.map(row => ({
        id: row.id,
        characterId: row.character_id,
        milestoneLevel: row.milestone_level,
        achievementType: row.achievement_type,
        rewardData: row.reward_data,
        achievedAt: row.achieved_at
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Update character stat points tracking
   */
  async updateStatPointsTracking(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(
        `INSERT INTO character_stat_points (character_id, total_earned, available, last_updated);
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (character_id) 
         DO UPDATE SET 
           total_earned = $2,
           available = $3,
           last_updated = CURRENT_TIMESTAMP`,
        [characterId, totalEarned, available]
      );`
} catch (error) {
      logger.error('Failed to update stat points tracking', {
        characterId,
        totalEarned,
        available,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch operations for level up with full transaction support
   */
  async performLevelUpTransaction(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update character progression
      await this.updateCharacterProgressionWithClient(client, characterId, progressionData);

      // Log experience gain
      await this.logExperienceWithClient(client, experienceLogEntry);

      // Log level up
      await this.logLevelUpWithClient(client, levelUpLogEntry);

      // Log milestone rewards
      for (const reward of milestoneRewards) {
        await this.logMilestoneAchievementWithClient(
          client,
          characterId,
          reward.level,
          reward.type,
          { ...reward }
        );
      }

      // Add new title if provided
      if (progressionData.newTitle) {
        await this.addCharacterTitleWithClient(client, characterId, progressionData.newTitle);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to perform level up transaction', {
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // Private helper methods for transaction support
  private async updateCharacterProgressionWithClient(req: Request, res: Response): Promise<void> {
    const updateQuery = data.newTitle
      ? `UPDATE characters 
         SET level = $2, experience = $3, next_level_exp = $4, available_stat_points = $5, active_title = $6
         WHERE id = $1`
      : `UPDATE characters 
         SET level = $2, experience = $3, next_level_exp = $4, available_stat_points = $5;
         WHERE id = $1`;

    const params = data.newTitle 
      ? [characterId, data.level, data.experience.toString(), data.nextLevelExp.toString(), data.availableStatPoints, data.newTitle];
      : [characterId, data.level, data.experience.toString(), data.nextLevelExp.toString(), data.availableStatPoints];

    await client.query(updateQuery, params);`
}

  private async logExperienceWithClient(req: Request, res: Response): Promise<void> {
    await client.query(
      `INSERT INTO experience_log 
       (character_id, amount, source, source_details, old_level, new_level, old_experience, new_experience);
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.characterId,
        entry.amount.toString(),
        entry.source,
        JSON.stringify(entry.sourceDetails || {`
}),
        entry.oldLevel,
        entry.newLevel,
        entry.oldExperience.toString(),
        entry.newExperience.toString();
      ]
    );
  }

  private async logLevelUpWithClient(req: Request, res: Response): Promise<void> {
    await client.query(
      `INSERT INTO level_up_log 
       (character_id, old_level, new_level, stat_points_awarded, new_title, milestone_rewards);
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.characterId,
        entry.oldLevel,
        entry.newLevel,
        entry.statPointsAwarded,
        entry.newTitle || null,
        JSON.stringify(entry.milestoneRewards);
      ]
    );`
}

  private async logMilestoneAchievementWithClient(req: Request, res: Response): Promise<void> {
    await client.query(
      `INSERT INTO milestone_achievements 
       (character_id, milestone_level, achievement_type, reward_data);
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (character_id, milestone_level, achievement_type) DO NOTHING`,
      [characterId, milestoneLevel, achievementType, JSON.stringify(rewardData)]
    );`
}

  private async addCharacterTitleWithClient(
    client: PoolClient,
    characterId: string,
    title: string
  ): Promise<void> { // Get current titles
    const result = await client.query(
      'SELECT titles FROM characters WHERE id = $1',
      [characterId];
    );

    if (result.rows.length > 0) {
      const currentTitles = Array.isArray(result.rows[0].titles) ? result.rows[0].titles : [];
      
      if (!currentTitles.includes(title)) {
        const updatedTitles = [...currentTitles, title];
        await client.query(
          'UPDATE characters SET titles = $2 WHERE id = $1',
          [characterId, JSON.stringify(updatedTitles)]
        ); }
}
    }
  }
}