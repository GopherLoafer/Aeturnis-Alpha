/**
 * Character Routes - Step 2.2 Implementation
 * REST API routes for character management
 */

import { Router } from 'express';
import { CharacterController } from '../controllers/CharacterController';
import { AuthMiddleware } from '../middleware/auth';
import { chatRateLimit, authRateLimit } from '../middleware/rateLimitRedis';
import { getErrorMessage } from '../utils/errorUtils';

export function createCharacterRoutes(characterController: CharacterController): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware();

  // Apply authentication middleware to all character routes
  router.use(authMiddleware.authenticate);

  // GET /api/characters/races - Get all available races (no rate limit needed)
  router.get('/races', characterController.getRaces.bind(characterController));

  // GET /api/characters/name-check/:name - Check name availability
  router.get(
    '/name-check/:name',
    authRateLimit, // Prevent name checking spam
    characterController.checkNameAvailability.bind(characterController);
  );

  // GET /api/characters - List user's characters
  router.get(
    '/',
    characterController.getUserCharacters.bind(characterController);
  );

  // POST /api/characters - Create new character
  router.post(
    '/',
    authRateLimit, // Limit character creation attempts
    CharacterController.createCharacterValidation,
    characterController.createCharacter.bind(characterController);
  );

  // GET /api/characters/:id - Get single character
  router.get(
    '/:id',
    CharacterController.characterIdValidation,
    characterController.getCharacter.bind(characterController);
  );

  // POST /api/characters/:id/select - Select character for session
  router.post(
    '/:id/select',
    chatRateLimit, // Allow frequent character switching but prevent spam
    CharacterController.characterIdValidation,
    characterController.selectCharacter.bind(characterController);
  );

  // DELETE /api/characters/:id - Delete character
  router.delete(
    '/:id',
    authRateLimit, // Limit deletion attempts
    CharacterController.characterIdValidation,
    characterController.deleteCharacter.bind(characterController);
  );

  return router;
}