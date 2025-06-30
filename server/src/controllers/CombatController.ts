/**
 * Combat Controller - Step 2.5 Implementation
 * REST API endpoints for combat system management
 */

import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { CombatService } from '../services/CombatService';
import {
import { getErrorMessage } from '../utils/errorUtils';
  CombatActionRequest,
  CreateCombatSessionDto,
  CombatType,
  ActionType,
  ParticipantType,
  CombatSide,
  CombatErrorCode
} from '../types/combat.types';

interface AuthenticatedRequest extends Request {
  session?: {
    characterId?: string;
    userId?: string;
    [key: string]: any;
  };
}

export class CombatController {
  private combatService: CombatService;

  constructor(combatService: CombatService) {
    this.combatService = combatService;
  }

  /**
   * Validation middleware for starting combat
   */
  static startCombatValidation = [
    body('sessionType')
      .isIn(['pve', 'pvp', 'boss', 'arena', 'duel'])
      .withMessage('Invalid combat session type'),
    body('targetId')
      .optional()
      .isUUID()
      .withMessage('Target ID must be a valid UUID'),
    body('zoneId')
      .isUUID()
      .withMessage('Zone ID must be a valid UUID'),
    body('participants')
      .isArray({ min: 1, max: 8 })
      .withMessage('Must have between 1 and 8 participants'),
    body('participants.*.characterId')
      .isUUID()
      .withMessage('Character ID must be a valid UUID'),
    body('participants.*.participantType')
      .isIn(['player', 'monster', 'npc', 'boss'])
      .withMessage('Invalid participant type'),
    body('participants.*.side')
      .isIn(['attackers', 'defenders', 'neutral'])
      .withMessage('Invalid participant side')
  ];

  /**
   * Validation middleware for combat actions
   */
  static combatActionValidation = [
    param('sessionId')
      .isUUID()
      .withMessage('Session ID must be a valid UUID'),
    body('actionType')
      .isIn(['attack', 'spell', 'heal', 'defend', 'item', 'special', 'flee'])
      .withMessage('Invalid action type'),
    body('actionName')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Action name must be between 1 and 100 characters'),
    body('targetId')
      .optional()
      .isUUID()
      .withMessage('Target ID must be a valid UUID'),
    body('itemId')
      .optional()
      .isUUID()
      .withMessage('Item ID must be a valid UUID'),
    body('spellId')
      .optional()
      .isUUID()
      .withMessage('Spell ID must be a valid UUID')
  ];

  /**
   * Validation middleware for session ID parameter
   */
  static sessionIdValidation = [
    param('sessionId')
      .isUUID()
      .withMessage('Session ID must be a valid UUID')
  ];

