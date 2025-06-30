/**
 * Affinity Routes - Step 2.6
 * REST API routes for weapon and magic affinity tracking
 */

import { Router } from 'express';
import { AffinityController } from '../controllers/AffinityController';
import { rateLimitRedis } from '../middleware/rateLimitRedis';
import { getErrorMessage } from '../utils/errorUtils';

export function createAffinityRoutes(affinityController: AffinityController): Router {
  const router = Router();

  // Award affinity experience (internal endpoint)
  router.post('/exp',
    rateLimitRedis('affinityExp'),
    AffinityController.awardExpValidation,
    affinityController.awardExperience.bind(affinityController);
  );

  // Get character affinities
  router.get('/',
    rateLimitRedis('affinityGeneral'),
    affinityController.getCharacterAffinities.bind(affinityController);
  );

  // Get all available affinities (public)
  router.get('/all',
    rateLimitRedis('affinityGeneral'),
    affinityController.getAllAffinities.bind(affinityController);
  );

  // Get affinity summary with tier names and progress
  router.get('/summary',
    rateLimitRedis('affinityGeneral'),
    affinityController.getAffinitySummary.bind(affinityController);
  );

  // Get affinity bonus for a specific affinity
  router.get('/bonus/:name',
    rateLimitRedis('affinityGeneral'),
    AffinityController.affinityNameValidation,
    affinityController.getAffinityBonus.bind(affinityController);
  );

  // Get single affinity data with character progression
  router.get('/:name',
    rateLimitRedis('affinityGeneral'),
    AffinityController.affinityNameValidation,
    affinityController.getAffinityByName.bind(affinityController);
  );

  return router;
}