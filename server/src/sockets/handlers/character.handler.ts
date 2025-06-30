/**
 * Character Event Handlers
 * Handles character selection, movement, and actions in real-time
 */

import { Server as SocketIOServer } from 'socket.io';
import { SocketWithAuth } from '../middleware/auth';
import { RoomManager } from '../rooms/RoomManager';
import { PresenceManager } from '../presence/PresenceManager';
import { logger } from '../../utils/logger';
import { repositories } from '../../database/repositories';
import { getErrorMessage } from '../utils/errorUtils';

const roomManager = new RoomManager();
const presenceManager = new PresenceManager();

export interface CharacterSelectData {
  characterId: string;
}

export interface MovementData {
  x: number;
  y: number;
  z?: number;
  direction?: number;
  timestamp: number;
}

export interface ActionData {
  action: string;
  targetId?: string;
  parameters?: any;
  timestamp: number;
}

export function registerCharacterHandlers(io: SocketIOServer, socket: SocketWithAuth): void {
  
  socket.on('character:select', async (data: CharacterSelectData) => {
    const startTime = Date.now();
    
    try {
      logger.debug('Character select request', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: data.characterId,
      });

      // Validate character ownership
      const hasAccess = await validateCharacterOwnership(socket.userId, data.characterId);
      if (!hasAccess) {
        socket.emit('character:error', {
          code: 'ACCESS_DENIED',
          message: 'You do not own this character',
        });
      }

      // Load character data from database
      const characterData = await loadCharacterData(data.characterId, socket.userId);
      if (!characterData) {
        socket.emit('character:error', {
          code: 'CHARACTER_NOT_FOUND',
          message: 'Character not found',
        });
      }

      // Join character-specific rooms
      await roomManager.joinCharacterRoom(socket, data.characterId);
      
      // Join character's current zone
      if (characterData.currentZone) {
        await roomManager.joinZone(socket, characterData.currentZone);
      }

      // Update presence with character info
      await presenceManager.updatePresence(socket.userId, {
        characterId: data.characterId,
        zone: characterData.currentZone,
        activity: 'character_selected',
      });

      // Broadcast character online to zone
      if (characterData.currentZone) {
        socket.to(`zone:${characterData.currentZone}`).emit('character:online', {
          characterId: data.characterId,
          userId: socket.userId,
          position: characterData.position,
          appearance: characterData.appearance,
          timestamp: Date.now(),
        });
      }

      // Send character data to client
      socket.emit('character:selected', {
        character: characterData,
        timestamp: Date.now(),
      });

      const processTime = Date.now() - startTime;
      
      logger.info('Character selected successfully', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: data.characterId,
        zone: characterData.currentZone,
        processTime,
      });

    } catch (error) {
      logger.error('Character select error', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: data.characterId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('character:error', {
        code: 'SELECT_FAILED',
        message: 'Failed to select character',
      });
    }
  });

  socket.on('character:move', async (data: MovementData) => {
    try {
      if (!socket.characterId) {
        socket.emit('character:error', {
          code: 'NO_CHARACTER',
          message: 'No character selected',
        });`
      }

      // Validate movement data
      if (!isValidMovement(data)) {
        socket.emit('character:error', {
          code: 'INVALID_MOVEMENT',
          message: 'Invalid movement data',
        });
      }

      // Check anti-cheat: movement speed and distance
      const isValidMove = await validateMovement(socket.characterId, data);
      if (!isValidMove) {
        socket.emit('character:error', {
          code: 'INVALID_MOVEMENT_SPEED',
          message: 'Movement too fast or invalid',
        });
        
        logger.warn('Potential movement cheat detected', {
          socketId: socket.id,
          userId: socket.userId,
          characterId: socket.characterId,
          movement: data,
        });
        `
      }

      // Update character position in database
      await updateCharacterPosition(socket.characterId, data);

      // Track activity
      await presenceManager.trackActivity(socket.userId, 'moving', {
        position: { x: data.x, y: data.y, z: data.z },
      });

      // Broadcast movement to zone
      const currentZone = await getCharacterZone(socket.characterId);
      if (currentZone) {
        socket.to(`zone:${currentZone}`).emit('character:moved', {
          characterId: socket.characterId,
          position: {
            x: data.x,
            y: data.y,
            z: data.z,
            direction: data.direction,
          },
          timestamp: data.timestamp,
        });
      }

      logger.debug('Character moved', {
        socketId: socket.id,
        characterId: socket.characterId,
        position: { x: data.x, y: data.y },
        zone: currentZone,
      });

    } catch (error) {
      logger.error('Character movement error', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: socket.characterId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('character:error', {
        code: 'MOVEMENT_FAILED',
        message: 'Failed to process movement',
      });
    }
  });

  socket.on('character:action', async (data: ActionData) => {
    try {
      if (!socket.characterId) {
        socket.emit('character:error', {
          code: 'NO_CHARACTER',
          message: 'No character selected',
        });`
      }

      // Validate action data
      if (!isValidAction(data)) {
        socket.emit('character:error', {
          code: 'INVALID_ACTION',
          message: 'Invalid action data',
        });
      }

      // Check action permissions and cooldowns
      const canPerformAction = await validateAction(socket.characterId, data);
      if (!canPerformAction.allowed) {
        socket.emit('character:error', {
          code: 'ACTION_DENIED',
          message: canPerformAction.reason,
        });
        `
      }

      // Process the action
      const actionResult = await processCharacterAction(socket.characterId, data);

      // Track activity
      await presenceManager.trackActivity(socket.userId, 'action', {
        action: data.action,
        target: data.targetId,
      });

      // Broadcast action to relevant players
      await broadcastAction(socket, actionResult);

      // Send result to player
      socket.emit('character:action_result', {
        action: data.action,
        result: actionResult,
        timestamp: Date.now(),
      });

      logger.debug('Character action processed', {
        socketId: socket.id,
        characterId: socket.characterId,
        action: data.action,
        success: actionResult.success,
      });

    } catch (error) {
      logger.error('Character action error', {
        socketId: socket.id,
        userId: socket.userId,
        characterId: socket.characterId,
        action: data.action,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });

      socket.emit('character:error', {
        code: 'ACTION_FAILED',
        message: 'Failed to process action',
      });
    }
  });

  socket.on('character:status_update', async (data: { status: string; message?: string }) => { try {
      if (!socket.characterId) }
      // Update character status
      await updateCharacterStatus(socket.characterId, data.status, data.message);

      // Broadcast status update
      const currentZone = await getCharacterZone(socket.characterId);
      if (currentZone) {
        socket.to(`zone:${currentZone}`).emit('character:status_changed', {
          characterId: socket.characterId,
          status: data.status,
          message: data.message,
          timestamp: Date.now(),
        });
      }

      logger.debug('Character status updated', {
        socketId: socket.id,
        characterId: socket.characterId,
        status: data.status,
      });

    } catch (error) {
      logger.error('Character status update error', {
        socketId: socket.id,
        characterId: socket.characterId,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
    }
  });
}

// Helper functions

async function validateCharacterOwnership(req: Request, res: Response): Promise<void> {
  try {
    const character = await repositories.characters.getCharacterByIdAndUserId(
      parseInt(characterId), 
      userId;
    );
    return character !== null;
  } catch (error) {
    logger.error('Failed to validate character ownership', {
      userId,
      characterId,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    return false;
  }
}

async function loadCharacterData(req: Request, res: Response): Promise<void> {
  try {
    const character = await repositories.characters.getCharacterByIdAndUserId(parseInt(characterId), userId);
    if (!character) {
      return null;
    }
    
    return {
      id: character.id,
      name: character.name,
      class: character.class,
      level: character.level,
      currentZone: character.zone_id,
      position: { 
        x: character.position_x, 
        y: character.position_y, 
        z: character.position_z 
      },
      rotation: character.rotation,
      health: character.health,
      maxHealth: character.max_health,
      mana: character.mana,
      maxMana: character.max_mana,
      stats: {
        strength: character.strength,
        agility: character.agility,
        intelligence: character.intelligence,
      },
      status: character.status,
    };
  } catch (error) {
    logger.error('Failed to load character data', {
      characterId,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    return null;
  }
}

async function updateCharacterPosition(req: Request, res: Response): Promise<void> {
  try {
    await repositories.characters.updateCharacterPosition(parseInt(characterId), {
      position_x: movement.x,
      position_y: movement.y,
      position_z: movement.z || 0,
      rotation: movement.direction || 0,
    });
    
    logger.debug('Character position updated', { characterId, position: movement });
  } catch (error) {
    logger.error('Failed to update character position', {
      characterId,
      movement,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    throw error;
  }
}

async function getCharacterZone(req: Request, res: Response): Promise<void> {
  // TODO: Implement database query to get character's current zone
  return 'starting_village'; // Placeholder
}

async function updateCharacterStatus(req: Request, res: Response): Promise<void> {
  // TODO: Implement database update for character status
  logger.debug('Character status updated', { characterId, status, message });
}

function isValidMovement(data: MovementData): boolean {
  return (
    typeof data.x === 'number' &&
    typeof data.y === 'number' &&
    typeof data.timestamp === 'number' &&
    !isNaN(data.x) &&
    !isNaN(data.y) &&
    data.timestamp > 0
  );
}

function isValidAction(data: ActionData): boolean {
  return (
    typeof data.action === 'string' &&
    data.action.length > 0 &&
    typeof data.timestamp === 'number' &&
    data.timestamp > 0
  );
}

async function validateMovement(req: Request, res: Response): Promise<void> {
  // TODO: Implement anti-cheat validation
  // Check movement speed, distance, and time consistency
  return true; // Placeholder
}

async function validateAction(req: Request, res: Response): Promise<void> {
  // TODO: Implement action validation
  // Check cooldowns, permissions, resource requirements
  return { allowed: true }; // Placeholder
}

async function processCharacterAction(req: Request, res: Response): Promise<void> {
  // TODO: Implement action processing logic
  return {
    success: true,
    effects: [],
    timestamp: Date.now(),
  }; // Placeholder
}

async function broadcastAction(req: Request, res: Response): Promise<void> {
  try {
    const currentZone = await getCharacterZone(socket.characterId!);
    if (currentZone) {
      socket.to(`zone:${currentZone}`).emit('character:action_broadcast', {
        characterId: socket.characterId,
        result: actionResult,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    logger.error('Failed to broadcast action', {
      socketId: socket.id,
      characterId: socket.characterId,
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
  }
}