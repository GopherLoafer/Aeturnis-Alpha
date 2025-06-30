/**
 * Combat Repository
 * Database operations for combat session management
 */

import { Pool, PoolClient } from 'pg';
import { logger } from '../../utils/logger';

export interface CombatSession {
  id: string;
  session_name: string;
  zone_id: string;
  status: string;
  turn_order: any[];
  current_turn: number;
  round_number: number;
  max_participants: number;
  participant_count: number;
  turn_duration_seconds: number;
  last_action_at: Date;
  combat_log: any[];
  victory_conditions: any;
  created_at: Date;
  updated_at: Date;
}

export interface CombatParticipant {
  id: number;
  combat_session_id: string;
  character_id: number;
  current_health: number;
  max_health: number;
  current_mana: number;
  max_mana: number;
  status: string;
  initiative: number;
  turn_position: number;
  actions_taken: number;
  last_action: any;
  joined_at: Date;
  updated_at: Date;
}

export interface CombatAction {
  id: number;
  combat_session_id: string;
  character_id: number;
  action_type: string;
  action_data: any;
  target_character_id?: number;
  damage_dealt: number;
  healing_done: number;
  effects_applied: any[];
  round_number: number;
  turn_number: number;
  action_timestamp: Date;
}

export interface CreateCombatSessionData {
  session_name: string;
  zone_id: string;
  max_participants?: number;
  turn_duration_seconds?: number;
  victory_conditions?: any;
}

export interface CombatActionData {
  character_id: number;
  action_type: string;
  action_data: any;
  target_character_id?: number;
}

