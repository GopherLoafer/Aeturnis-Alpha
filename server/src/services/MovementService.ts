/**
 * Movement Service - Step 2.4 Implementation
 * Handles character movement between zones with validation and broadcasting
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { ZoneService } from './ZoneService';
import { CacheManager } from './CacheManager';
import { RealtimeService } from '../services/RealtimeService';
import {
import { getErrorMessage } from '../utils/errorUtils';
  MoveResult,
  Direction,
  MovementValidation,
  MovementErrorCode,
  CharacterLocation,
  MovementLogEntry,
  MovementType,
  ZONE_CONSTANTS
} from '../types/zone.types';

export class MovementService {
  private db: Pool;
  private zoneService: ZoneService;
  private cacheManager: CacheManager;
  private realtimeService: RealtimeService;

  constructor(
    db: Pool, 
    zoneService: ZoneService, 
    cacheManager: CacheManager,
    realtimeService: RealtimeService
  ) {
    this.db = db;
    this.zoneService = zoneService;
    this.cacheManager = cacheManager;
    this.realtimeService = realtimeService;
  }

  /**
   * Move character in specified direction
   */
  async moveCharacter(
    characterId: string, 
    direction: string,
    movementType: MovementType = 'normal'
  ): Promise<MoveResult> {
    const startTime = Date.now();
    
    try {
      // Normalize direction
      const normalizedDirection = this.normalizeDirection(direction);
      if (!normalizedDirection) {
        return {
          success: false,
          oldZoneId: '',
          newZoneId: '',
          direction: direction as Direction,
          travelMessage: 'Invalid direction.',
          newZoneInfo: null as any,
          error: 'Invalid direction provided'
        };
      }

      // Get character location and validate movement
      const currentLocation = await this.getCharacterLocation(characterId);
      if (!currentLocation) {
        return {
          success: false,
          oldZoneId: '',
          newZoneId: '',
          direction: normalizedDirection,
          travelMessage: 'Character location not found.',
          newZoneInfo: null as any,
          error: 'Character not found'
        };
      }

      // Validate movement
      const validation = await this.validateMovement(characterId, currentLocation.zoneId, normalizedDirection);
      if (!validation.canMove) {
        return {
          success: false,
          oldZoneId: currentLocation.zoneId,
          newZoneId: currentLocation.zoneId,
          direction: normalizedDirection,
          travelMessage: validation.errorMessage || 'Movement not allowed.',
          newZoneInfo: null as any,
          error: validation.errorMessage,
          cooldownRemaining: validation.cooldownRemaining
        };
      }

      // Get zone exits and find the target exit
      const exits = await this.zoneService.getZoneExits(currentLocation.zoneId);
      const exit = exits.find(e => e.direction === normalizedDirection);
      
      if (!exit) {
        return {
          success: false,
          oldZoneId: currentLocation.zoneId,
          newZoneId: currentLocation.zoneId,
          direction: normalizedDirection,
          travelMessage: `There is no exit ${normalizedDirection} from here.`,
          newZoneInfo: null as any,
          error: 'No exit found in that direction'
        };
      }

      // Perform the movement
      const travelTime = Date.now() - startTime;
      await this.executeMovement(characterId, currentLocation.zoneId, exit.toZoneId, normalizedDirection, movementType, travelTime);

      // Get new zone information
      const newZoneInfo = await this.zoneService.getZone(exit.toZoneId);
      if (!newZoneInfo) {
        throw new Error('Failed to load destination zone information');
      }

      // Broadcast movement events
      await this.broadcastMovement(characterId, currentLocation.zoneId, exit.toZoneId, normalizedDirection);

      // Create successful result
      const result: MoveResult = {
        success: true,
        oldZoneId: currentLocation.zoneId,
        newZoneId: exit.toZoneId,
        direction: normalizedDirection,
        travelMessage: exit.travelMessage || `You move ${normalizedDirection}.`,
        newZoneInfo,
        exitInfo: exit
      };

      logger.info('Character movement successful', {
        characterId,
        oldZoneId: currentLocation.zoneId,
        newZoneId: exit.toZoneId,
        direction: normalizedDirection,
        travelTime
      });

      return result;
    } catch (error) {
      logger.error('Character movement failed', {
        characterId,
        direction,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      
      throw error;
    }
  }

  /**
   * Get character's current location
   */
  async getCharacterLocation(characterId: string): Promise<CharacterLocation | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT character_id, zone_id, instance_id, x, y, last_movement,
                total_zones_visited, distance_traveled, unique_zones_visited,
                created_at, updated_at
         FROM character_locations 
         WHERE character_id = $1`,
        [characterId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        characterId: row.character_id,
        zoneId: row.zone_id,
        instanceId: row.instance_id,
        x: row.x,
        y: row.y,
        lastMovement: row.last_movement,
        totalZonesVisited: row.total_zones_visited,
        distanceTraveled: parseInt(row.distance_traveled),
        uniqueZonesVisited: row.unique_zones_visited || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate if character can move in the specified direction
   */
  async validateMovement(characterId: string, zoneId: string, direction: Direction): Promise<MovementValidation> {
    try {
      // Check movement cooldown
      const cooldownCheck = await this.checkMovementCooldown(characterId);
      if (!cooldownCheck.canMove) {
        return {
          canMove: false,
          errorCode: MovementErrorCode.COOLDOWN_ACTIVE,
          errorMessage: 'You must wait before moving again.',
          cooldownRemaining: cooldownCheck.remainingSeconds
        };
      }

      // Get character data for validation
      const characterData = await this.getCharacterData(characterId);
      if (!characterData) {
        return {
          canMove: false,
          errorCode: MovementErrorCode.CHARACTER_NOT_FOUND,
          errorMessage: 'Character not found.'
        };
      }

      // Check character status - cannot move if in combat, busy, or dead
      if (characterData.status === 'combat') {
        return {
          canMove: false,
          errorCode: MovementErrorCode.CHARACTER_IN_COMBAT,
          errorMessage: 'Cannot move while in combat.'
        };
      }

      if (characterData.status === 'busy') {
        return {
          canMove: false,
          errorCode: MovementErrorCode.CHARACTER_BUSY,
          errorMessage: 'Cannot move while busy.'
        };
      }

      if (characterData.status === 'dead') {
        return {
          canMove: false,
          errorCode: MovementErrorCode.CHARACTER_DEAD,
          errorMessage: 'Cannot move while dead.'
        };
      }

      // Get zone exits
      const exits = await this.zoneService.getZoneExits(zoneId);
      const exit = exits.find(e => e.direction === direction);

      if (!exit) {
        return {
          canMove: false,
          errorCode: MovementErrorCode.NO_EXIT,
          errorMessage: `There is no exit ${direction} from here.`
        };
      }

      // Check if exit is locked
      if (exit.isLocked) {
        return {
          canMove: false,
          errorCode: MovementErrorCode.EXIT_LOCKED,
          errorMessage: 'This exit is locked.'
        };
      }

      // Check level requirements
      if (exit.requiredLevel > characterData.level) {
        return {
          canMove: false,
          errorCode: MovementErrorCode.LEVEL_TOO_LOW,
          errorMessage: `You need to be level ${exit.requiredLevel} to access this area.`,
          requiredLevel: exit.requiredLevel
        };
      }

      // Check item requirements (placeholder for future item system)
      if (exit.requiredItemId) {
        return {
          canMove: false,
          errorCode: MovementErrorCode.MISSING_ITEM,
          errorMessage: 'You need a specific item to access this area.',
          requiredItem: exit.requiredItemId
        };
      }

      return { canMove: true };
    } catch (error) {
      logger.error('Movement validation failed', {
        characterId,
        zoneId,
        direction,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      
      return {
        canMove: false,
        errorCode: MovementErrorCode.ZONE_NOT_FOUND,
        errorMessage: 'Unable to validate movement at this time.'
      };
    }
  }

  /**
   * Check movement cooldown
   */
  async checkMovementCooldown(characterId: string): Promise<{ canMove: boolean; remainingSeconds?: number }> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        'SELECT check_movement_cooldown($1, $2) as can_move',
        [characterId, ZONE_CONSTANTS.MOVEMENT_COOLDOWN_SECONDS]
      );

      const canMove = result.rows[0]?.can_move || false;
      
      if (!canMove) {
        // Get exact remaining time
        const locationResult = await client.query(
          'SELECT last_movement FROM character_locations WHERE character_id = $1',
          [characterId]
        );
        
        if (locationResult.rows.length > 0) {
          const lastMovement = new Date(locationResult.rows[0].last_movement);
          const now = new Date();
          const elapsedSeconds = (now.getTime() - lastMovement.getTime()) / 1000;
          const remainingSeconds = Math.max(0, ZONE_CONSTANTS.MOVEMENT_COOLDOWN_SECONDS - elapsedSeconds);
          
          return { canMove: false, remainingSeconds: Math.ceil(remainingSeconds) };
        }
      }

      return { canMove };
    } finally {
      client.release();
    }
  }

  /**
   * Get character level
   */
  async getCharacterLevel(characterId: string): Promise<number | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        'SELECT level FROM characters WHERE id = $1 AND deleted_at IS NULL',
        [characterId]
      );

      return result.rows.length > 0 ? result.rows[0].level : null;
    } finally {
      client.release();
    }
  }

  /**
   * Get character data for validation
   */
  async getCharacterData(characterId: string): Promise<{ level: number; status: string } | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        'SELECT level, status FROM characters WHERE id = $1 AND deleted_at IS NULL',
        [characterId]
      );

      return result.rows.length > 0 ? {
        level: result.rows[0].level,
        status: result.rows[0].status
      } : null;
    } finally {
      client.release();
    }
  }

  /**
   * Execute the movement transaction
   */
  private async executeMovement(
    characterId: string,
    fromZoneId: string,
    toZoneId: string,
    direction: Direction,
    movementType: MovementType,
    travelTime: number
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Update character location using stored function
      await client.query(
        'SELECT update_character_location($1, $2, $3, $4, $5)',
        [characterId, toZoneId, direction, movementType, travelTime]
      );

      await client.query('COMMIT');

      // Clear character cache
      await this.clearCharacterCache(characterId);
      return;
} catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Broadcast movement to relevant zones
   */
  private async broadcastMovement(
    characterId: string,
    fromZoneId: string,
    toZoneId: string,
    direction: Direction
  ): Promise<void> {
    try {
      // Get character information for broadcasting
      const characterInfo = await this.getCharacterInfo(characterId);
      if (!characterInfo) return;

      // Broadcast exit message to old zone
      if (fromZoneId !== toZoneId) {
        this.realtimeService.broadcastToZone(fromZoneId, 'character_exit', {
          characterId,
          characterName: characterInfo.name,
          direction,
          message: `${characterInfo.name} leaves ${direction}.`
        });

        // Broadcast entry message to new zone
        const oppositeDirection = this.getOppositeDirection(direction);
        this.realtimeService.broadcastToZone(toZoneId, 'character_enter', {
          characterId,
          characterName: characterInfo.name,
          fromDirection: oppositeDirection,
          message: `${characterInfo.name} arrives from the ${oppositeDirection}.`
        });
      }

      // Update character's zone room membership
      await this.updateZoneRoomMembership(characterId, fromZoneId, toZoneId);
    } catch (error) {
      logger.error('Failed to broadcast movement', {
        characterId,
        fromZoneId,
        toZoneId,
        direction,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
    }
  }

  /**
   * Get character information for broadcasting
   */
  private async getCharacterInfo(characterId: string): Promise<{ name: string; level: number } | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        'SELECT name, level FROM characters WHERE id = $1 AND deleted_at IS NULL',
        [characterId]
      );

      return result.rows.length > 0 ? {
        name: result.rows[0].name,
        level: result.rows[0].level
      } : null;
    } finally {
      client.release();
    }
  }

  /**
   * Update character's zone room membership for real-time communication
   */
  private async updateZoneRoomMembership(characterId: string, fromZoneId: string, toZoneId: string): Promise<void> {
    try {
      // Broadcast zone exit if leaving a zone
      if (fromZoneId && fromZoneId !== toZoneId) {
        await this.realtimeService.broadcastToZone(fromZoneId, 'character_exit', {
          characterId,
          message: `A character has left the area.`,
          timestamp: Date.now()
          return;
});
      }

      // Broadcast zone entry to new zone
      if (toZoneId && fromZoneId !== toZoneId) {
        await this.realtimeService.broadcastToZone(toZoneId, 'character_enter', {
          characterId,
          message: `A character has entered the area.`,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error('Failed to update zone room membership', {
        characterId,
        fromZoneId,
        toZoneId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
    }
  }

  /**
   * Get movement history for a character
   */
  async getMovementHistory(
    characterId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<MovementLogEntry[]> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT id, character_id, from_zone_id, to_zone_id, direction,
                movement_type, travel_time, distance_units, created_at
         FROM movement_log 
         WHERE character_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [characterId, limit, offset]
      );

      return result.rows.map(row => ({
        id: row.id,
        characterId: row.character_id,
        fromZoneId: row.from_zone_id,
        toZoneId: row.to_zone_id,
        direction: row.direction,
        movementType: row.movement_type,
        travelTime: row.travel_time,
        distanceUnits: row.distance_units,
        createdAt: row.created_at
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Teleport character to a specific zone (admin/system function)
   */
  async teleportCharacter(
    characterId: string,
    targetZoneId: string,
    movementType: MovementType = 'teleport'
  ): Promise<MoveResult> {
    try {
      // Get current location
      const currentLocation = await this.getCharacterLocation(characterId);
      if (!currentLocation) {
        return {
          success: false,
          oldZoneId: '',
          newZoneId: targetZoneId,
          direction: 'enter' as Direction,
          travelMessage: 'Character location not found.',
          newZoneInfo: null as any,
          error: 'Character not found'
        };
      }

      // Validate target zone exists
      const targetZone = await this.zoneService.getZone(targetZoneId);
      if (!targetZone) {
        return {
          success: false,
          oldZoneId: currentLocation.zoneId,
          newZoneId: targetZoneId,
          direction: 'enter' as Direction,
          travelMessage: 'Target zone not found.',
          newZoneInfo: null as any,
          error: 'Target zone not found'
        };
      }

      // Execute teleport
      await this.executeMovement(characterId, currentLocation.zoneId, targetZoneId, 'enter', movementType, 0);

      // Broadcast teleport events
      await this.broadcastTeleport(characterId, currentLocation.zoneId, targetZoneId);

      return {
        success: true,
        oldZoneId: currentLocation.zoneId,
        newZoneId: targetZoneId,
        direction: 'enter' as Direction,
        travelMessage: `You have been teleported to ${targetZone.zone.displayName}.`,
        newZoneInfo: targetZone
      };
    } catch (error) {
      logger.error('Character teleport failed', {
        characterId,
        targetZoneId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Broadcast teleport events
   */
  private async broadcastTeleport(characterId: string, fromZoneId: string, toZoneId: string): Promise<void> {
    try {
      const characterInfo = await this.getCharacterInfo(characterId);
      if (!characterInfo) return;

      // Broadcast disappearance from old zone
      this.realtimeService.broadcastToZone(fromZoneId, 'character_teleport_out', {
        characterId,
        characterName: characterInfo.name,
        message: `${characterInfo.name} vanishes in a flash of light.`
      });

      // Broadcast appearance in new zone
      this.realtimeService.broadcastToZone(toZoneId, 'character_teleport_in', {
        characterId,
        characterName: characterInfo.name,
        message: `${characterInfo.name} appears in a flash of light.`
      });

      // Update zone room membership
      await this.updateZoneRoomMembership(characterId, fromZoneId, toZoneId);
    } catch (error) {
      logger.error('Failed to broadcast teleport', {
        characterId,
        fromZoneId,
        toZoneId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
    }
  }

  /**
   * Clear character-related cache
   */
  private async clearCharacterCache(characterId: string): Promise<void> {
    const cacheKeys = [
      `character_location:${characterId  return;
}`,
      `character_info:${characterId}`
    ];
    
    await Promise.all(cacheKeys.map(key => this.cacheManager.delete(key)));
  }

  /**
   * Normalize direction input
   */
  private normalizeDirection(direction: string): Direction | null {
    const lowercased = direction.toLowerCase();
    
    // Check if it's already a valid direction
    const validDirections: Direction[] = [
      'north', 'south', 'east', 'west',
      'northeast', 'northwest', 'southeast', 'southwest',
      'up', 'down', 'enter', 'exit'
    ];
    
    if (validDirections.includes(lowercased as Direction)) {
      return lowercased as Direction;
    }
    
    // Check aliases
    const alias = ZONE_CONSTANTS.DIRECTION_ALIASES[lowercased as keyof typeof ZONE_CONSTANTS.DIRECTION_ALIASES];
    return alias || null;
  }

  /**
   * Get opposite direction for broadcasting
   */
  private getOppositeDirection(direction: Direction): Direction {
    return ZONE_CONSTANTS.OPPOSITE_DIRECTIONS[direction] || direction;
  }
}