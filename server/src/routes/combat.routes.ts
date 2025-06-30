/**
 * Combat Routes - Step 2.5 Implementation
 * API routes for combat system management
 */

import { Router } from 'express';
import { CombatController } from '../controllers/CombatController';
import { AuthMiddleware } from '../middleware/auth';
import { combatRateLimit, apiRateLimit } from '../middleware/rateLimitRedis';

export function createCombatRoutes(combatController: CombatController): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware();

  // Apply authentication to all combat routes
  router.use(authMiddleware.authenticate);

  /**
   * POST /api/combat/start
   * Start a new combat encounter
   */
  router.post('/start',
    combatRateLimit, // Combat-specific rate limiting
    CombatController.startCombatValidation,
    combatController.startCombat.bind(combatController)
  );

  /**
   * POST /api/combat/:sessionId/action
   * Perform a combat action
   */
  router.post('/:sessionId/action',
    combatRateLimit, // Combat actions are rate limited
    CombatController.combatActionValidation,
    combatController.performAction.bind(combatController)
  );

  /**
   * GET /api/combat/:sessionId
   * Get combat session details
   */
  router.get('/:sessionId',
    apiRateLimit, // Standard API rate limiting
    CombatController.sessionIdValidation,
    combatController.getCombatSession.bind(combatController)
  );

  /**
   * GET /api/combat/:sessionId/statistics
   * Get combat session statistics
   */
  router.get('/:sessionId/statistics',
    apiRateLimit, // Standard API rate limiting
    CombatController.sessionIdValidation,
    combatController.getCombatStatistics.bind(combatController)
  );

  /**
   * POST /api/combat/:sessionId/flee
   * Attempt to flee from combat
   */
  router.post('/:sessionId/flee',
    combatRateLimit, // Flee attempts are rate limited
    CombatController.sessionIdValidation,
    combatController.fleeCombat.bind(combatController)
  );

  /**
   * GET /api/combat/active
   * Get active combat session for current character
   */
  router.get('/active',
    apiRateLimit, // Standard API rate limiting
    combatController.getActiveCombat.bind(combatController)
  );

  /**
   * POST /api/combat/:sessionId/end
   * End combat session (admin/system endpoint)
   */
  router.post('/:sessionId/end',
    apiRateLimit, // Standard API rate limiting
    CombatController.sessionIdValidation,
    combatController.endCombat.bind(combatController)
  );

  return router;
}