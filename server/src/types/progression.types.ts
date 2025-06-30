/**
 * Progression System Types - Step 2.3 Implementation
 * Infinite leveling system with exponential scaling and phase-based progression
 */

// Progression phase definition
export interface ProgressionPhase {
  name: string;
  minLevel: number;
  maxLevel: number | null; // null for infinite (Legendary)
  bonusMultiplier: number;
  title: string;
  statPointsPerLevel: number;
}

// Experience award result
export interface ExperienceAwardResult {
  oldLevel: number;
  newLevel: number;
  oldExperience: bigint;
  newExperience: bigint;
  experienceGained: bigint;
  levelsGained: number;
  newTitle?: string;
  milestoneRewards: MilestoneReward[];
  statPointsAwarded: number;
}

// Milestone reward types
export interface MilestoneReward {
  level: number;
  type: 'stat_points' | 'gold' | 'title' | 'item';
  amount?: number;
  itemId?: string;
  title?: string;
  description: string;
}

// Experience source tracking
export type ExperienceSource = 
  | 'combat_kill'
  | 'quest_completion'
  | 'exploration'
  | 'crafting'
  | 'training'
  | 'event'
  | 'admin_grant'
  | 'milestone_bonus';

// Experience log entry
export interface ExperienceLogEntry {
  id: string;
  characterId: string;
  amount: bigint;
  source: ExperienceSource;
  sourceDetails?: Record<string, any>;
  oldLevel: number;
  newLevel: number;
  oldExperience: bigint;
  newExperience: bigint;
  timestamp: Date;
}

// Level up log entry
export interface LevelUpLogEntry {
  id: string;
  characterId: string;
  oldLevel: number;
  newLevel: number;
  statPointsAwarded: number;
  newTitle?: string;
  milestoneRewards: MilestoneReward[];
  timestamp: Date;
}

// Progression constants
export const PROGRESSION_CONSTANTS = {
  BASE_EXPERIENCE: 1000n,
  SCALING_FACTOR: 1.15, // 15% increase per level
  MAX_LEVEL: 999999, // Practical maximum for calculations
  
  // Stat points awarded per level by phase
  STAT_POINTS_PER_LEVEL: {
    NOVICE: 3,
    APPRENTICE: 4,
    JOURNEYMAN: 5,
    EXPERT: 6,
    MASTER: 8,
    GRANDMASTER: 10,
    LEGENDARY: 15
  },
  
  // Milestone levels for special rewards
  MILESTONE_LEVELS: [10, 25, 50, 100, 200, 250, 500, 750, 1000, 1500, 2000, 2500, 5000, 7500, 10000],
  
  // Title unlock requirements
  TITLE_UNLOCKS: {
    'the Novice': 1,
    'the Apprentice': 26,
    'the Journeyman': 51,
    'the Expert': 101,
    'the Master': 201,
    'the Grandmaster': 501,
    'of Legend': 1001,
    'the Immortal': 5000,
    'the Transcendent': 10000
  }
} as const;

// Progression phases configuration
export const PROGRESSION_PHASES: ProgressionPhase[] = [
  {
    name: 'Novice',
    minLevel: 1,
    maxLevel: 25,
    bonusMultiplier: 1.0,
    title: 'the Novice',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.NOVICE
  },
  {
    name: 'Apprentice',
    minLevel: 26,
    maxLevel: 50,
    bonusMultiplier: 1.1,
    title: 'the Apprentice',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.APPRENTICE
  },
  {
    name: 'Journeyman',
    minLevel: 51,
    maxLevel: 100,
    bonusMultiplier: 1.25,
    title: 'the Journeyman',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.JOURNEYMAN
  },
  {
    name: 'Expert',
    minLevel: 101,
    maxLevel: 200,
    bonusMultiplier: 1.5,
    title: 'the Expert',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.EXPERT
  },
  {
    name: 'Master',
    minLevel: 201,
    maxLevel: 500,
    bonusMultiplier: 2.0,
    title: 'the Master',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.MASTER
  },
  {
    name: 'Grandmaster',
    minLevel: 501,
    maxLevel: 1000,
    bonusMultiplier: 3.0,
    title: 'the Grandmaster',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.GRANDMASTER
  },
  {
    name: 'Legendary',
    minLevel: 1001,
    maxLevel: null, // Infinite
    bonusMultiplier: 5.0,
    title: 'of Legend',
    statPointsPerLevel: PROGRESSION_CONSTANTS.STAT_POINTS_PER_LEVEL.LEGENDARY
  }
];

// Milestone reward templates
export const MILESTONE_REWARDS: Record<number, MilestoneReward[]> = {
  10: [
    { level: 10, type: 'stat_points', amount: 5, description: 'First milestone bonus stats' },
    { level: 10, type: 'gold', amount: 1000, description: 'Level 10 gold reward' }
  ],
  25: [
    { level: 25, type: 'stat_points', amount: 10, description: 'Novice completion bonus' },
    { level: 25, type: 'title', title: 'the Dedicated', description: 'Completed Novice phase' }
  ],
  50: [
    { level: 50, type: 'stat_points', amount: 15, description: 'Apprentice completion bonus' },
    { level: 50, type: 'gold', amount: 5000, description: 'Apprentice gold reward' }
  ],
  100: [
    { level: 100, type: 'stat_points', amount: 25, description: 'Journeyman completion bonus' },
    { level: 100, type: 'title', title: 'the Centurion', description: 'Reached level 100' }
  ],
  200: [
    { level: 200, type: 'stat_points', amount: 35, description: 'Expert completion bonus' },
    { level: 200, type: 'gold', amount: 25000, description: 'Expert mastery reward' }
  ],
  250: [
    { level: 250, type: 'stat_points', amount: 40, description: 'Quarter-millennium milestone' },
    { level: 250, type: 'title', title: 'the Persistent', description: 'Extraordinary dedication' }
  ],
  500: [
    { level: 500, type: 'stat_points', amount: 75, description: 'Master completion bonus' },
    { level: 500, type: 'title', title: 'the Unstoppable', description: 'Legendary persistence' }
  ],
  1000: [
    { level: 1000, type: 'stat_points', amount: 150, description: 'Grandmaster completion bonus' },
    { level: 1000, type: 'title', title: 'the Legendary', description: 'Ascended beyond mortality' }
  ],
  5000: [
    { level: 5000, type: 'stat_points', amount: 500, description: 'Transcendence bonus' },
    { level: 5000, type: 'title', title: 'the Immortal', description: 'Beyond mortal comprehension' }
  ],
  10000: [
    { level: 10000, type: 'stat_points', amount: 1000, description: 'Ultimate achievement bonus' },
    { level: 10000, type: 'title', title: 'the Transcendent', description: 'The ultimate being' }
  ]
};

// Utility type for character progression data
export interface CharacterProgression {
  characterId: string;
  level: number;
  experience: bigint;
  nextLevelExp: bigint;
  totalStatPoints: number;
  availableStatPoints: number;
  currentPhase: ProgressionPhase;
  titles: string[];
  activeTitle?: string;
}