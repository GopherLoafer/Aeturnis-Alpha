/**
 * Affinity Routes - Step 2.6
 * REST API routes for weapon and magic affinity tracking
 */

import { Router } from 'express';
import { AffinityController } from '../controllers/AffinityController';
import { rateLimiters } from '../middleware/rateLimitRedis';

export function createAffinityRoutes(affinityController: AffinityController): Router {
  const router = Router();

  // Award affinity experience (internal endpoint)
  router.post('/exp',
    rateLimiters.affinityExp,
    AffinityController.awardExpValidation,
    affinityController.awardExperience.bind(affinityController)
  );

  // Get character affinities
  router.get('/',
    rateLimiters.affinityGeneral,
    affinityController.getCharacterAffinities.bind(affinityController)
  );

  // Get all available affinities (public)
  router.get('/all',
    rateLimiters.affinityGeneral,
    affinityController.getAllAffinities.bind(affinityController)
  );

  // Get affinity summary with tier names and progress
  router.get('/summary',
    rateLimiters.affinityGeneral,
    affinityController.getAffinitySummary.bind(affinityController)
  );

  // Get affinity bonus for a specific affinity
  router.get('/bonus/:name',
    rateLimiters.affinityGeneral,
    AffinityController.affinityNameValidation,
    affinityController.getAffinityBonus.bind(affinityController)
  );

  // Get single affinity data with character progression
  router.get('/:name',
    rateLimiters.affinityGeneral,
    AffinityController.affinityNameValidation,
    affinityController.getAffinityByName.bind(affinityController)
  );

  return router;
}