export class CombatRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Create a new combat session
   */
  async createCombatSession(data: CreateCombatSessionData): Promise<CombatSession> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `INSERT INTO combat_sessions (session_name, zone_id, max_participants, turn_duration_seconds, victory_conditions)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            data.session_name,
            data.zone_id,
            data.max_participants || 10,
            data.turn_duration_seconds || 30,
            JSON.stringify(data.victory_conditions || {})
          ]
        );
        
        logger.info('Combat session created', {
          sessionId: result.rows[0].id,
          sessionName: data.session_name,
          zoneId: data.zone_id,
        });
        
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to create combat session', {
        data,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get combat session by ID
   */
  async getCombatSession(sessionId: string): Promise<CombatSession | null> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM combat_sessions WHERE id = $1',
          [sessionId]
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get combat session', {
        sessionId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Join a combat session
   */
  async joinCombatSession(sessionId: string, characterId: number, characterStats: {
    current_health: number;
    max_health: number;
    current_mana: number;
    max_mana: number;
  }): Promise<CombatParticipant> {
    try {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');

        // Check if session exists and has space
        const sessionResult = await client.query(
          'SELECT * FROM combat_sessions WHERE id = $1 FOR UPDATE',
          [sessionId]
        );

        if (!sessionResult.rows[0]) {
          throw new Error('Combat session not found');
        }

        const session = sessionResult.rows[0];
        if (session.participant_count >= session.max_participants) {
          throw new Error('Combat session is full');
        }

        if (session.status !== 'waiting') {
          throw new Error('Cannot join combat session in progress');
        }

        // Check if character is already in session
        const existingResult = await client.query(
          'SELECT id FROM combat_participants WHERE combat_session_id = $1 AND character_id = $2',
          [sessionId, characterId]
        );

        if (existingResult.rows.length > 0) {
          throw new Error('Character already in combat session');
        }

        // Get next turn position
        const turnPositionResult = await client.query(
          'SELECT COALESCE(MAX(turn_position), 0) + 1 as next_position FROM combat_participants WHERE combat_session_id = $1',
          [sessionId]
        );
        const turnPosition = turnPositionResult.rows[0].next_position;

        // Add participant
        const participantResult = await client.query(
          `INSERT INTO combat_participants 
           (combat_session_id, character_id, current_health, max_health, current_mana, max_mana, turn_position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            sessionId,
            characterId,
            characterStats.current_health,
            characterStats.max_health,
            characterStats.current_mana,
            characterStats.max_mana,
            turnPosition
          ]
        );

        // Update session participant count
        await client.query(
          'UPDATE combat_sessions SET participant_count = participant_count + 1 WHERE id = $1',
          [sessionId]
        );

        await client.query('COMMIT');
        
        logger.info('Character joined combat session', {
          sessionId,
          characterId,
          turnPosition,
        });
        
        return participantResult.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to join combat session', {
        sessionId,
        characterId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get combat participants for a session
   */
  async getCombatParticipants(sessionId: string): Promise<CombatParticipant[]> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          'SELECT * FROM combat_participants WHERE combat_session_id = $1 ORDER BY turn_position',
          [sessionId]
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get combat participants', {
        sessionId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Record a combat action
   */
  async recordCombatAction(sessionId: string, actionData: CombatActionData, results: {
    damage_dealt?: number;
    healing_done?: number;
    effects_applied?: any[];
  }): Promise<CombatAction> {
    try {
      const client = await this.db.connect();
      try {
        // Get current session state
        const sessionResult = await client.query(
          'SELECT round_number, current_turn FROM combat_sessions WHERE id = $1',
          [sessionId]
        );

        if (!sessionResult.rows[0]) {
          throw new Error('Combat session not found');
        }

        const { round_number, current_turn } = sessionResult.rows[0];

        const result = await client.query(
          `INSERT INTO combat_actions 
           (combat_session_id, character_id, action_type, action_data, target_character_id, 
            damage_dealt, healing_done, effects_applied, round_number, turn_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            sessionId,
            actionData.character_id,
            actionData.action_type,
            JSON.stringify(actionData.action_data),
            actionData.target_character_id,
            results.damage_dealt || 0,
            results.healing_done || 0,
            JSON.stringify(results.effects_applied || []),
            round_number,
            current_turn
          ]
        );
        
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to record combat action', {
        sessionId,
        actionData,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update combat session state
   */
  async updateCombatSession(sessionId: string, updates: {
    status?: string;
    current_turn?: number;
    round_number?: number;
    turn_order?: any[];
    combat_log?: any[];
  }): Promise<CombatSession | null> {
    try {
      const client = await this.db.connect();
      try {
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
          if (value !== undefined) {
            setClauses.push(`${key} = $${paramIndex++}`);
            if (key === 'turn_order' || key === 'combat_log') {
              values.push(JSON.stringify(value));
            } else {
              values.push(value);
            }
          }
        });

        if (setClauses.length === 0) {
          throw new Error('No updates provided');
        }

        setClauses.push('last_action_at = CURRENT_TIMESTAMP');
        values.push(sessionId);

        const result = await client.query(
          `UPDATE combat_sessions SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        );
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update combat session', {
        sessionId,
        updates,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get active combat sessions in a zone
   */
  async getActiveCombatSessions(zoneId: string): Promise<CombatSession[]> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `SELECT * FROM combat_sessions 
           WHERE zone_id = $1 AND status IN ('waiting', 'active') 
           ORDER BY created_at DESC`,
          [zoneId]
        );
        
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get active combat sessions', {
        zoneId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * End a combat session
   */
  async endCombatSession(sessionId: string, winner?: string): Promise<CombatSession | null> {
    try {
      const client = await this.db.connect();
      try {
        const result = await client.query(
          `UPDATE combat_sessions 
           SET status = 'completed', 
               victory_conditions = jsonb_set(victory_conditions, '{winner}', $2::jsonb, true),
               last_action_at = CURRENT_TIMESTAMP
           WHERE id = $1 
           RETURNING *`,
          [sessionId, JSON.stringify(winner)]
        );
        
        logger.info('Combat session ended', {
          sessionId,
          winner,
        });
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to end combat session', {
        sessionId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }
}