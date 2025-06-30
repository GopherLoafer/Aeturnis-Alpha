/**
 * Character System Integration - Step 2.2
 * Integrates the character management system with the main application
 */

import { Pool } from 'pg';
import { Application } from 'express';
import { CharacterService } from './services/CharacterService';
import { CharacterController } from './controllers/CharacterController';
import { CacheManager } from './services/CacheManager';
import { createCharacterRoutes } from './routes/character.routes';
import { logger } from './utils/logger';

export interface CharacterSystemConfig {
  app: Application;
  database: Pool;
  cacheManager: CacheManager;
}

export class CharacterSystemIntegration {
  private characterService: CharacterService;
  private characterController: CharacterController;

  constructor(private config: CharacterSystemConfig) {
    // Initialize services
    this.characterService = new CharacterService(
      config.database,
      config.cacheManager
    );

    // Initialize controllers
    this.characterController = new CharacterController(this.characterService);
  }

  /**
   * Initialize and mount character routes
   */
  initialize(): void {
    try {
      // Create and mount character routes
      const characterRoutes = createCharacterRoutes(this.characterController);
      this.config.app.use('/api/characters', characterRoutes);

      logger.info('Character system initialized successfully', {
        routes: [
          'GET /api/characters',
          'POST /api/characters',
          'GET /api/characters/:id',
          'POST /api/characters/:id/select',
          'DELETE /api/characters/:id',
          'GET /api/characters/races',
          'GET /api/characters/name-check/:name'
        ]
      });
    } catch (error) {
      logger.error('Failed to initialize character system', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get character service for use in other parts of the application
   */
  getCharacterService(): CharacterService {
    return this.characterService;
  }

  /**
   * Get character controller for use in other parts of the application
   */
  getCharacterController(): CharacterController {
    return this.characterController;
  }
}

/**
 * Factory function to create and initialize the character system
 */
export function initializeCharacterSystem(config: CharacterSystemConfig): CharacterSystemIntegration {
  const integration = new CharacterSystemIntegration(config);
  integration.initialize();
  return integration;
}