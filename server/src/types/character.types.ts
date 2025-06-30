/**
 * Character and Race Type Definitions for Aeturnis Online
 * Step 2.1 - Character System Database Design
 */

// Gender enum
export type Gender = 'male' | 'female' | 'neutral' | 'other';

// Character status enum
export type CharacterStatus = 'normal' | 'combat' | 'dead' | 'busy';

// Race interface
export interface Race {
  id: string;
  name: string;
  description: string;
  lore?: string;
  
  // Stat modifiers
  strength_modifier: number;
  vitality_modifier: number;
  dexterity_modifier: number;
  intelligence_modifier: number;
  wisdom_modifier: number;
  
  // Progression bonuses
  experience_bonus: number;
  weapon_affinity_bonus: number;
  magic_affinity_bonus: number;
  
  // Starting values
  starting_health: number;
  starting_mana: number;
  starting_zone: string;
  starting_gold: number;
  
  // Special traits and abilities
  special_abilities: string[];
  racial_traits: string[];
  equipment_restrictions: Record<string, boolean>;
  
  // Regeneration rates
  health_regen_rate: number;
  mana_regen_rate: number;
  
  // Customization options
  available_customizations: Record<string, string[]>;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
}

// Character interface
export interface Character {
  id: string;
  user_id: string;
  race_id: string;
  
  // Identity
  name: string;
  gender: Gender;
  
  // Progression
  level: number;
  experience: string; // NUMERIC(40,0) as string
  next_level_exp: string; // NUMERIC(40,0) as string
  titles: string[];
  status: CharacterStatus;
  
  // Core Stats
  strength: number;
  vitality: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  
  // Resources
  health: number;
  max_health: number;
  mana: number;
  max_mana: number;
  
  // Location
  current_zone: string;
  position_x: number;
  position_y: number;
  spawn_zone: string;
  
  // Inventory
  gold: number;
  inventory_slots: number;
  bank_slots: number;
  weight_capacity: number;
  current_weight: number;
  
  // Customization
  appearance: Record<string, any>;
  active_title?: string;
  settings: Record<string, any>;
  
  // Lifecycle
  created_at: Date;
  last_active: Date;
  deleted_at?: Date;
  updated_at: Date;
}

// Character Stats View interface (with race modifiers applied)
export interface CharacterStats extends Character {
  // Race information
  race_name: string;
  race_description: string;
  
  // Base stats (renamed for clarity)
  base_strength: number;
  base_vitality: number;
  base_dexterity: number;
  base_intelligence: number;
  base_wisdom: number;
  
  // Race modifiers
  strength_modifier: number;
  vitality_modifier: number;
  dexterity_modifier: number;
  intelligence_modifier: number;
  wisdom_modifier: number;
  
  // Total stats (base + modifiers)
  total_strength: number;
  total_vitality: number;
  total_dexterity: number;
  total_intelligence: number;
  total_wisdom: number;
  
  // Race bonuses
  experience_bonus: number;
  weapon_affinity_bonus: number;
  magic_affinity_bonus: number;
  health_regen_rate: number;
  mana_regen_rate: number;
  
  // Race traits
  special_abilities: string[];
  racial_traits: string[];
  equipment_restrictions: Record<string, boolean>;
}

// Input types for creating characters
export interface CreateCharacterInput {
  user_id: string;
  race_id: string;
  name: string;
  gender: Gender;
  appearance?: Record<string, any>;
  settings?: Record<string, any>;
}

// Input types for updating character stats
export interface UpdateCharacterStatsInput {
  strength?: number;
  vitality?: number;
  dexterity?: number;
  intelligence?: number;
  wisdom?: number;
}

// Input types for updating character resources
export interface UpdateCharacterResourcesInput {
  health?: number;
  max_health?: number;
  mana?: number;
  max_mana?: number;
}

// Input types for updating character location
export interface UpdateCharacterLocationInput {
  current_zone: string;
  position_x: number;
  position_y: number;
}

// Character creation response with race bonuses applied
export interface CharacterCreationData {
  character: Character;
  race: Race;
  calculated_stats: {
    total_strength: number;
    total_vitality: number;
    total_dexterity: number;
    total_intelligence: number;
    total_wisdom: number;
    starting_health: number;
    starting_mana: number;
    starting_gold: number;
  };
}

// Constants for character system
export const CHARACTER_CONSTANTS = {
  DEFAULT_LEVEL: 1,
  DEFAULT_EXPERIENCE: '0',
  DEFAULT_NEXT_LEVEL_EXP: '1000',
  DEFAULT_STATS: {
    strength: 10,
    vitality: 10,
    dexterity: 10,
    intelligence: 10,
    wisdom: 10,
  },
  DEFAULT_INVENTORY: {
    inventory_slots: 20,
    bank_slots: 50,
    weight_capacity: 100.00,
    current_weight: 0.00,
  },
  MAX_SESSIONS_PER_USER: 5,
  MAX_CHARACTERS_PER_USER: 5, // Alias for clarity
  EXPERIENCE_SCALE_FACTOR: 1.5, // For calculating next level experience
} as const;

// Race name constants
export const RACE_NAMES = {
  HUMAN: 'Human',
  ELF: 'Elf',
  DWARF: 'Dwarf',
  ORC: 'Orc',
  HALFLING: 'Halfling',
  DRAGONBORN: 'Dragonborn',
  TIEFLING: 'Tiefling',
  GNOME: 'Gnome',
} as const;