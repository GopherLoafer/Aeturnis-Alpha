/**
 * Progression Controller - Step 2.3 Implementation
 * REST API endpoints for character progression and experience management
 */

import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ProgressionService } from '../services/ProgressionService';
import { logger } from '../utils/logger';
import { ExperienceSource } from '../types/progression.types';

export class ProgressionController {
  private progressionService: ProgressionService;

  constructor(progressionService: ProgressionService) {
    this.progressionService = progressionService;
  }

  /**
   * Validation middleware for experience award
   */
  static awardExperienceValidation = [
    body('amount')
      .isString()
      .matches(/^\d+$/)
      .withMessage('Amount must be a valid positive integer string')
      .custom((value: string) => {
        try {
          const amount = BigInt(value);
          if (amount <= 0n) {
            throw new Error('Amount must be greater than 0');
          }
          if (amount > BigInt('999999999999999999999999999999999999999')) {
            throw new Error('Amount exceeds maximum allowed value');
          }
          return true;
        } catch (error) {
          throw new Error('Invalid amount format');
        }
      }),
    
    body('source')
      .isIn(['combat_kill', 'quest_completion', 'exploration', 'crafting', 'training', 'event', 'admin_grant', 'milestone_bonus'])
      .withMessage('Source must be a valid experience source'),
    
    body('sourceDetails')
      .optional()
      .isObject()
      .withMessage('Source details must be an object if provided')
  ];

  /**
   * Validation middleware for character ID parameter
   */
  static characterIdValidation = [
    param('characterId')
      .isUUID()
      .withMessage('Character ID must be a valid UUID')
  ];

  /**
   * Validation middleware for experience curve calculation
   */
  static experienceCurveValidation = [
    query('startLevel')
      .isInt({ min: 1, max: 10000 })
      .withMessage('Start level must be between 1 and 10000'),
    
    query('endLevel')
      .isInt({ min: 1, max: 10000 })
      .withMessage('End level must be between 1 and 10000')
      .custom((endLevel: number, { req }) => {
        const startLevel = parseInt(req.query?.startLevel as string || '1');
        if (endLevel <= startLevel) {
          throw new Error('End level must be greater than start level');
        }
        if (endLevel - startLevel > 100) {
          throw new Error('Level range cannot exceed 100 levels');
        }
        return true;
      })
  ];

