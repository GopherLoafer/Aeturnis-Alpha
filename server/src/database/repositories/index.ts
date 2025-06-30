/**
 * Repository Service
 * Central access point for all database repositories
 */

import { Pool } from 'pg';
import { getDatabase } from '../../config/database';
import { CharacterRepository } from './CharacterRepository';
import { CombatRepository } from './CombatRepository';
import { ChatRepository } from './ChatRepository';
import { getErrorMessage } from '../utils/errorUtils';

export class RepositoryService {
  private static instance: RepositoryService;
  private db: Pool;
  
  public readonly characters: CharacterRepository;
  public readonly combat: CombatRepository;
  public readonly chat: ChatRepository;

  private constructor() {
    this.db = getDatabase();
    this.characters = new CharacterRepository(this.db);
    this.combat = new CombatRepository(this.db);
    this.chat = new ChatRepository(this.db);
  }

  public static getInstance(): RepositoryService {
    if (!RepositoryService.instance) {
      RepositoryService.instance = new RepositoryService();
    }
    return RepositoryService.instance;
  }

  public getDatabase(): Pool {
    return this.db;
  }
}

// Export singleton instance
export const repositories = RepositoryService.getInstance();

// Export individual repository types for use in handlers
export { CharacterRepository, CombatRepository, ChatRepository };
export type { Character, CreateCharacterData, UpdateCharacterPosition, UpdateCharacterStats } from './CharacterRepository';
export type { CombatSession, CombatParticipant, CombatAction, CreateCombatSessionData, CombatActionData } from './CombatRepository';
export type { ChatChannel, ChatMessage, DirectMessage, CreateMessageData } from './ChatRepository';