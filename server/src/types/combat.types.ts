/**
 * Combat System Types - Step 2.5 Implementation
 * Comprehensive type definitions for turn-based combat system
 */

// Core Combat Types
export interface CombatSession {
  id: string;
  sessionType: CombatType;
  status: CombatStatus;
  initiatorId: string;
  targetId?: string;
  zoneId: string;
  turnOrder: string[];
  currentTurn: number;
  turnNumber: number;
  startedAt: Date;
  endedAt?: Date;
  winner?: string;
  experience: number;
  gold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CombatParticipant {
  id: string;
  sessionId: string;
  characterId: string;
  participantType: ParticipantType;
  side: CombatSide;
  initiative: number;
  position: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  status: ParticipantStatus;
  statusEffects: StatusEffect[];
  lastActionAt?: Date;
  actionCooldowns: Record<string, Date>;
  damageTaken: number;
  damageDealt: number;
  actionsUsed: number;
  joinedAt: Date;
  leftAt?: Date;
}

export interface CombatAction {
  id: string;
  sessionId: string;
  actorId: string;
  targetId?: string;
  actionType: ActionType;
  actionName: string;
  damage: number;
  healing: number;
  mpCost: number;
  isCritical: boolean;
  isBlocked: boolean;
  isMissed: boolean;
  statusEffectApplied?: string;
  description: string;
  turnNumber: number;
  createdAt: Date;
}

// Enums
export enum CombatType {
  PVE = 'pve',
  PVP = 'pvp',
  BOSS = 'boss',
  ARENA = 'arena',
  DUEL = 'duel'
}

export enum CombatStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended',
  CANCELLED = 'cancelled'
}

export enum ParticipantType {
  PLAYER = 'player',
  MONSTER = 'monster',
  NPC = 'npc',
  BOSS = 'boss'
}

export enum CombatSide {
  ATTACKERS = 'attackers',
  DEFENDERS = 'defenders',
  NEUTRAL = 'neutral'
}

export enum ParticipantStatus {
  ALIVE = 'alive',
  DEAD = 'dead',
  FLED = 'fled',
  STUNNED = 'stunned',
  INCAPACITATED = 'incapacitated'
}

export enum ActionType {
  ATTACK = 'attack',
  SPELL = 'spell',
  HEAL = 'heal',
  DEFEND = 'defend',
  ITEM = 'item',
  SPECIAL = 'special',
  FLEE = 'flee'
}

// Status Effects
export interface StatusEffect {
  name: string;
  type: StatusEffectType;
  duration: number;
  value: number;
  appliedAt: Date;
  appliedBy: string;
}

export enum StatusEffectType {
  POISON = 'poison',
  BURN = 'burn',
  FREEZE = 'freeze',
  STUN = 'stun',
  BLIND = 'blind',
  REGENERATION = 'regeneration',
  SHIELD = 'shield',
  STRENGTH = 'strength',
  WEAKNESS = 'weakness',
  HASTE = 'haste',
  SLOW = 'slow'
}

// Combat Actions & Requests
export interface CombatActionRequest {
  actionType: ActionType;
  actionName: string;
  targetId?: string;
  itemId?: string;
  spellId?: string;
}

export interface CombatActionResult {
  success: boolean;
  action?: CombatAction;
  damage?: number;
  healing?: number;
  statusEffects?: StatusEffect[];
  message: string;
  error?: string;
  nextTurn?: string;
  combatEnded?: boolean;
  winner?: string;
}

// Combat Statistics
export interface CombatStats {
  sessionId: string;
  totalDamage: number;
  totalHealing: number;
  totalActions: number;
  criticalHits: number;
  blocks: number;
  misses: number;
  statusEffectsApplied: number;
  turnsDuration: number;
  participantStats: Record<string, ParticipantStats>;
}

export interface ParticipantStats {
  characterId: string;
  characterName: string;
  level: number;
  damageTaken: number;
  damageDealt: number;
  healingDone: number;
  actionsUsed: number;
  criticalHits: number;
  blocks: number;
  statusEffectsReceived: number;
  statusEffectsApplied: number;
  survivalTime: number;
}

// Combat Events for Real-time
export interface CombatStartEvent {
  sessionId: string;
  participants: CombatParticipant[];
  turnOrder: string[];
  currentTurn: string;
  message: string;
}

