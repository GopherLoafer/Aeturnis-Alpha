/**
 * Zone Service - Step 2.4 Implementation
 * Manages zone data, player presence, and zone information
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { CacheManager } from './CacheManager';
import {
import { getErrorMessage } from '../utils/errorUtils';
  Zone,
  ZoneInfo,
  ZoneExit,
  CharacterInZone,
  LookResponse,
  Direction,
  ZoneStatistics,
  ZoneQueryParams,
  CreateZoneDto,
  UpdateZoneDto,
  ZONE_CONSTANTS
} from '../types/zone.types';

export class ZoneService {
  private db: Pool;
  private cacheManager: CacheManager;

  constructor(db: Pool, cacheManager: CacheManager) {
    this.db = db;
    this.cacheManager = cacheManager;
  }

  /**
   * Get zone information with exits and characters
   */
  async getZone(zoneId: string): Promise<ZoneInfo | null> {
    try {
      const cacheKey = `zone_info:${zoneId}`;
      const cached = await this.cacheManager.get<ZoneInfo>(cacheKey);
      if (cached) {
        return cached;
      }

      const zone = await this.getZoneById(zoneId);
      if (!zone) return null;

      const [exits, charactersPresent] = await Promise.all([
        this.getZoneExits(zoneId),
        this.getPlayersInZone(zoneId)
      ]);

      const zoneInfo: ZoneInfo = {
        zone,
        exits,
        charactersPresent,
        ambientDescription: this.generateAmbientDescription(zone),
        playerCount: charactersPresent.length
      };

      // Cache for 5 minutes
      await this.cacheManager.set(cacheKey, zoneInfo, { ttl: ZONE_CONSTANTS.CACHE_TTL_SECONDS });
      return zoneInfo;
    } catch (error) {
      logger.error('Failed to get zone information', {
        zoneId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Get zone by ID
   */
  async getZoneById(zoneId: string): Promise<Zone | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT id, internal_name, display_name, description, zone_type,
                level_range, pvp_enabled, safe_zone, climate, terrain, lighting,
                features, map_x, map_y, layer, monster_spawn_rate, ambient_sounds,
                created_at, updated_at
         FROM zones WHERE id = $1`,
        [zoneId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return this.mapRowToZone(row);
    } finally {
      client.release();
    }
  }

  /**
   * Get zone by internal name
   */
  async getZoneByName(internalName: string): Promise<Zone | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT id, internal_name, display_name, description, zone_type,
                level_range, pvp_enabled, safe_zone, climate, terrain, lighting,
                features, map_x, map_y, layer, monster_spawn_rate, ambient_sounds,
                created_at, updated_at
         FROM zones WHERE internal_name = $1`,
        [internalName]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return this.mapRowToZone(row);
    } finally {
      client.release();
    }
  }

  /**
   * Get exits from a zone
   */
  async getZoneExits(zoneId: string): Promise<ZoneExit[]> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `SELECT id, from_zone_id, to_zone_id, direction, exit_type,
                is_visible, is_locked, lock_type, required_level, required_item_id,
                travel_message, reverse_direction, created_at, updated_at
         FROM zone_exits 
         WHERE from_zone_id = $1 AND is_visible = true
         ORDER BY direction`,
        [zoneId]
      );

      return result.rows.map(row => this.mapRowToZoneExit(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get characters currently in a zone
   */
  async getPlayersInZone(zoneId: string): Promise<CharacterInZone[]> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        'SELECT * FROM get_characters_in_zone($1)',
        [zoneId]
      );

      return result.rows.map(row => ({
        characterId: row.character_id,
        characterName: row.character_name,
        level: row.level,
        raceName: row.race_name,
        activeTitle: row.active_title,
        x: row.x,
        y: row.y,
        lastMovement: row.last_movement
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Look in a specific direction from a zone
   */
  async look(zoneId: string, direction: Direction, characterLevel: number = 1): Promise<LookResponse> {
    try {
      const normalizedDirection = this.normalizeDirection(direction);
      if (!normalizedDirection) {
        return {
          direction,
          canAccess: false,
          blockReason: 'Invalid direction',
          description: 'You cannot look in that direction.'
        };
      }

      const exits = await this.getZoneExits(zoneId);
      const exit = exits.find(e => e.direction === normalizedDirection);

      if (!exit) {
        return {
          direction: normalizedDirection,
          canAccess: false,
          blockReason: 'No exit found',
          description: `There is nothing ${normalizedDirection} of here.`
        };
      }

      const destinationZone = await this.getZoneById(exit.toZoneId);
      if (!destinationZone) {
        return {
          direction: normalizedDirection,
          canAccess: false,
          blockReason: 'Destination zone not found',
          description: 'The path leads to an unknown location.'
        };
      }

      // Check access requirements
      const canAccess = this.canAccessExit(exit, characterLevel);
      const blockReason = canAccess ? undefined : this.getBlockReason(exit, characterLevel);

      const description = this.generateLookDescription(exit, destinationZone, canAccess);

      return {
        direction: normalizedDirection,
        exitInfo: exit,
        destinationZone,
        canAccess,
        blockReason,
        description
      };
    } catch (error) {
      logger.error('Failed to look in direction', {
        zoneId,
        direction,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Search zones with filters
   */
  async searchZones(params: ZoneQueryParams): Promise<Zone[]> {
    const client = await this.db.connect();
    try {
      let query = `
        SELECT id, internal_name, display_name, description, zone_type,
               level_range, pvp_enabled, safe_zone, climate, terrain, lighting,
               features, map_x, map_y, layer, monster_spawn_rate, ambient_sounds,
               created_at, updated_at
        FROM zones WHERE 1=1`;
      
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (params.zoneType) {
        query += ` AND zone_type = $${paramIndex}`;
        queryParams.push(params.zoneType);
        paramIndex++;
      }

      if (params.pvpEnabled !== undefined) {
        query += ` AND pvp_enabled = $${paramIndex}`;
        queryParams.push(params.pvpEnabled);
        paramIndex++;
      }

      if (params.safeZone !== undefined) {
        query += ` AND safe_zone = $${paramIndex}`;
        queryParams.push(params.safeZone);
        paramIndex++;
      }

      if (params.minLevel || params.maxLevel) {
        if (params.minLevel) {
          query += ` AND (level_range IS NULL OR lower(level_range) <= $${paramIndex})`;
          queryParams.push(params.minLevel);
          paramIndex++;
        }
        if (params.maxLevel) {
          query += ` AND (level_range IS NULL OR upper(level_range) >= $${paramIndex})`;
          queryParams.push(params.maxLevel);
          paramIndex++;
        }
      }

      if (params.climate) {
        query += ` AND climate = $${paramIndex}`;
        queryParams.push(params.climate);
        paramIndex++;
      }

      if (params.terrain) {
        query += ` AND terrain = $${paramIndex}`;
        queryParams.push(params.terrain);
        paramIndex++;
      }

      if (params.layer !== undefined) {
        query += ` AND layer = $${paramIndex}`;
        queryParams.push(params.layer);
        paramIndex++;
      }

      query += ` ORDER BY display_name`;

      if (params.limit) {
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(params.limit);
        paramIndex++;
      }

      if (params.offset) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(params.offset);
        paramIndex++;
      }

      const result = await client.query(query, queryParams);
      return result.rows.map(row => this.mapRowToZone(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get zone statistics
   */
  async getZoneStatistics(zoneId: string): Promise<ZoneStatistics | null> {
    const client = await this.db.connect();
    try {
      const zone = await this.getZoneById(zoneId);
      if (!zone) return null;

      // Get current player count
      const currentPlayers = await this.getPlayersInZone(zoneId);

      // Get movement statistics
      const movementStats = await client.query(
        `SELECT 
           COUNT(*) as total_visits,
           AVG(travel_time) as avg_travel_time,
           MAX(created_at) as last_visit
         FROM movement_log 
         WHERE to_zone_id = $1 
         AND created_at > CURRENT_DATE - INTERVAL '30 days'`,
        [zoneId]
      );

      // Get popular exits
      const exitStats = await client.query(
        `SELECT direction, COUNT(*) as count
         FROM movement_log 
         WHERE from_zone_id = $1 
         AND created_at > CURRENT_DATE - INTERVAL '7 days'
         GROUP BY direction 
         ORDER BY count DESC 
         LIMIT 5`,
        [zoneId]
      );

      return {
        zoneId,
        zoneName: zone.displayName,
        currentPlayerCount: currentPlayers.length,
        totalVisits: parseInt(movementStats.rows[0]?.total_visits || '0'),
        averageTimeSpent: parseFloat(movementStats.rows[0]?.avg_travel_time || '0'),
        popularExits: exitStats.rows.map(row => ({
          direction: row.direction,
          count: parseInt(row.count)
        })),
        peakPlayerTime: movementStats.rows[0]?.last_visit || new Date(),
        isActive: currentPlayers.length > 0
      };
    } finally {
      client.release();
    }
  }

  /**
   * Create a new zone
   */
  async createZone(zoneData: CreateZoneDto): Promise<Zone> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        `INSERT INTO zones (
           internal_name, display_name, description, zone_type, level_range,
           pvp_enabled, safe_zone, climate, terrain, lighting, features,
           map_x, map_y, layer, monster_spawn_rate, ambient_sounds
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          zoneData.internalName,
          zoneData.displayName,
          zoneData.description,
          zoneData.zoneType,
          zoneData.levelRange ? `[${zoneData.levelRange[0]},${zoneData.levelRange[1]}]` : null,
          zoneData.pvpEnabled || false,
          zoneData.safeZone || false,
          zoneData.climate,
          zoneData.terrain,
          zoneData.lighting,
          JSON.stringify(zoneData.features || {}),
          zoneData.mapX,
          zoneData.mapY,
          zoneData.layer || 0,
          zoneData.monsterSpawnRate || 0.0,
          JSON.stringify(zoneData.ambientSounds || [])
        ]
      );

      const zone = this.mapRowToZone(result.rows[0]);
      
      // Clear related caches
      await this.clearZoneCache(zone.id);
      
      logger.info('Zone created successfully', {
        zoneId: zone.id,
        internalName: zone.internalName,
        displayName: zone.displayName
      });

      return zone;
    } catch (error) {
      logger.error('Failed to create zone', {
        zoneData,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing zone
   */
  async updateZone(zoneData: UpdateZoneDto): Promise<Zone | null> {
    const client = await this.db.connect();
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 2; // Start at 2 since $1 is the zone ID

      if (zoneData.displayName !== undefined) {
        updates.push(`display_name = $${paramIndex}`);
        values.push(zoneData.displayName);
        paramIndex++;
      }

      if (zoneData.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        values.push(zoneData.description);
        paramIndex++;
      }

      if (zoneData.zoneType !== undefined) {
        updates.push(`zone_type = $${paramIndex}`);
        values.push(zoneData.zoneType);
        paramIndex++;
      }

      if (zoneData.levelRange !== undefined) {
        updates.push(`level_range = $${paramIndex}`);
        values.push(zoneData.levelRange ? `[${zoneData.levelRange[0]},${zoneData.levelRange[1]}]` : null);
        paramIndex++;
      }

      if (zoneData.pvpEnabled !== undefined) {
        updates.push(`pvp_enabled = $${paramIndex}`);
        values.push(zoneData.pvpEnabled);
        paramIndex++;
      }

      if (zoneData.safeZone !== undefined) {
        updates.push(`safe_zone = $${paramIndex}`);
        values.push(zoneData.safeZone);
        paramIndex++;
      }

      if (zoneData.features !== undefined) {
        updates.push(`features = $${paramIndex}`);
        values.push(JSON.stringify(zoneData.features));
        paramIndex++;
      }

      if (updates.length === 0) {
        return await this.getZoneById(zoneData.id);
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');

      const query = `
        UPDATE zones 
        SET ${updates.join(', ')} 
        WHERE id = $1 
        RETURNING *`;

      const result = await client.query(query, [zoneData.id, ...values]);

      if (result.rows.length === 0) return null;

      const zone = this.mapRowToZone(result.rows[0]);
      
      // Clear related caches
      await this.clearZoneCache(zone.id);
      
      logger.info('Zone updated successfully', {
        zoneId: zone.id,
        updates: Object.keys(zoneData).filter(key => key !== 'id')
      });

      return zone;
    } catch (error) {
      logger.error('Failed to update zone', {
        zoneData,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clear zone-related cache
   */
  private async clearZoneCache(zoneId: string): Promise<void> {
    const cacheKeys = [
      `zone_info:${zoneId  return;
}`,
      `zone_exits:${zoneId}`,
      `zone_players:${zoneId}`
    ];
    
    await Promise.all(cacheKeys.map(key => this.cacheManager.delete(key)));
  }

  /**
   * Map database row to Zone object
   */
  private mapRowToZone(row: any): Zone {
    return {
      id: row.id,
      internalName: row.internal_name,
      displayName: row.display_name,
      description: row.description,
      zoneType: row.zone_type,
      levelRange: row.level_range ? this.parseLevelRange(row.level_range) : null,
      pvpEnabled: row.pvp_enabled,
      safeZone: row.safe_zone,
      climate: row.climate,
      terrain: row.terrain,
      lighting: row.lighting,
      features: row.features || {},
      mapX: row.map_x,
      mapY: row.map_y,
      layer: row.layer,
      monsterSpawnRate: parseFloat(row.monster_spawn_rate),
      ambientSounds: row.ambient_sounds || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to ZoneExit object
   */
  private mapRowToZoneExit(row: any): ZoneExit {
    return {
      id: row.id,
      fromZoneId: row.from_zone_id,
      toZoneId: row.to_zone_id,
      direction: row.direction,
      exitType: row.exit_type,
      isVisible: row.is_visible,
      isLocked: row.is_locked,
      lockType: row.lock_type,
      requiredLevel: row.required_level,
      requiredItemId: row.required_item_id,
      travelMessage: row.travel_message,
      reverseDirection: row.reverse_direction,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Parse PostgreSQL int4range to tuple
   */
  private parseLevelRange(range: string): [number, number] | null {
    if (!range) return null;
    const match = range.match(/\[(\d+),(\d+)\]/);
    if (!match) return null;
    return [parseInt(match[1]), parseInt(match[2])];
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
   * Check if character can access an exit
   */
  private canAccessExit(exit: ZoneExit, characterLevel: number): boolean {
    if (exit.isLocked) return false;
    if (exit.requiredLevel > characterLevel) return false;
    if (exit.requiredItemId) return false; // TODO: Check inventory when implemented
    return true;
  }

  /**
   * Get reason why exit is blocked
   */
  private getBlockReason(exit: ZoneExit, characterLevel: number): string {
    if (exit.isLocked) {
      switch (exit.lockType) {
        case 'key': return 'This passage is locked and requires a key.';
        case 'level': return `You need to be level ${exit.requiredLevel} to access this area.`;
        case 'quest': return 'You must complete a specific quest to access this area.';
        case 'guild': return 'This area is restricted to guild members.';
        default: return 'This passage is locked.';
      }
    }
    
    if (exit.requiredLevel > characterLevel) {
      return `You need to be level ${exit.requiredLevel} to access this area.`;
    }
    
    if (exit.requiredItemId) {
      return 'You need a specific item to access this area.';
    }
    
    return 'Access denied.';
  }

  /**
   * Generate description for look command
   */
  private generateLookDescription(exit: ZoneExit, destinationZone: Zone, canAccess: boolean): string {
    const directionText = exit.direction.charAt(0).toUpperCase() + exit.direction.slice(1);
    
    if (!canAccess) {
      return `${directionText}, you see ${this.getExitTypeDescription(exit.exitType)} leading to ${destinationZone.displayName}, but it appears to be inaccessible.`;
    }
    
    let description = `${directionText}, you see ${this.getExitTypeDescription(exit.exitType)} leading to ${destinationZone.displayName}.`;
    
    if (destinationZone.description) {
      description += ` ${destinationZone.description.split('.')[0]}.`;
    }
    
    if (exit.travelMessage) {
      description += ` ${exit.travelMessage}`;
    }
    
    return description;
  }

  /**
   * Get description for exit type
   */
  private getExitTypeDescription(exitType: string): string {
    switch (exitType) {
      case 'door': return 'a door';
      case 'portal': return 'a shimmering portal';
      case 'teleporter': return 'a magical teleporter';
      case 'hidden': return 'a hidden passage';
      case 'magical': return 'a magical gateway';
      case 'ladder': return 'a ladder';
      case 'stairs': return 'stairs';
      default: return 'a path';
    }
  }

  /**
   * Generate ambient description for zone
   */
  private generateAmbientDescription(zone: Zone): string {
    let description = zone.description;
    
    if (zone.ambientSounds && zone.ambientSounds.length > 0) {
      const soundsText = zone.ambientSounds.join(', ');
      description += ` You can hear ${soundsText}.`;
    }
    
    if (zone.climate && zone.terrain) {
      description += ` The ${zone.climate} climate and ${zone.terrain} terrain create a unique atmosphere.`;
    }
    
    return description;
  }
}