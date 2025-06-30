/**
 * Movement Routes - Step 2.4 Implementation
 * API routes for zone navigation and character movement
 */

import { Router } from 'express';
import { MovementController } from '../controllers/MovementController';
import { AuthMiddleware } from '../middleware/auth';
import { movementRateLimit, apiRateLimit } from '../middleware/rateLimitRedis';

export function createMovementRoutes(movementController: MovementController): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware();

  // Apply authentication to all movement routes
  router.use(authMiddleware.authenticate);

  /**
   * POST /api/game/move
   * Move character in a cardinal direction
   */
  router.post('/move',
    movementRateLimit, // Built-in movement rate limiting
    MovementController.moveValidation,
    movementController.moveCharacter.bind(movementController)
  );

  /**
   * GET /api/game/zone/:zoneId
   * Get zone information including exits and characters
   */
  router.get('/zone/:zoneId',
    apiRateLimit, // Standard API rate limiting
    MovementController.zoneIdValidation,
    movementController.getZoneInfo.bind(movementController)
  );

  /**
   * GET /api/game/look/:direction
   * Look in a specific direction to see what's there
   */
  router.get('/look/:direction',
    apiRateLimit, // Standard API rate limiting
    MovementController.lookValidation,
    movementController.lookDirection.bind(movementController)
  );

  /**
   * GET /api/game/zones
   * Search zones with filters
   */
  router.get('/zones',
    apiRateLimit, // Standard API rate limiting
    movementController.searchZones.bind(movementController)
  );

  /**
   * GET /api/game/movement/history
   * Get character's movement history
   */
  router.get('/movement/history',
    apiRateLimit, // Standard API rate limiting
    movementController.getMovementHistory.bind(movementController)
  );

  /**
   * GET /api/game/location
   * Get character's current location
   */
  router.get('/location',
    apiRateLimit, // Standard API rate limiting
    movementController.getCurrentLocation.bind(movementController)
  );

  /**
   * POST /api/game/teleport
   * Teleport character to a specific zone (Admin/System endpoint)
   */
  router.post('/teleport',
    apiRateLimit, // Standard API rate limiting for now
    // TODO: Add admin authentication middleware
    movementController.teleportCharacter.bind(movementController)
  );

  return router;
}