export interface CombatUpdateEvent {
  sessionId: string;
  action: CombatAction;
  updatedParticipants: CombatParticipant[];
  currentTurn: string;
  turnNumber: number;
  message: string;
}

export interface CombatEndEvent {
  sessionId: string;
  winner: string;
  reason: CombatEndReason;
  stats: CombatStats;
  rewards: CombatRewards;
  message: string;
}

export enum CombatEndReason {
  VICTORY = 'victory',
  DEFEAT = 'defeat',
  FLEE = 'flee',
  TIMEOUT = 'timeout',
  DISCONNECT = 'disconnect',
  CANCELLED = 'cancelled'
}

// Combat Rewards
export interface CombatRewards {
  experience: number;
  gold: number;
  items: RewardItem[];
  titles?: string[];
}

export interface RewardItem {
  itemId: string;
  quantity: number;
  rarity: string;
}

// Combat Configuration
export interface CombatConfig {
  maxParticipants: number;
  turnTimeLimit: number;
  maxTurns: number;
  criticalChance: number;
  blockChance: number;
  missChance: number;
  fleeChance: number;
  experienceMultiplier: number;
  goldMultiplier: number;
}

// Combat Validation
export interface CombatValidation {
  canAct: boolean;
  errorCode?: CombatErrorCode;
  errorMessage?: string;
  cooldownRemaining?: number;
  requiredMp?: number;
}

export enum CombatErrorCode {
  NOT_YOUR_TURN = 'NOT_YOUR_TURN',
  COMBAT_ENDED = 'COMBAT_ENDED',
  PARTICIPANT_DEAD = 'PARTICIPANT_DEAD',
  ACTION_ON_COOLDOWN = 'ACTION_ON_COOLDOWN',
  INSUFFICIENT_MP = 'INSUFFICIENT_MP',
  INVALID_TARGET = 'INVALID_TARGET',
  TARGET_DEAD = 'TARGET_DEAD',
  COMBAT_NOT_FOUND = 'COMBAT_NOT_FOUND',
  NOT_PARTICIPANT = 'NOT_PARTICIPANT',
  ALREADY_IN_COMBAT = 'ALREADY_IN_COMBAT',
  INVALID_ACTION = 'INVALID_ACTION',
  ZONE_MISMATCH = 'ZONE_MISMATCH'
}

// Combat Constants
export const COMBAT_CONSTANTS = {
  MAX_PARTICIPANTS: 8,
  TURN_TIME_LIMIT: 30000, // 30 seconds in milliseconds
  MAX_TURNS: 100,
  CRITICAL_CHANCE: 0.05, // 5%
  BLOCK_CHANCE: 0.1, // 10%
  MISS_CHANCE: 0.05, // 5%
  FLEE_CHANCE: 0.75, // 75%
  EXPERIENCE_MULTIPLIER: 1.0,
  GOLD_MULTIPLIER: 1.0,
  ACTION_COOLDOWNS: {
    ATTACK: 1000, // 1 second
    SPELL: 3000, // 3 seconds
    HEAL: 2000, // 2 seconds
    SPECIAL: 5000, // 5 seconds
    ITEM: 1500, // 1.5 seconds
    DEFEND: 500, // 0.5 seconds
    FLEE: 0 // No cooldown
  },
  STATUS_EFFECT_DURATIONS: {
    POISON: 3,
    BURN: 2,
    FREEZE: 1,
    STUN: 1,
    BLIND: 2,
    REGENERATION: 5,
    SHIELD: 3,
    STRENGTH: 4,
    WEAKNESS: 4,
    HASTE: 3,
    SLOW: 3
  }
};

// DTO Types
export interface CreateCombatSessionDto {
  sessionType: CombatType;
  initiatorId: string;
  targetId?: string;
  zoneId: string;
  participants: CreateCombatParticipantDto[];
}

export interface CreateCombatParticipantDto {
  characterId: string;
  participantType: ParticipantType;
  side: CombatSide;
  position?: number;
}

export interface UpdateCombatSessionDto {
  id: string;
  status?: CombatStatus;
  winner?: string;
  experience?: number;
  gold?: number;
}

// Query Parameters
export interface CombatQueryParams {
  characterId?: string;
  zoneId?: string;
  status?: CombatStatus;
  sessionType?: CombatType;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface CombatHistoryParams {
  characterId: string;
  limit?: number;
  offset?: number;
  includeActions?: boolean;
  sessionType?: CombatType;
}