  /**
   * POST /api/combat/start
   * Start a new combat encounter
   */
  async startCombat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character selected'
        });
        return;
      }

      const sessionData: CreateCombatSessionDto = {
        sessionType: req.body.sessionType as CombatType,
        initiatorId: characterId,
        targetId: req.body.targetId,
        zoneId: req.body.zoneId,
        participants: req.body.participants.map((p: any) => ({
          characterId: p.characterId,
          participantType: p.participantType as ParticipantType,
          side: p.side as CombatSide,
          position: p.position
        }))
      };

      const session = await this.combatService.startEncounter(sessionData);

      logger.info('Combat started via API', {
        sessionId: session.id,
        initiatorId: characterId,
        sessionType: session.sessionType
      });

      res.status(201).json({
        success: true,
        message: 'Combat encounter started successfully',
        data: {
          session,
          participants: await this.combatService.getSessionParticipants(session.id)
        }
      });

    } catch (error) {
      logger.error('Failed to start combat encounter', {
        error: error instanceof Error ? getErrorMessage(error) : error,
        body: req.body
      });

      if (error instanceof Error && getErrorMessage(error).includes('already in combat')) {
        res.status(409).json({
          success: false,
          message: 'Character is already in combat',
          errorCode: CombatErrorCode.ALREADY_IN_COMBAT
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to start combat encounter'
      });
    }
  }

  /**
   * POST /api/combat/:sessionId/action
   * Perform a combat action
   */
  async performAction(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character selected'
        });
        return;
      }

      const sessionId = req.params.sessionId;
      const actionRequest: CombatActionRequest = {
        actionType: req.body.actionType as ActionType,
        actionName: req.body.actionName,
        targetId: req.body.targetId,
        itemId: req.body.itemId,
        spellId: req.body.spellId
      };

      const result = await this.combatService.performAction(
        sessionId,
        characterId,
        actionRequest
      );

      if (!result.success) {
        res.status(400).json({
          success: false,
          message: result.message,
          errorCode: result.error,
          cooldownRemaining: result.action?.mpCost // Reuse field for cooldown
        });
        return;
      }

      logger.info('Combat action performed', {
        sessionId,
        actorId: characterId,
        actionType: actionRequest.actionType,
        actionName: actionRequest.actionName,
        success: result.success
      });

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          action: result.action,
          nextTurn: result.nextTurn,
          combatEnded: result.combatEnded,
          winner: result.winner
        }
      });

    } catch (error) {
      logger.error('Failed to perform combat action', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error,
        body: req.body
      });

      res.status(500).json({
        success: false,
        message: 'Failed to perform combat action'
      });
    }
  }

  /**
   * GET /api/combat/:sessionId
   * Get combat session details
   */
  async getCombatSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const sessionId = req.params.sessionId;
      const session = await this.combatService.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Combat session not found',
          errorCode: CombatErrorCode.COMBAT_NOT_FOUND
        });
        return;
      }

      const participants = await this.combatService.getSessionParticipants(sessionId);

      res.status(200).json({
        success: true,
        message: 'Combat session retrieved successfully',
        data: {
          session,
          participants,
          currentTurn: session.turnOrder[session.currentTurn],
          isActive: session.status === 'active'
        }
      });

    } catch (error) {
      logger.error('Failed to get combat session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve combat session'
      });
    }
  }

  /**
   * GET /api/combat/:sessionId/statistics
   * Get combat session statistics
   */
  async getCombatStatistics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const sessionId = req.params.sessionId;
      const session = await this.combatService.getSession(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Combat session not found',
          errorCode: CombatErrorCode.COMBAT_NOT_FOUND
        });
        return;
      }

      const stats = await this.combatService.getCombatStatistics(sessionId);

      res.status(200).json({
        success: true,
        message: 'Combat statistics retrieved successfully',
        data: stats
      });

    } catch (error) {
      logger.error('Failed to get combat statistics', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve combat statistics'
      });
    }
  }

  /**
   * POST /api/combat/:sessionId/flee
   * Attempt to flee from combat
   */
  async fleeCombat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character selected'
        });
        return;
      }

      const sessionId = req.params.sessionId;
      const fleeRequest: CombatActionRequest = {
        actionType: 'flee' as ActionType,
        actionName: 'flee'
      };

      const result = await this.combatService.performAction(
        sessionId,
        characterId,
        fleeRequest
      );

      logger.info('Flee attempt', {
        sessionId,
        characterId,
        success: result.success
      });

      res.status(200).json({
        success: result.success,
        message: result.message,
        data: {
          combatEnded: result.combatEnded,
          escaped: result.success
        }
      });

    } catch (error) {
      logger.error('Failed to flee from combat', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'Failed to flee from combat'
      });
    }
  }

  /**
   * GET /api/combat/active
   * Get active combat session for current character
   */
  async getActiveCombat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const characterId = req.session?.characterId;
      if (!characterId) {
        res.status(401).json({
          success: false,
          message: 'No active character selected'
          return;
});
        return;
      }

      // Find active combat session for this character
      const client = await this.combatService['db'].connect();
      try {
        const result = await client.query(`
          SELECT cs.* FROM combat_sessions cs
          JOIN combat_participants cp ON cp.session_id = cs.id
          WHERE cp.character_id = $1 AND cs.status = 'active'
          LIMIT 1
        `, [characterId]);

        if (result.rows.length === 0) {
          res.status(200).json({
            success: true,
            message: 'No active combat session',
            data: null
          });
          return;
        }

        const sessionId = result.rows[0].id;
        const session = await this.combatService.getSession(sessionId);
        const participants = await this.combatService.getSessionParticipants(sessionId);

        res.status(200).json({
          success: true,
          message: 'Active combat session found',
          data: {
            session,
            participants,
            currentTurn: session?.turnOrder[session.currentTurn]
          }
        });

      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('Failed to get active combat', {
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve active combat'
      });
    }
  }

  /**
   * POST /api/combat/:sessionId/end
   * End combat session (admin/system endpoint)
   */
  async endCombat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
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

      const sessionId = req.params.sessionId;
      const winner = req.body.winner;
      const reason = req.body.reason || 'cancelled';

      await this.combatService.endEncounter(sessionId, winner, reason);

      logger.info('Combat ended via API', {
        sessionId,
        winner,
        reason
      });

      res.status(200).json({
        success: true,
        message: 'Combat session ended successfully'
      });

    } catch (error) {
      logger.error('Failed to end combat session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });

      res.status(500).json({
        success: false,
        message: 'Failed to end combat session'
      });
    }
  }
}