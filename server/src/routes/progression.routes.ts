/**
 * Progression Routes - Step 2.3 Implementation
 * REST API routes for character progression and experience management
 */

import { Router } from 'express';
import { ProgressionController } from '../controllers/ProgressionController';
import { AuthMiddleware } from '../middleware/auth';
import { authRateLimit, chatRateLimit } from '../middleware/rateLimitRedis';
import { getErrorMessage } from '../utils/errorUtils';

export function createProgressionRoutes(progressionController: ProgressionController): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware();

  // Apply authentication middleware to all progression routes
  router.use(authMiddleware.authenticate);

  // POST /api/progression/characters/:characterId/experience - Award experience
  router.post(
    '/characters/:characterId/experience',
    authRateLimit, // Limit experience award attempts
    ProgressionController.characterIdValidation,
    ProgressionController.awardExperienceValidation,
    progressionController.awardExperience.bind(progressionController)
  );

  // GET /api/progression/characters/:characterId - Get character progression
  router.get(
    '/characters/:characterId',
    ProgressionController.characterIdValidation,
    progressionController.getCharacterProgression.bind(progressionController)
  );

  // GET /api/progression/characters/:characterId/stats - Get progression statistics
  router.get(
    '/characters/:characterId/stats',
    ProgressionController.characterIdValidation,
    progressionController.getProgressionStats.bind(progressionController)
  );

  // GET /api/progression/characters/:characterId/experience-history - Get experience history
  router.get(
    '/characters/:characterId/experience-history',
    ProgressionController.characterIdValidation,
    progressionController.getExperienceHistory.bind(progressionController)
  );

  // GET /api/progression/characters/:characterId/level-history - Get level up history
  router.get(
    '/characters/:characterId/level-history',
    ProgressionController.characterIdValidation,
    progressionController.getLevelUpHistory.bind(progressionController)
  );

  // GET /api/progression/experience-curve - Calculate experience curve
  router.get(
    '/experience-curve',
    ProgressionController.experienceCurveValidation,
    progressionController.getExperienceCurve.bind(progressionController)
  );

  // GET /api/progression/phases - Get progression phases information
  router.get(
    '/phases',
    progressionController.getProgressionPhases.bind(progressionController)
  );

  // POST /api/progression/calculate-level - Calculate level from experience (utility)
  router.post(
    '/calculate-level',
    chatRateLimit, // Allow frequent calculations but prevent spam
    progressionController.calculateLevelFromExperience.bind(progressionController)
  );

  return router;
}