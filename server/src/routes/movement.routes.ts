/**
 * Movement Routes - Step 2.4 Implementation
 * API routes for zone navigation and character movement
 */

import { Router } from 'express';
import { MovementController } from '../controllers/MovementController';
import { authenticateJWT } from '../middleware/auth';
import { rateLimitRedis } from '../middleware/rateLimitRedis';

export function createMovementRoutes(movementController: MovementController): Router {
  const router = Router();

  // Apply authentication to all movement routes
  router.use(authenticateJWT);

  /**
   * POST /api/game/move
   * Move character in a cardinal direction
   */
  router.post('/move',
    rateLimitRedis('movement', 1, 2), // 2 moves per second max
    MovementController.moveValidation,
    movementController.moveCharacter.bind(movementController)
  );

  /**
   * GET /api/game/zone/:zoneId
   * Get zone information including exits and characters
   */
  router.get('/zone/:zoneId',
    rateLimitRedis('api', 10, 60), // 10 requests per minute
    MovementController.zoneIdValidation,
    movementController.getZoneInfo.bind(movementController)
  );

  /**
   * GET /api/game/look/:direction
   * Look in a specific direction to see what's there
   */
  router.get('/look/:direction',
    rateLimitRedis('api', 20, 60), // 20 look commands per minute
    MovementController.lookValidation,
    movementController.lookDirection.bind(movementController)
  );

  /**
   * GET /api/game/zones
   * Search zones with filters
   */
  router.get('/zones',
    rateLimitRedis('api', 10, 60), // 10 requests per minute
    movementController.searchZones.bind(movementController)
  );

  /**
   * GET /api/game/movement/history
   * Get character's movement history
   */
  router.get('/movement/history',
    rateLimitRedis('api', 5, 60), // 5 requests per minute
    movementController.getMovementHistory.bind(movementController)
  );

  /**
   * GET /api/game/location
   * Get character's current location
   */
  router.get('/location',
    rateLimitRedis('api', 30, 60), // 30 requests per minute
    movementController.getCurrentLocation.bind(movementController)
  );

  /**
   * POST /api/game/teleport
   * Teleport character to a specific zone (Admin/System endpoint)
   */
  router.post('/teleport',
    rateLimitRedis('admin', 5, 60), // 5 teleports per minute
    // TODO: Add admin authentication middleware
    movementController.teleportCharacter.bind(movementController)
  );

  return router;
}