/**
 * Affinity Controller - Step 2.6
 * REST API endpoints for weapon and magic affinity management
 */

import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { AffinityService } from '../services/AffinityService';
import {
import { getErrorMessage } from '../utils/errorUtils';
  AffinityError,
  AFFINITY_ERRORS,
  AFFINITY_VALIDATION
} from '../types/affinity.types';

interface AuthenticatedRequest extends Request {
  session?: {
    characterId?: string;
    userId?: string;
    [key: string]: any;
  };
}

export class AffinityController {
  private affinityService: AffinityService;

  constructor(affinityService: AffinityService) {
    this.affinityService = affinityService;
  }

  /**
   * Validation middleware for awarding experience
   */
  static awardExpValidation = [
    body('character_id')
      .isUUID()
      .withMessage('Character ID must be a valid UUID'),
    body('affinity_name')
      .isLength({ min: AFFINITY_VALIDATION.name.minLength, max: AFFINITY_VALIDATION.name.maxLength })
      .matches(AFFINITY_VALIDATION.name.pattern)
      .withMessage('Affinity name must be lowercase with underscores only'),
    body('experience_amount')
      .isInt({ min: 1 })
      .withMessage('Experience amount must be a positive integer'),
    body('source')
      .optional()
      .isIn(['combat', 'quest', 'training', 'admin', 'event'])
      .withMessage('Source must be one of: combat, quest, training, admin, event'),
    body('session_id')
      .optional()
      .isUUID()
      .withMessage('Session ID must be a valid UUID')
  ];

  /**
   * Validation middleware for affinity name parameter
   */
  static affinityNameValidation = [
    param('name')
      .isLength({ min: AFFINITY_VALIDATION.name.minLength, max: AFFINITY_VALIDATION.name.maxLength })
      .matches(AFFINITY_VALIDATION.name.pattern)
      .withMessage('Affinity name must be lowercase with underscores only')
  ];

