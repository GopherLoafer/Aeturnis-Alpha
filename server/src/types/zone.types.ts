/**
 * Zone and Movement System Types - Step 2.4 Implementation
 * World navigation and character movement types
 */

// Zone information
export interface Zone {
  id: string;
  internalName: string;
  displayName: string;
  description: string;
  zoneType: ZoneType;
  levelRange: [number, number] | null;
  pvpEnabled: boolean;
  safeZone: boolean;
  climate?: string;
  terrain?: string;
  lighting?: string;
  features: Record<string, any>;
  mapX?: number;
  mapY?: number;
  layer: number;
  monsterSpawnRate: number;
  ambientSounds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Zone types
export type ZoneType = 
  | 'normal' 
  | 'dungeon' 
  | 'city' 
  | 'wilderness' 
  | 'cave' 
  | 'tower' 
  | 'arena' 
  | 'guild_hall' 
  | 'instance';

// Zone exit information
export interface ZoneExit {
  id: string;
  fromZoneId: string;
  toZoneId: string;
  direction: Direction;
  exitType: ExitType;
  isVisible: boolean;
  isLocked: boolean;
  lockType?: LockType;
  requiredLevel: number;
  requiredItemId?: string;
  travelMessage?: string;
  reverseDirection?: Direction;
  createdAt: Date;
  updatedAt: Date;
}

// Movement directions
export type Direction = 
  | 'north' | 'south' | 'east' | 'west'
  | 'northeast' | 'northwest' | 'southeast' | 'southwest'
  | 'up' | 'down' | 'enter' | 'exit';

// Exit types
export type ExitType = 
  | 'normal' | 'door' | 'portal' | 'teleporter' 
  | 'hidden' | 'magical' | 'ladder' | 'stairs';

// Lock types
export type LockType = 
  | 'key' | 'level' | 'quest' | 'guild' 
  | 'password' | 'magic' | 'skill';

// Character location
export interface CharacterLocation {
  characterId: string;
  zoneId: string;
  instanceId?: string;
  x: number;
  y: number;
  lastMovement: Date;
  totalZonesVisited: number;
  distanceTraveled: number;
  uniqueZonesVisited: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Movement result
export interface MoveResult {
  success: boolean;
  oldZoneId: string;
  newZoneId: string;
  direction: Direction;
  travelMessage: string;
  newZoneInfo: ZoneInfo;
  exitInfo?: ZoneExit;
  error?: string;
  cooldownRemaining?: number;
}

// Zone information with context
export interface ZoneInfo {
  zone: Zone;
  exits: ZoneExit[];
  charactersPresent: CharacterInZone[];
  ambientDescription: string;
  playerCount: number;
}

// Character in zone
export interface CharacterInZone {
  characterId: string;
  characterName: string;
  level: number;
  raceName: string;
  activeTitle?: string;
  x: number;
  y: number;
  lastMovement: Date;
}

// Look response
export interface LookResponse {
  direction: Direction;
  exitInfo?: ZoneExit;
  destinationZone?: Zone;
  canAccess: boolean;
  blockReason?: string;
  description: string;
}

// Movement log entry
export interface MovementLogEntry {
  id: string;
  characterId: string;
  fromZoneId?: string;
  toZoneId: string;
  direction?: Direction;
  movementType: MovementType;
  travelTime: number;
  distanceUnits: number;
  createdAt: Date;
}

// Movement types
export type MovementType = 
  | 'normal' | 'teleport' | 'recall' 
  | 'summon' | 'forced' | 'respawn';

// Zone statistics
export interface ZoneStatistics {
  zoneId: string;
  zoneName: string;
  currentPlayerCount: number;
  totalVisits: number;
  averageTimeSpent: number;
  popularExits: { direction: Direction; count: number }[];
  peakPlayerTime: Date;
  isActive: boolean;
}

// Movement validation
export interface MovementValidation {
  canMove: boolean;
  errorCode?: MovementErrorCode;
  errorMessage?: string;
  requiredLevel?: number;
  requiredItem?: string;
  cooldownRemaining?: number;
}

// Movement error codes
export enum MovementErrorCode {
  NO_EXIT = 'NO_EXIT',
  EXIT_LOCKED = 'EXIT_LOCKED',
  LEVEL_TOO_LOW = 'LEVEL_TOO_LOW',
  MISSING_ITEM = 'MISSING_ITEM',
  COOLDOWN_ACTIVE = 'COOLDOWN_ACTIVE',
  ZONE_FULL = 'ZONE_FULL',
  PVP_RESTRICTED = 'PVP_RESTRICTED',
  INVALID_DIRECTION = 'INVALID_DIRECTION',
  CHARACTER_NOT_FOUND = 'CHARACTER_NOT_FOUND',
  ZONE_NOT_FOUND = 'ZONE_NOT_FOUND'
}

// Zone constants
export const ZONE_CONSTANTS = {
  MOVEMENT_COOLDOWN_SECONDS: 1,
  MAX_CHARACTERS_PER_ZONE: 100,
  DEFAULT_COORDINATES: { x: 0, y: 0 },
  CACHE_TTL_SECONDS: 300, // 5 minutes
  
  // Direction mappings
  DIRECTION_ALIASES: {
    'n': 'north',
    's': 'south',
    'e': 'east',
    'w': 'west',
    'ne': 'northeast',
    'nw': 'northwest',
    'se': 'southeast',
    'sw': 'southwest',
    'u': 'up',
    'd': 'down'
  } as const,
  
  // Opposite directions
  OPPOSITE_DIRECTIONS: {
    'north': 'south',
    'south': 'north',
    'east': 'west',
    'west': 'east',
    'northeast': 'southwest',
    'northwest': 'southeast',
    'southeast': 'northwest',
    'southwest': 'northeast',
    'up': 'down',
    'down': 'up',
    'enter': 'exit',
    'exit': 'enter'
  } as const,
  
  // Default zone features
  DEFAULT_ZONE_FEATURES: {
    normal: {
      visibility: 'good',
      temperature: 'moderate',
      weather: 'clear'
    },
    city: {
      population: 'high',
      services: ['shops', 'inn', 'bank'],
      safety: 'high'
    },
    dungeon: {
      danger_level: 'high',
      lighting: 'poor',
      treasure_chance: 'medium'
    }
  } as const
} as const;

// Zone creation/update DTOs
export interface CreateZoneDto {
  internalName: string;
  displayName: string;
  description: string;
  zoneType: ZoneType;
  levelRange?: [number, number];
  pvpEnabled?: boolean;
  safeZone?: boolean;
  climate?: string;
  terrain?: string;
  lighting?: string;
  features?: Record<string, any>;
  mapX?: number;
  mapY?: number;
  layer?: number;
  monsterSpawnRate?: number;
  ambientSounds?: string[];
}

export interface UpdateZoneDto extends Partial<CreateZoneDto> {
  id: string;
}

// Zone exit creation/update DTOs
export interface CreateZoneExitDto {
  fromZoneId: string;
  toZoneId: string;
  direction: Direction;
  exitType?: ExitType;
  isVisible?: boolean;
  isLocked?: boolean;
  lockType?: LockType;
  requiredLevel?: number;
  requiredItemId?: string;
  travelMessage?: string;
  reverseDirection?: Direction;
}

export interface UpdateZoneExitDto extends Partial<CreateZoneExitDto> {
  id: string;
}

// Zone query parameters
export interface ZoneQueryParams {
  zoneType?: ZoneType;
  pvpEnabled?: boolean;
  safeZone?: boolean;
  minLevel?: number;
  maxLevel?: number;
  climate?: string;
  terrain?: string;
  layer?: number;
  limit?: number;
  offset?: number;
}

// Movement query parameters
export interface MovementQueryParams {
  characterId?: string;
  zoneId?: string;
  movementType?: MovementType;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}