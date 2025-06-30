/**
 * Movement Controller - Step 2.4 Implementation
 * REST API endpoints for zone navigation and character movement
 */

import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { MovementService } from '../services/MovementService';
import { ZoneService } from '../services/ZoneService';
import { 
import { getErrorMessage } from '../utils/errorUtils';
  Direction, 
  MovementErrorCode,
  ZoneQueryParams 
} from '../types/zone.types';

interface AuthenticatedRequest extends Request {
  session?: {
    characterId?: string;
    userId?: string;
    [key: string]: any;
  };
}

export class MovementController {
  private movementService: MovementService;
  private zoneService: ZoneService;

  constructor(movementService: MovementService, zoneService: ZoneService) {
    this.movementService = movementService;
    this.zoneService = zoneService;
  }

  /**
   * Validation middleware for movement direction
   */
  static moveValidation = [
    body('direction')
      .notEmpty()
      .withMessage('Direction is required')
      .isString()
      .withMessage('Direction must be a string')
      .isLength({ min: 1, max: 20 })
      .withMessage('Direction must be between 1 and 20 characters')
      .custom((value: string) => {
        const validDirections = [
          'north', 'south', 'east', 'west', 'n', 's', 'e', 'w',
          'northeast', 'northwest', 'southeast', 'southwest', 'ne', 'nw', 'se', 'sw',
          'up', 'down', 'u', 'd', 'enter', 'exit'
        ];
        
        if (!validDirections.includes(value.toLowerCase())) {
          throw new Error('Invalid direction. Valid directions are: north, south, east, west, northeast, northwest, southeast, southwest, up, down, enter, exit (or their abbreviations)');
        }
        return true;
      })
  ];

  /**
   * Validation middleware for zone ID parameter
   */
  static zoneIdValidation = [
    param('zoneId')
      .isUUID()
      .withMessage('Zone ID must be a valid UUID')
  ];

  /**
   * Validation middleware for look direction
   */
  static lookValidation = [
    param('direction')
      .notEmpty()
      .withMessage('Direction is required')
      .isString()
      .withMessage('Direction must be a string')
      .custom((value: string) => {
        const validDirections = [
          'north', 'south', 'east', 'west', 'n', 's', 'e', 'w',
          'northeast', 'northwest', 'southeast', 'southwest', 'ne', 'nw', 'se', 'sw',
          'up', 'down', 'u', 'd', 'enter', 'exit'
        ];
        
        if (!validDirections.includes(value.toLowerCase())) {
          throw new Error('Invalid direction for look command');
        }
        return true;
      })
  ];