  /**
   * POST /api/affinity/exp
   * Award affinity experience (internal endpoint)
   */
  async awardExperience(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
          return;
});
        return;
      }

      const { character_id, affinity_name, experience_amount, source = 'combat', session_id } = req.body;

      // Verify character ownership (if session available)
      if (req.session?.characterId && req.session?.characterId || "" !== character_id) {
        res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'Cannot award experience to another character'
        });
        return;
      }

      const result = await this.affinityService.awardAffinityExp(
        character_id,
        affinity_name,
        BigInt(experience_amount),
        source,
        session_id
      );

      res.status(200).json({
        success: true,
        data: {
          ...result,
          // Convert BigInt values to strings for JSON serialization
          experience_awarded: result.experience_awarded.toString(),
          total_experience: result.total_experience.toString(),
          next_tier_experience: result.next_tier_experience.toString(),
          experience_to_next_tier: result.experience_to_next_tier.toString(),
          character_affinity: {
            ...result.character_affinity,
            experience: result.character_affinity.experience.toString(),
            next_tier_experience: result.character_affinity.next_tier_experience?.toString(),
            experience_to_next_tier: result.character_affinity.experience_to_next_tier?.toString()
          }
        }
      });

    } catch (error) {
      if (error instanceof AffinityError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code,
          message: getErrorMessage(error)
        });
      } else {
        console.error('Affinity experience award error:', error);
        res.status(500).json({
          success: false,
          error: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred'
        });
      }
    }
  }

  /**
   * GET /api/affinity
   * List all character affinities with progression data
   */
  async getCharacterAffinities(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.session?.characterId) {
        res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Active character required'
          return;
});
        return;
      }

      const affinities = await this.affinityService.getCharacterAffinities(req.session?.characterId || "");

      // Convert BigInt values to strings for JSON serialization
      const serializedAffinities = affinities.map(affinity => ({
        ...affinity,
        experience: affinity.experience.toString(),
        next_tier_experience: affinity.next_tier_experience?.toString(),
        experience_to_next_tier: affinity.experience_to_next_tier?.toString()
      }));

      res.status(200).json({
        success: true,
        data: serializedAffinities,
        count: serializedAffinities.length
      });

    } catch (error) {
      console.error('Get character affinities error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve character affinities'
      });
    }
  }

  /**
   * GET /api/affinity/:name
   * Get single affinity data with character progression
   */
  async getAffinityByName(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
          return;
});
        return;
      }

      if (!req.session?.characterId) {
        res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Active character required'
        });
        return;
      }

      const { name } = req.params;

      // Get affinity details
      const affinity = await this.affinityService.getAffinityByName(name);
      if (!affinity) {
        res.status(404).json({
          success: false,
          error: AFFINITY_ERRORS.AFFINITY_NOT_FOUND,
          message: `Affinity '${name}' not found`
        });
        return;
      }

      // Get character's progression in this affinity
      const characterAffinities = await this.affinityService.getCharacterAffinities(req.session?.characterId || "");
      const characterAffinity = characterAffinities.find(ca => ca.affinity_name === name);

      // Get current bonus percentage
      const bonusPercentage = await this.affinityService.getAffinityBonus(req.session?.characterId || "", name);

      const responseData = {
        affinity,
        character_progression: characterAffinity ? {
          ...characterAffinity,
          experience: characterAffinity.experience.toString(),
          next_tier_experience: characterAffinity.next_tier_experience?.toString(),
          experience_to_next_tier: characterAffinity.experience_to_next_tier?.toString()
        } : null,
        bonus_percentage: bonusPercentage
      };

      res.status(200).json({
        success: true,
        data: responseData
      });

    } catch (error) {
      console.error('Get affinity by name error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve affinity data'
      });
    }
  }

  /**
   * GET /api/affinity/all
   * Get all available affinities (public data)
   */
  async getAllAffinities(req: Request, res: Response): Promise<void> {
    try {
      const affinities = await this.affinityService.getAllAffinities();

      res.status(200).json({
        success: true,
        data: affinities,
        count: affinities.length
        return;
});

    } catch (error) {
      console.error('Get all affinities error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve affinities'
      });
    }
  }

  /**
   * GET /api/affinity/bonus/:name
   * Get current bonus percentage for a specific affinity
   */
  async getAffinityBonus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
          return;
});
        return;
      }

      if (!req.session?.characterId) {
        res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Active character required'
        });
        return;
      }

      const { name } = req.params;
      const bonusPercentage = await this.affinityService.getAffinityBonus(req.session?.characterId || "", name);

      res.status(200).json({
        success: true,
        data: {
          affinity_name: name,
          character_id: req.session?.characterId || "",
          bonus_percentage: bonusPercentage
        }
      });

    } catch (error) {
      console.error('Get affinity bonus error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve affinity bonus'
      });
    }
  }

  /**
   * GET /api/affinity/summary
   * Get character affinity summary with tier names and progress percentages
   */
  async getAffinitySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.session?.characterId) {
        res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Active character required'
          return;
});
        return;
      }

      const affinities = await this.affinityService.getCharacterAffinities(req.session?.characterId || "");

      // Calculate additional progression data
      const summary = affinities.map(affinity => {
        const currentExp = affinity.experience;
        const nextTierExp = affinity.next_tier_experience || BigInt(0);
        const expToNext = affinity.experience_to_next_tier || BigInt(0);
        
        // Calculate progress percentage within current tier
        let tierProgressPercentage = 0;
        if (nextTierExp > BigInt(0) && expToNext < nextTierExp) {
          const tierStartExp = nextTierExp - expToNext - BigInt(1);
          const progressInTier = currentExp - tierStartExp;
          const tierExpRange = nextTierExp - tierStartExp;
          tierProgressPercentage = tierExpRange > BigInt(0) 
            ? Number((progressInTier * BigInt(100)) / tierExpRange)
            : 100;
        }

        return {
          affinity_name: affinity.affinity_name,
          affinity_type: affinity.affinity_type,
          current_tier: affinity.tier,
          tier_name: this.getTierName(affinity.tier),
          current_experience: currentExp.toString(),
          experience_to_next_tier: expToNext.toString(),
          bonus_percentage: affinity.bonus_percentage || 0,
          tier_progress_percentage: Math.min(100, Math.max(0, tierProgressPercentage)),
          last_updated: affinity.last_updated
        };
      });

      res.status(200).json({
        success: true,
        data: summary,
        count: summary.length
      });

    } catch (error) {
      console.error('Get affinity summary error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve affinity summary'
      });
    }
  }

  /**
   * Helper method to get tier name
   */
  private getTierName(tier: number): string {
    const tierNames = {
      1: 'Novice',
      2: 'Apprentice',
      3: 'Adept',
      4: 'Expert',
      5: 'Master',
      6: 'Grandmaster',
      7: 'Legendary'
    };
    return tierNames[tier as keyof typeof tierNames] || 'Unknown';
  }
}