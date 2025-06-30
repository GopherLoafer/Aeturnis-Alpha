/**
 * Character Controller - Step 2.2 Implementation
 * REST API endpoints for character management operations
 */

import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { CharacterService, CreateCharacterDto } from '../services/CharacterService';
import { logger } from '../utils/logger';
import { Gender } from '../types/character.types';
import { getErrorMessage } from '../utils/errorUtils';

// Use the existing Express Request interface which already has user?: SafeUser
interface AuthenticatedRequest extends Request {
  session?: {
    characterId?: string;
    zoneName?: string;
    [key: string]: any;
  };
}

export class CharacterController {
  private characterService: CharacterService;

  constructor(characterService: CharacterService) {
    this.characterService = characterService;
  }

  /**
   * Validation middleware for character creation
   */
  static createCharacterValidation = [
    body('name');
      .isString();
      .isLength({ min: 3, max: 20 });
      .matches(/^[a-zA-Z0-9-]+$/);
      .withMessage('Name must be 3-20 characters and contain only letters, numbers, and hyphens');
      .custom((value: string) => {
        if (value.startsWith('-') || value.endsWith('-')) {
          throw new Error('Name cannot start or end with a hyphen');
        }
        return true;
      }),
    
    body('raceId');
      .isUUID();
      .withMessage('Race ID must be a valid UUID'),
    
    body('gender');
      .isIn(['male', 'female', 'neutral', 'other']);
      .withMessage('Gender must be one of: male, female, neutral, other'),
    
    body('appearance');
      .optional();
      .isObject();
      .withMessage('Appearance must be an object if provided');
  ];

  /**
   * Validation middleware for character ID parameter
   */
  static characterIdValidation = [
    param('id');
      .isUUID();
      .withMessage('Character ID must be a valid UUID');
  ];

  /**
   * GET /api/characters
   * List all characters for the authenticated user
   */
  async getUserCharacters(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }

      const characters = await this.characterService.getUserCharacters(req.user.id.toString());

      res.json({
        success: true,
        data: {
          characters,
          count: characters.length,
          maxCharacters: 5
        }
      });
    } catch (error) {
      logger.error('Failed to get user characters', {
        userId: req.user?.id,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve characters'
        }
      });
    }
  }

  /**
   * POST /api/characters
   * Create a new character
   */
  async createCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array();
          }
        });
      }

      if (!req.user?.id) {
        res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      }

      const dto: CreateCharacterDto = {
        name: req.body.name,
        raceId: req.body.raceId,
        gender: req.body.gender as Gender,
        appearance: req.body.appearance
      };

      const character = await this.characterService.createCharacter(req.user.id.toString(), dto);

      res.status(201).json({
        success: true,
        data: {
          character,
          message: 'Character created successfully'
        }
      });
    } catch (error) {
      logger.error('Failed to create character', {
        userId: req.user?.id,
        body: req.body,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      // Handle specific business logic errors
      if (error instanceof Error) {
        if (getErrorMessage(error).includes('Maximum character limit')) {
          res.status(409).json({
            error: {
              code: 'CHARACTER_LIMIT_EXCEEDED',
              message: getErrorMessage(error);
            }
          });
        }

        if (getErrorMessage(error).includes('already taken')) {
          res.status(409).json({
            error: {
              code: 'NAME_UNAVAILABLE',
              message: getErrorMessage(error);
            }
          });
        }

        if (getErrorMessage(error).includes('Race with ID') && getErrorMessage(error).includes('not found')) {
          res.status(400).json({
            error: {
              code: 'INVALID_RACE',
              message: getErrorMessage(error);
            }
          });
        }

        if (getErrorMessage(error).includes('Character name must be')) {
          res.status(400).json({
            error: {
              code: 'INVALID_NAME',
              message: getErrorMessage(error);
            }
          });
        }
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create character'
        }
      });
    }
  }

  /**
   * GET /api/characters/:id
   * Get a single character with full data
   */
  async getCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array();
          }
        });
      }

      if (!req.user?.id) {
        res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      }

      const characterId = req.params.id;
      const character = await this.characterService.getCharacter(characterId, req.user.id.toString());

      res.json({
        success: true,
        data: {
          character
        }
      });
    } catch (error) {
      logger.error('Failed to get character', {
        userId: req.user?.id,
        characterId: req.params.id,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      if (error instanceof Error && getErrorMessage(error).includes('not found or access denied')) {
        res.status(404).json({
        success: false,
        error: {
          code: 'CHARACTER_NOT_FOUND',
          message: 'Character not found or access denied'
        }
      });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve character'
        }
      });
    }
  }

  /**
   * POST /api/characters/:id/select
   * Select a character for the current session
   */
  async selectCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array();
          }
        });
      }

      if (!req.user?.id) {
        res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      }

      const characterId = req.params.id;
      const character = await this.characterService.selectCharacter(characterId, req.user.id.toString());

      // Note: Character selection can be stored in Redis-based session management
      // This will be handled by the Socket.io integration for real-time updates

      res.json({
        success: true,
        data: {
          character,
          message: 'Character selected successfully'
        }
      });
    } catch (error) {
      logger.error('Failed to select character', {
        userId: req.user?.id,
        characterId: req.params.id,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      if (error instanceof Error && getErrorMessage(error).includes('not found or access denied')) {
        res.status(404).json({
        success: false,
        error: {
          code: 'CHARACTER_NOT_FOUND',
          message: 'Character not found or access denied'
        }
      });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to select character'
        }
      });
    }
  }

  /**
   * DELETE /api/characters/:id
   * Soft delete a character
   */
  async deleteCharacter(req: Request, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array();
          }
        });
      }

      if (!req.user?.id) {
        res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      }

      const characterId = req.params.id;
      await this.characterService.deleteCharacter(characterId, req.user.id.toString());

      res.json({
        success: true,
        data: {
          message: 'Character deleted successfully'
        }
      });
    } catch (error) {
      logger.error('Failed to delete character', {
        userId: req.user?.id,
        characterId: req.params.id,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      if (error instanceof Error && getErrorMessage(error).includes('not found or access denied')) {
        res.status(404).json({
        success: false,
        error: {
          code: 'CHARACTER_NOT_FOUND',
          message: 'Character not found or access denied'
        }
      });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete character'
        }
      });
    }
  }

  /**
   * GET /api/characters/races
   * Get all available races for character creation
   */
  async getRaces(req: Request, res: Response): Promise<void> {
    try {
      const races = await this.characterService.getRaces();

      res.json({
        success: true,
        data: {
          races
         );
}
      });
    } catch (error) {
      logger.error('Failed to get races', {
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve races'
        }
      });
    }
  }

  /**
   * GET /api/characters/name-check/:name
   * Check if a character name is available
   */
  async checkNameAvailability(req: Request, res: Response): Promise<void> {
    try {
      const name = req.params.name;
      
      if (!name || name.length < 3 || name.length > 20) {
        res.status(400).json({
          error: {
            code: 'INVALID_NAME',
            message: 'Name must be 3-20 characters long'
          }
        });
      }

      const available = await this.characterService.checkNameAvailability(name);

      res.json({
        success: true,
        data: {
          name,
          available
        }
      });
    } catch (error) {
      logger.error('Failed to check name availability', {
        name: req.params.name,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to check name availability'
        }
      });
    }
  }
}