  /**
   * POST /api/game/move
   * Move character in a cardinal direction
   */
  async moveCharacter(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
          return;
});
        return;
      }

      // Get character ID from session
      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character. Please select a character first.'
        });
        return;
      }

      const { direction } = req.body;

      // Perform movement
      const result = await this.movementService.moveCharacter(characterId, direction);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.travelMessage,
          data: {
            oldZoneId: result.oldZoneId,
            newZoneId: result.newZoneId,
            direction: result.direction,
            zoneInfo: result.newZoneInfo,
            exitInfo: result.exitInfo
          }
        });

        logger.info('Character movement successful via API', {
          characterId,
          direction,
          oldZoneId: result.oldZoneId,
          newZoneId: result.newZoneId
        });
      } else {
        const statusCode = this.getStatusCodeForError(result.error || '');
        res.status(statusCode).json({
          success: false,
          message: result.travelMessage || result.error,
          data: {
            oldZoneId: result.oldZoneId,
            newZoneId: result.newZoneId,
            direction: result.direction,
            cooldownRemaining: result.cooldownRemaining
          }
        });
      }
    } catch (error) {
      logger.error('Movement API error', {
        characterId: req.session?.characterId,
        direction: req.body?.direction,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while processing movement',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * GET /api/game/zone/:zoneId
   * Get zone information including exits and characters
   */
  async getZoneInfo(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
          return;
});
        return;
      }

      const { zoneId } = req.params;

      // Get zone information
      const zoneInfo = await this.zoneService.getZone(zoneId);

      if (!zoneInfo) {
        res.status(404).json({
          success: false,
          message: 'Zone not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Zone information retrieved successfully',
        data: zoneInfo
      });
    } catch (error) {
      logger.error('Get zone info API error', {
        zoneId: req.params?.zoneId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while retrieving zone information',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * GET /api/game/look/:direction
   * Look in a specific direction to see what's there
   */
  async lookDirection(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
          return;
});
        return;
      }

      // Get character ID from session
      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character. Please select a character first.'
        });
        return;
      }

      // Get character's current location
      const location = await this.movementService.getCharacterLocation(characterId);
      if (!location) {
        res.status(404).json({
          success: false,
          message: 'Character location not found'
        });
        return;
      }

      const { direction } = req.params;

      // Get character level for access checking
      const characterLevel = await this.movementService.getCharacterLevel(characterId);
      if (characterLevel === null) {
        res.status(404).json({
          success: false,
          message: 'Character not found'
        });
        return;
      }

      // Perform look
      const lookResult = await this.zoneService.look(
        location.zoneId, 
        direction as Direction, 
        characterLevel
      );

      res.status(200).json({
        success: true,
        message: 'Look command completed',
        data: lookResult
      });
    } catch (error) {
      logger.error('Look direction API error', {
        characterId: req.session?.characterId,
        direction: req.params?.direction,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while looking in that direction',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * GET /api/game/zones
   * Search zones with filters
   */
  async searchZones(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const queryParams: ZoneQueryParams = {
        zoneType: req.query.zoneType as any,
        pvpEnabled: req.query.pvpEnabled ? req.query.pvpEnabled === 'true' : undefined,
        safeZone: req.query.safeZone ? req.query.safeZone === 'true' : undefined,
        minLevel: req.query.minLevel ? parseInt(req.query.minLevel as string) : undefined,
        maxLevel: req.query.maxLevel ? parseInt(req.query.maxLevel as string) : undefined,
        climate: req.query.climate as string,
        terrain: req.query.terrain as string,
        layer: req.query.layer ? parseInt(req.query.layer as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
        return;
};

      // Remove undefined values
      Object.keys(queryParams).forEach(key => {
        if (queryParams[key as keyof ZoneQueryParams] === undefined) {
          delete queryParams[key as keyof ZoneQueryParams];
        }
      });

      const zones = await this.zoneService.searchZones(queryParams);

      res.status(200).json({
        success: true,
        message: 'Zone search completed',
        data: {
          zones,
          total: zones.length,
          offset: queryParams.offset || 0,
          limit: queryParams.limit || 20
        }
      });
    } catch (error) {
      logger.error('Search zones API error', {
        query: req.query,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while searching zones',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * GET /api/game/movement/history
   * Get character's movement history
   */
  async getMovementHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Get character ID from session
      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character. Please select a character first.'
          return;
});
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const history = await this.movementService.getMovementHistory(characterId, limit, offset);

      res.status(200).json({
        success: true,
        message: 'Movement history retrieved successfully',
        data: {
          history,
          total: history.length,
          offset,
          limit
        }
      });
    } catch (error) {
      logger.error('Get movement history API error', {
        characterId: req.session?.characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while retrieving movement history',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * GET /api/game/location
   * Get character's current location
   */
  async getCurrentLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Get character ID from session
      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character. Please select a character first.'
          return;
});
        return;
      }

      const location = await this.movementService.getCharacterLocation(characterId);
      if (!location) {
        res.status(404).json({
          success: false,
          message: 'Character location not found'
        });
        return;
      }

      // Get zone information
      const zoneInfo = await this.zoneService.getZone(location.zoneId);

      res.status(200).json({
        success: true,
        message: 'Current location retrieved successfully',
        data: {
          location,
          zoneInfo
        }
      });
    } catch (error) {
      logger.error('Get current location API error', {
        characterId: req.session?.characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while retrieving current location',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * POST /api/game/teleport (Admin/System endpoint)
   * Teleport character to a specific zone
   */
  async teleportCharacter(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
          return;
});
        return;
      }

      // Get character ID from session or request body
      const characterId = req.body.characterId || req.session?.characterId;
      const { targetZoneId } = req.body;

      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No character specified'
        });
        return;
      }

      // Perform teleport
      const result = await this.movementService.teleportCharacter(characterId, targetZoneId);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.travelMessage,
          data: {
            oldZoneId: result.oldZoneId,
            newZoneId: result.newZoneId,
            zoneInfo: result.newZoneInfo
          }
        });

        logger.info('Character teleport successful via API', {
          characterId,
          oldZoneId: result.oldZoneId,
          newZoneId: result.newZoneId
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.travelMessage || result.error,
          data: {
            oldZoneId: result.oldZoneId,
            newZoneId: result.newZoneId
          }
        });
      }
    } catch (error) {
      logger.error('Teleport API error', {
        characterId: req.body?.characterId || req.session?.characterId,
        targetZoneId: req.body?.targetZoneId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'An error occurred while processing teleport',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * Get appropriate HTTP status code for movement error
   */
  private getStatusCodeForError(error: string): number {
    if (error.includes('cooldown') || error.includes('wait')) return 429; // Too Many Requests
    if (error.includes('level') || error.includes('required')) return 403; // Forbidden
    if (error.includes('not found')) return 404; // Not Found
    if (error.includes('locked') || error.includes('access')) return 403; // Forbidden
    return 400; // Bad Request
  }
}