/**
 * Character Service - Step 2.2 Implementation
 * Business logic for character creation, listing, selection, and deletion
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { CharacterRepository } from '../database/repositories/CharacterRepository';
import { CacheManager } from './CacheManager';
import { getErrorMessage } from '../utils/errorUtils';
  Character, 
  CharacterStats, 
  CreateCharacterInput,
  CHARACTER_CONSTANTS,
  Gender,
  Race
} from '../types/character.types';

export interface CreateCharacterDto {
  name: string;
  raceId: string;
  gender: Gender;
  appearance?: Record<string, any>;
}

export interface CharacterFullData extends CharacterStats {
  // Additional computed fields for character display
  progressToNextLevel: number;
  healthPercentage: number;
  manaPercentage: number;
}

export class CharacterService {
  private characterRepo: CharacterRepository;
  private cacheManager: CacheManager;
  private db: Pool;

  constructor(db: Pool, cacheManager: CacheManager) {
    this.db = db;
    this.characterRepo = new CharacterRepository(db);
    this.cacheManager = cacheManager;
  }

  /**
   * Create a new character for a user
   */
  async createCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Validate user character limit
      const existingCharacters = await this.characterRepo.findByUserId(userId);
      if (existingCharacters.length >= CHARACTER_CONSTANTS.MAX_SESSIONS_PER_USER) {
        throw new Error(`Maximum character limit reached (${CHARACTER_CONSTANTS.MAX_SESSIONS_PER_USER})`);
      }

      // Validate race exists
      const race = await this.characterRepo.getRaceById(dto.raceId);
      if (!race) {
        throw new Error(`Race with ID ${dto.raceId} not found`);
      }

      // Check name availability
      const nameAvailable = await this.characterRepo.isNameAvailable(dto.name);
      if (!nameAvailable) {
        throw new Error(`Character name "${dto.name}" is already taken`);
      }

      // Validate name format (3-20 chars, alphanumeric with some special chars)
      if (!this.isValidCharacterName(dto.name)) {
        throw new Error('Character name must be 3-20 characters and contain only letters, numbers, and hyphens');
      }

      // Create character data
      const characterData: CreateCharacterInput = {
        user_id: userId,
        race_id: dto.raceId,
        name: dto.name,
        gender: dto.gender,
        appearance: dto.appearance || {},
        settings: {
          display_helmet: true,
          auto_loot: false,
          combat_notifications: true
        }
      };

      // Create character with race bonuses applied
      const character = await this.characterRepo.create(userId, characterData);

      // Log character creation
      await this.logAuditAction(userId, 'character_created', character.id, {
        characterName: character.name,
        race: race.name
      });

      // Cache character data
      await this.cacheCharacter(character.id, character);

      logger.info('Character created successfully', {
        userId,
        characterId: character.id,
        characterName: character.name,
        race: race.name
      });

      return character;
    } catch (error) {
      logger.error('Failed to create character', {
        userId,
        dto,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Get all characters for a user
   */
  async getUserCharacters(req: Request, res: Response): Promise<void> {
    try {
      const characters = await this.characterRepo.findByUserId(userId);
      
      logger.debug('Retrieved user characters', {
        userId,
        characterCount: characters.length
      });

      return characters;
    } catch (error) {
      logger.error('Failed to get user characters', {
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Get a single character with full data including race bonuses
   */
  async getCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Check cache first
      const cacheKey = `char:${characterId}:data`;
      const cachedCharacter = await this.cacheManager.get<CharacterFullData>(cacheKey);
      if (cachedCharacter) {
        // Verify ownership
        if (cachedCharacter.user_id !== userId) {
          throw new Error('Character not found or access denied');
        }
        return cachedCharacter;
      }

      // Get character with calculated stats
      const characterStats = await this.characterRepo.getCharacterStats(characterId);
      if (!characterStats) {
        throw new Error('Character not found');
      }

      // Verify ownership
      if (characterStats.user_id !== userId) {
        throw new Error('Character not found or access denied');
      }

      // Calculate additional display data
      const fullData: CharacterFullData = {
        ...characterStats,
        progressToNextLevel: this.calculateProgressToNextLevel(
          characterStats.experience, 
          characterStats.next_level_exp
        ),
        healthPercentage: (characterStats.health / characterStats.max_health) * 100,
        manaPercentage: (characterStats.mana / characterStats.max_mana) * 100
      };

      // Cache the result
      await this.cacheManager.set(cacheKey, fullData, { ttl: 300 }); // 5 minute cache

      return fullData;
    } catch (error) {
      logger.error('Failed to get character', {
        characterId,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Select a character for the current session
   */
  async selectCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Get the character and verify ownership
      const character = await this.getCharacter(characterId, userId);
      
      // Update character's last_active timestamp
      await this.characterRepo.updateLocation(
        characterId, 
        character.current_zone, 
        character.position_x, 
        character.position_y
      );

      // Log character selection
      await this.logAuditAction(userId, 'character_selected', characterId, {
        characterName: character.name,
        zone: character.current_zone
      });

      logger.info('Character selected', {
        userId,
        characterId,
        characterName: character.name,
        zone: character.current_zone
      });

      return character;
    } catch (error) {
      logger.error('Failed to select character', {
        characterId,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Soft delete a character
   */
  async deleteCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Verify character exists and ownership
      const character = await this.characterRepo.findById(characterId);
      if (!character) {
        throw new Error('Character not found');`
}

      if (character.user_id !== userId) {
        throw new Error('Character not found or access denied');
      }

      // Perform soft deletion
      const deleted = await this.characterRepo.softDelete(characterId);
      if (!deleted) {
        throw new Error('Failed to delete character');
      }

      // Remove from cache
      const cacheKey = `char:${characterId}:data`;
      await this.cacheManager.delete(cacheKey);

      // Log character deletion
      await this.logAuditAction(userId, 'character_deleted', characterId, {
        characterName: character.name
      });

      logger.info('Character deleted successfully', {
        userId,
        characterId,
        characterName: character.name
      });
    } catch (error) {
      logger.error('Failed to delete character', {
        characterId,
        userId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Get all available races for character creation
   */
  async getRaces(req: Request, res: Response): Promise<void> {
    try {
      const cacheKey = 'races:all';
      const cachedRaces = await this.cacheManager.get<Race[]>(cacheKey);
      if (cachedRaces) {
        return cachedRaces;
      }

      const races = await this.characterRepo.getAllRaces();
      
      // Cache races for 1 hour (they rarely change)
      await this.cacheManager.set(cacheKey, races, { ttl: 3600 });

      return races;
    } catch (error) {
      logger.error('Failed to get races', {
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Check if character name is available
   */
  async checkNameAvailability(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isValidCharacterName(name)) {
        return false;
      }

      return await this.characterRepo.isNameAvailable(name);
    } catch (error) {
      logger.error('Failed to check name availability', {
        name,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      return false;
    }
  }

  /**
   * Private helper methods
   */

  private isValidCharacterName(name: string): boolean {
    // 3-20 characters, letters, numbers, hyphens only
    const nameRegex = /^[a-zA-Z0-9-]{3,20}$/;
    return nameRegex.test(name) && !name.startsWith('-') && !name.endsWith('-');
  }

  private calculateProgressToNextLevel(currentExp: string, nextLevelExp: string): number {
    const current = BigInt(currentExp);
    const next = BigInt(nextLevelExp);
    
    if (next === 0n) return 100; // Max level
    
    const progress = Number((current * 100n) / next);
    return Math.min(progress, 100);
  }

  private async cacheCharacter(req: Request, res: Response): Promise<void> {
    try {
      const cacheKey = `char:${characterId}:data`;
      await this.cacheManager.set(cacheKey, character, { ttl: 300 }); // 5 minute cache
    } catch (error) {
      // Don't fail the main operation if caching fails
      logger.warn('Failed to cache character', {
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
    }
  }

  private async logAuditAction(req: Request, res: Response): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        await client.query(
          `INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata);
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, action, 'character', characterId, JSON.stringify(metadata)]
        );`
} finally {
        client.release();
      }
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      logger.warn('Failed to log audit action', {
        userId,
        action,
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
    }
  }
}