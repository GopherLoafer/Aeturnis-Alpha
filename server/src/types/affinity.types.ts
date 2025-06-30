/**
 * Affinity System Types - Step 2.6
 * Type definitions for weapon and magic affinity tracking
 */

export interface Affinity {
  id: string;
  name: string;
  type: 'weapon' | 'magic';
  description: string;
  max_tier: number;
  created_at: Date;
}

export interface CharacterAffinity {
  id: string;
  character_id: string;
  affinity_id: string;
  experience: bigint;
  tier: number;
  last_updated: Date;
  created_at: Date;
  
  // Joined fields from affinity table
  affinity_name?: string;
  affinity_type?: 'weapon' | 'magic';
  affinity_description?: string;
  bonus_percentage?: number;
  next_tier_experience?: bigint;
  experience_to_next_tier?: bigint;
}

export interface AffinityLog {
  id: string;
  session_id?: string;
  character_id: string;
  affinity_id: string;
  experience_awarded: bigint;
  previous_tier: number;
  new_tier: number;
  source: 'combat' | 'quest' | 'training' | 'admin' | 'event';
  timestamp: Date;
}

export interface AffinityResult {
  success: boolean;
  character_affinity: CharacterAffinity;
  previous_tier: number;
  new_tier: number;
  experience_awarded: bigint;
  tier_up: boolean;
  total_experience: bigint;
  bonus_percentage: number;
  next_tier_experience: bigint;
  experience_to_next_tier: bigint;
}

export interface CreateAffinityDto {
  name: string;
  type: 'weapon' | 'magic';
  description: string;
  max_tier?: number;
}

export interface AwardAffinityExpDto {
  character_id: string;
  affinity_name: string;
  experience_amount: bigint;
  source?: 'combat' | 'quest' | 'training' | 'admin' | 'event';
  session_id?: string;
}

export interface AffinityProgressDto {
  affinity_name: string;
  current_tier: number;
  current_experience: bigint;
  experience_to_next_tier: bigint;
  bonus_percentage: number;
  tier_progress_percentage: number;
}

// Affinity tier names and thresholds
export const AFFINITY_TIERS = {
  1: 'Novice',
  2: 'Apprentice', 
  3: 'Adept',
  4: 'Expert',
  5: 'Master',
  6: 'Grandmaster',
  7: 'Legendary'
} as const;

export type AffinityTierName = typeof AFFINITY_TIERS[keyof typeof AFFINITY_TIERS];

// Affinity constants
export const AFFINITY_CONSTANTS = {
  BASE_EXP_PER_TIER: 100,
  EXP_MULTIPLIER: 1.2,
  BONUS_PER_TIER: 2, // 2% bonus per tier
  MAX_TIER: 7,
  MIN_TIER: 1,
  
  // Rate limiting
  EXP_AWARD_COOLDOWN: 500, // 500ms between awards per affinity
  
  // Experience award amounts
  COMBAT_BASE_EXP: 10,
  CRITICAL_HIT_BONUS: 5,
  KILL_BONUS: 20,
  BOSS_KILL_BONUS: 50,
  
  // Magic experience awards
  SPELL_BASE_EXP: 8,
  HEALING_BONUS: 3,
  STATUS_EFFECT_BONUS: 5,
  
  // Weapon type mappings for combat actions
  WEAPON_AFFINITY_MAP: {
    'basic_attack': 'sword', // Default weapon affinity
    'heavy_strike': 'sword',
    'quick_slash': 'dagger',
    'power_attack': 'axe',
    'precise_shot': 'bow',
    'staff_strike': 'staff',
    'crushing_blow': 'mace',
    'thrust': 'spear',
    'martial_arts': 'unarmed'
  } as Record<string, string>,
  
  // Magic school mappings for spells
  MAGIC_AFFINITY_MAP: {
    'fireball': 'fire',
    'heal': 'light',
    'lightning_bolt': 'lightning',
    'ice_shard': 'ice',
    'stone_armor': 'earth',
    'water_healing': 'water',
    'shadow_strike': 'shadow',
    'arcane_missile': 'arcane'
  } as Record<string, string>
} as const;

// Helper function types
export type AffinityBonusCalculator = (tier: number) => number;
export type ExperienceCalculator = (tier: number) => bigint;
export type TierCalculator = (experience: bigint) => number;

// Validation schemas for DTOs
export interface AffinityValidationRules {
  name: {
    minLength: number;
    maxLength: number;
    pattern: RegExp;
  };
  description: {
    maxLength: number;
  };
  experience: {
    min: bigint;
    max: bigint;
  };
  tier: {
    min: number;
    max: number;
  };
}

export const AFFINITY_VALIDATION: AffinityValidationRules = {
  name: {
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-z_]+$/
  },
  description: {
    maxLength: 500
  },
  experience: {
    min: BigInt(0),
    max: BigInt('9223372036854775807') // Max bigint value
  },
  tier: {
    min: 1,
    max: 7
  }
};

// Error types for affinity system
export class AffinityError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AffinityError';
  }
}

export const AFFINITY_ERRORS = {
  AFFINITY_NOT_FOUND: 'AFFINITY_NOT_FOUND',
  CHARACTER_AFFINITY_NOT_FOUND: 'CHARACTER_AFFINITY_NOT_FOUND',
  INVALID_EXPERIENCE_AMOUNT: 'INVALID_EXPERIENCE_AMOUNT',
  MAX_TIER_REACHED: 'MAX_TIER_REACHED',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_AFFINITY_TYPE: 'INVALID_AFFINITY_TYPE',
  DUPLICATE_AFFINITY: 'DUPLICATE_AFFINITY',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS'
} as const;

// Event types for real-time updates
export interface AffinityLevelUpEvent {
  character_id: string;
  affinity_name: string;
  affinity_type: 'weapon' | 'magic';
  previous_tier: number;
  new_tier: number;
  tier_name: AffinityTierName;
  bonus_percentage: number;
  total_experience: bigint;
  experience_to_next_tier: bigint;
  timestamp: Date;
}

export interface AffinityExpGainEvent {
  character_id: string;
  affinity_name: string;
  experience_awarded: bigint;
  total_experience: bigint;
  current_tier: number;
  bonus_percentage: number;
  source: string;
  timestamp: Date;
}