  /**
   * POST /api/progression/characters/:characterId/experience
   * Award experience to a character
   */
  async awardExperience(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: errors.array()
          }
        });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const characterId = req.params.characterId;
      const { amount, source, sourceDetails } = req.body;

      const experienceAmount = BigInt(amount);
      const result = await this.progressionService.awardExperience(
        characterId,
        experienceAmount,
        source as ExperienceSource,
        sourceDetails
      );

      res.json({
        success: true,
        data: {
          experienceAwarded: result.experienceGained.toString(),
          oldLevel: result.oldLevel,
          newLevel: result.newLevel,
          levelsGained: result.levelsGained,
          statPointsAwarded: result.statPointsAwarded,
          newTitle: result.newTitle,
          milestoneRewards: result.milestoneRewards,
          totalExperience: result.newExperience.toString()
        }
      });
    } catch (error) {
      logger.error('Failed to award experience', {
        characterId: req.params.characterId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : error
      });

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: {
            code: 'CHARACTER_NOT_FOUND',
            message: 'Character not found'
          }
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to award experience'
        }
      });
    }
  }

  /**
   * GET /api/progression/characters/:characterId
   * Get character progression data
   */
  async getCharacterProgression(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array()
          }
        });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const characterId = req.params.characterId;
      const progression = await this.progressionService.getCharacterProgression(characterId);

      if (!progression) {
        res.status(404).json({
          error: {
            code: 'CHARACTER_NOT_FOUND',
            message: 'Character not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          characterId: progression.characterId,
          level: progression.level,
          experience: progression.experience.toString(),
          nextLevelExp: progression.nextLevelExp.toString(),
          totalStatPoints: progression.totalStatPoints,
          availableStatPoints: progression.availableStatPoints,
          currentPhase: progression.currentPhase,
          titles: progression.titles,
          activeTitle: progression.activeTitle
        }
      });
    } catch (error) {
      logger.error('Failed to get character progression', {
        characterId: req.params.characterId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve character progression'
        }
      });
    }
  }

  /**
   * GET /api/progression/characters/:characterId/stats
   * Get progression statistics for a character
   */
  async getProgressionStats(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array()
          }
        });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const characterId = req.params.characterId;
      const stats = await this.progressionService.getProgressionStats(characterId);

      if (!stats) {
        res.status(404).json({
          error: {
            code: 'CHARACTER_NOT_FOUND',
            message: 'Character not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...stats,
          experienceToNextLevel: stats.experienceToNextLevel.toString()
        }
      });
    } catch (error) {
      logger.error('Failed to get progression stats', {
        characterId: req.params.characterId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve progression statistics'
        }
      });
    }
  }

  /**
   * GET /api/progression/characters/:characterId/experience-history
   * Get experience gain history for a character
   */
  async getExperienceHistory(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array()
          }
        });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const characterId = req.params.characterId;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const history = await this.progressionService.getExperienceHistory(characterId, limit, offset);

      res.json({
        success: true,
        data: {
          history: history.map(entry => ({
            ...entry,
            amount: entry.amount.toString(),
            oldExperience: entry.oldExperience.toString(),
            newExperience: entry.newExperience.toString()
          })),
          pagination: {
            limit,
            offset,
            hasMore: history.length === limit
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get experience history', {
        characterId: req.params.characterId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve experience history'
        }
      });
    }
  }

  /**
   * GET /api/progression/characters/:characterId/level-history
   * Get level up history for a character
   */
  async getLevelUpHistory(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid character ID',
            details: errors.array()
          }
        });
        return;
      }

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      const characterId = req.params.characterId;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const history = await this.progressionService.getLevelUpHistory(characterId, limit, offset);

      res.json({
        success: true,
        data: {
          history,
          pagination: {
            limit,
            offset,
            hasMore: history.length === limit
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get level up history', {
        characterId: req.params.characterId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve level up history'
        }
      });
    }
  }

  /**
   * GET /api/progression/experience-curve
   * Calculate experience curve for level range
   */
  async getExperienceCurve(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid parameters',
            details: errors.array()
          }
        });
        return;
      }

      const startLevel = parseInt(req.query.startLevel as string);
      const endLevel = parseInt(req.query.endLevel as string);

      const curve = this.progressionService.calculateExperienceCurve(startLevel, endLevel);

      res.json({
        success: true,
        data: {
          startLevel,
          endLevel,
          curve
        }
      });
    } catch (error) {
      logger.error('Failed to calculate experience curve', {
        startLevel: req.query.startLevel,
        endLevel: req.query.endLevel,
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to calculate experience curve'
        }
      });
    }
  }

  /**
   * GET /api/progression/phases
   * Get all progression phases information
   */
  async getProgressionPhases(req: Request, res: Response): Promise<void> {
    try {
      const { PROGRESSION_PHASES } = await import('../types/progression.types');
      
      res.json({
        success: true,
        data: {
          phases: PROGRESSION_PHASES.map(phase => ({
            name: phase.name,
            minLevel: phase.minLevel,
            maxLevel: phase.maxLevel,
            bonusMultiplier: phase.bonusMultiplier,
            title: phase.title,
            statPointsPerLevel: phase.statPointsPerLevel
          }))
        }
      });
    } catch (error) {
      logger.error('Failed to get progression phases', {
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve progression phases'
        }
      });
    }
  }

  /**
   * POST /api/progression/calculate-level
   * Calculate level from experience amount (utility endpoint)
   */
  async calculateLevelFromExperience(req: Request, res: Response): Promise<void> {
    try {
      const { experience } = req.body;

      if (!experience || typeof experience !== 'string') {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Experience must be provided as a string'
          }
        });
        return;
      }

      try {
        const expBigInt = BigInt(experience);
        
        // Use service method to calculate level
        let level = 1;
        let cumulativeExp = 0n;
        
        while (level < 10000) {
          const expForNextLevel = this.calculateExpForLevel(level + 1);
          if (cumulativeExp + expForNextLevel > expBigInt) {
            break;
          }
          cumulativeExp += expForNextLevel;
          level++;
        }

        res.json({
          success: true,
          data: {
            experience: experience,
            level: level,
            experienceInCurrentLevel: (expBigInt - cumulativeExp).toString(),
            experienceForNextLevel: this.calculateExpForLevel(level + 1).toString()
          }
        });
      } catch (error) {
        res.status(400).json({
          error: {
            code: 'INVALID_EXPERIENCE',
            message: 'Invalid experience value'
          }
        });
      }
    } catch (error) {
      logger.error('Failed to calculate level from experience', {
        experience: req.body.experience,
        error: error instanceof Error ? error.message : error
      });

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to calculate level'
        }
      });
    }
  }

  /**
   * Helper method to calculate experience for level (exposed for utility endpoint)
   */
  private calculateExpForLevel(level: number): bigint {
    if (level <= 1) return 0n;

    const baseExp = 1000n;
    const scalingFactor = 1.15;
    
    const exponent = level - 1;
    let result = baseExp;
    
    for (let i = 0; i < exponent; i++) {
      result = (result * BigInt(Math.floor(scalingFactor * 1000))) / 1000n;
    }
    
    return result;
  }
}