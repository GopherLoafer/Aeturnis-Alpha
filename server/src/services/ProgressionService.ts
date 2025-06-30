/**
 * Progression Service - Step 2.3 Implementation
 * Infinite character leveling system with exponential scaling and milestone rewards
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { ProgressionRepository } from '../database/repositories/ProgressionRepository';
import { CharacterRepository } from '../database/repositories/CharacterRepository';
import { CacheManager } from './CacheManager';
import {
import { getErrorMessage } from '../utils/errorUtils';
  ProgressionPhase,
  ExperienceAwardResult,
  MilestoneReward,
  ExperienceSource,
  CharacterProgression,
  PROGRESSION_CONSTANTS,
  PROGRESSION_PHASES,
  MILESTONE_REWARDS
} from '../types/progression.types';

export class ProgressionService {
  private progressionRepo: ProgressionRepository;
  private characterRepo: CharacterRepository;
  private cacheManager: CacheManager;
  private db: Pool;

  constructor(db: Pool, cacheManager: CacheManager) {
    this.db = db;
    this.progressionRepo = new ProgressionRepository(db);
    this.characterRepo = new CharacterRepository(db);
    this.cacheManager = cacheManager;
  }

  /**
   * Calculate experience required for a specific level
   * Uses exponential formula: baseExp * (scalingFactor ^ (level - 1))
   */
  calculateExpForLevel(level: number): bigint {
    if (level <= 1) return 0n;

    const baseExp = PROGRESSION_CONSTANTS.BASE_EXPERIENCE;
    const scalingFactor = PROGRESSION_CONSTANTS.SCALING_FACTOR;
    
    // Use BigInt for precision with large numbers
    // Formula: 1000 * (1.15 ^ (level - 1))
    const exponent = level - 1;
    let result = baseExp;
    
    // Calculate power using repeated multiplication for precision
    for (let i = 0; i < exponent; i++) {
      result = (result * BigInt(Math.floor(scalingFactor * 1000))) / 1000n;
    }
    
    return result;
  }

  /**
   * Calculate total cumulative experience required to reach a level
   * This is the sum of all experience from level 1 to the target level
   */
  calculateTotalExpForLevel(level: number): bigint {
    if (level <= 1) return 0n;

    let totalExp = 0n;
    
    // Sum up all experience requirements from level 1 to target level
    for (let i = 2; i <= level; i++) {
      totalExp += this.calculateExpForLevel(i);
    }
    
    return totalExp;
  }

  /**
   * Get the progression phase for a given level
   */
  getProgressionPhase(level: number): ProgressionPhase {
    for (const phase of PROGRESSION_PHASES) {
      if (level >= phase.minLevel && (phase.maxLevel === null || level <= phase.maxLevel)) {
        return phase;
      }
    }
    
    // Fallback to Legendary phase for extremely high levels
    return PROGRESSION_PHASES[PROGRESSION_PHASES.length - 1];
  }

  /**
   * Award experience to a character and handle level ups
   */
  async awardExperience(
    characterId: string,
    amount: bigint,
    source: ExperienceSource,
    sourceDetails?: Record<string, any>
  ): Promise<ExperienceAwardResult> {
    try {
      // Get current character progression
      const progression = await this.progressionRepo.getCharacterProgression(characterId);
      if (!progression) {
        throw new Error('Character not found');
      }

      // Get character race for bonus calculation
      const character = await this.characterRepo.findById(characterId);
      if (!character) {
        throw new Error('Character not found');
      }

      const race = await this.characterRepo.getRaceById(character.race_id);
      if (!race) {
        throw new Error('Character race not found');
      }

      // Calculate bonuses
      const currentPhase = this.getProgressionPhase(progression.level);
      const raceBonusMultiplier = race.experience_bonus;
      const phaseBonusMultiplier = currentPhase.bonusMultiplier;
      
      // Calculate final experience amount
      const raceBonus = (amount * BigInt(Math.floor(raceBonusMultiplier * 1000))) / 1000n;
      const finalAmount = (raceBonus * BigInt(Math.floor(phaseBonusMultiplier * 1000))) / 1000n;

      // Calculate new experience total
      const oldExperience = progression.experience;
      const newExperience = oldExperience + finalAmount;
      
      // Determine new level
      const oldLevel = progression.level;
      const newLevel = this.calculateLevelFromExperience(newExperience);
      const levelsGained = newLevel - oldLevel;

      // Calculate next level experience requirement
      const nextLevelExp = this.calculateExpForLevel(newLevel + 1);

      // Prepare result object
      const result: ExperienceAwardResult = {
        oldLevel,
        newLevel,
        oldExperience,
        newExperience,
        experienceGained: finalAmount,
        levelsGained,
        milestoneRewards: [],
        statPointsAwarded: 0
      };

      // Handle level up if occurred
      if (levelsGained > 0) {
        const levelUpResults = await this.handleLevelUp(
          characterId,
          oldLevel,
          newLevel,
          progression
        );
        
        result.newTitle = levelUpResults.newTitle;
        result.milestoneRewards = levelUpResults.milestoneRewards;
        result.statPointsAwarded = levelUpResults.statPointsAwarded;
      }

      // Update character progression in database
      const newAvailableStatPoints = progression.availableStatPoints + result.statPointsAwarded;
      
      if (levelsGained > 0) {
        // Perform full level up transaction
        await this.progressionRepo.performLevelUpTransaction(
          characterId,
          {
            level: newLevel,
            experience: newExperience,
            nextLevelExp: nextLevelExp,
            availableStatPoints: newAvailableStatPoints,
            newTitle: result.newTitle
          },
          {
            characterId,
            amount: finalAmount,
            source,
            sourceDetails: sourceDetails || {},
            oldLevel,
            newLevel,
            oldExperience,
            newExperience
          },
          {
            characterId,
            oldLevel,
            newLevel,
            statPointsAwarded: result.statPointsAwarded,
            newTitle: result.newTitle,
            milestoneRewards: result.milestoneRewards
          },
          result.milestoneRewards
        );
      } else {
        // Just update progression and log experience
        await this.progressionRepo.updateCharacterProgression(
          characterId,
          newLevel,
          newExperience,
          nextLevelExp,
          newAvailableStatPoints
        );
        
        await this.progressionRepo.logExperience({
          characterId,
          amount: finalAmount,
          source,
          sourceDetails: sourceDetails || {},
          oldLevel,
          newLevel,
          oldExperience,
          newExperience
        });
      }

      // Clear character cache to ensure fresh data
      await this.clearCharacterCache(characterId);

      logger.info('Experience awarded successfully', {
        characterId,
        amount: amount.toString(),
        finalAmount: finalAmount.toString(),
        source,
        oldLevel,
        newLevel,
        levelsGained,
        statPointsAwarded: result.statPointsAwarded,
        milestoneRewards: result.milestoneRewards.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to award experience', {
        characterId,
        amount: amount.toString(),
        source,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Calculate character level based on total experience
   */
  private calculateLevelFromExperience(totalExp: bigint): number {
    if (totalExp <= 0n) return 1;

    let level = 1;
    let cumulativeExp = 0n;
    
    // Find the highest level where cumulative exp <= totalExp
    while (level < PROGRESSION_CONSTANTS.MAX_LEVEL) {
      const expForNextLevel = this.calculateExpForLevel(level + 1);
      if (cumulativeExp + expForNextLevel > totalExp) {
        break;
      }
      cumulativeExp += expForNextLevel;
      level++;
    }
    
    return level;
  }

  /**
   * Handle level up rewards and phase transitions
   */
  private async handleLevelUp(
    characterId: string,
    oldLevel: number,
    newLevel: number,
    progression: CharacterProgression
  ): Promise<{
    statPointsAwarded: number;
    newTitle?: string;
    milestoneRewards: MilestoneReward[];
  }> {
    let totalStatPointsAwarded = 0;
    let newTitle: string | undefined;
    const milestoneRewards: MilestoneReward[] = [];

    // Award stat points for each level gained
    for (let level = oldLevel + 1; level <= newLevel; level++) {
      const phase = this.getProgressionPhase(level);
      totalStatPointsAwarded += phase.statPointsPerLevel;

      // Check for phase transition title
      if (level === phase.minLevel && level > 1) {
        newTitle = phase.title;
        await this.progressionRepo.addCharacterTitle(characterId, phase.title);
      }

      // Check for milestone rewards
      if (PROGRESSION_CONSTANTS.MILESTONE_LEVELS.includes(level)) {
        const rewards = await this.awardLevelUpRewards(characterId, level);
        milestoneRewards.push(...rewards);
      }

      // Check for special title unlocks
      const titleUnlockLevel = Object.entries(PROGRESSION_CONSTANTS.TITLE_UNLOCKS)
        .find(([_, unlockLevel]) => unlockLevel === level);
      
      if (titleUnlockLevel) {
        const [title] = titleUnlockLevel;
        if (!newTitle) newTitle = title; // Use first title encountered
        await this.progressionRepo.addCharacterTitle(characterId, title);
      }
    }

    return {
      statPointsAwarded: totalStatPointsAwarded,
      newTitle,
      milestoneRewards
    };
  }

  /**
   * Award milestone rewards for reaching specific levels
   */
  private async awardLevelUpRewards(
    characterId: string,
    level: number
  ): Promise<MilestoneReward[]> {
    const rewards = MILESTONE_REWARDS[level as keyof typeof MILESTONE_REWARDS] || [];
    const awardedRewards: MilestoneReward[] = [];

    for (const reward of rewards) {
      try {
        // Apply the reward based on type
        switch (reward.type) {
          case 'stat_points':
            // Stat points are handled by the main level up logic
            awardedRewards.push(reward);
            break;
            
          case 'gold':
            if (reward.amount) {
              // Add gold to character
              await this.awardGold(characterId, reward.amount);
              awardedRewards.push(reward);
            }
            break;
            
          case 'title':
            if (reward.title) {
              await this.progressionRepo.addCharacterTitle(characterId, reward.title);
              awardedRewards.push(reward);
            }
            break;
            
          case 'item':
            // Item rewards would be implemented with inventory system
            // For now, just log the reward
            awardedRewards.push(reward);
            break;
        }

        // Log milestone achievement
        await this.progressionRepo.logMilestoneAchievement(
          characterId,
          level,
          reward.type,
          { ...reward }
        );
      } catch (error) {
        logger.error('Failed to award milestone reward', {
          characterId,
          level,
          reward,
          error: error instanceof Error ? getErrorMessage(error) : error
        });
      }
    }

    return awardedRewards;
  }

  /**
   * Award gold to character (helper method)
   */
  private async awardGold(characterId: string, amount: number): Promise<void> {
    try {
      const client = await this.db.connect();
      try {
        await client.query(
          'UPDATE characters SET gold = gold + $1 WHERE id = $2',
          [amount, characterId]
        );
        return;
} finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to award gold', {
        characterId,
        amount,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Get character progression summary
   */
  async getCharacterProgression(characterId: string): Promise<CharacterProgression | null> {
    try {
      const cacheKey = `progression:${characterId}`;
      const cached = await this.cacheManager.get<CharacterProgression>(cacheKey);
      if (cached) {
        return cached;
      }

      const progression = await this.progressionRepo.getCharacterProgression(characterId);
      if (!progression) {
        return null;
      }

      // Set current phase
      progression.currentPhase = this.getProgressionPhase(progression.level);

      // Calculate total stat points earned
      let totalStatPoints = 0;
      for (let level = 2; level <= progression.level; level++) {
        const phase = this.getProgressionPhase(level);
        totalStatPoints += phase.statPointsPerLevel;
      }
      progression.totalStatPoints = totalStatPoints;

      // Cache for 5 minutes
      await this.cacheManager.set(cacheKey, progression, { ttl: 300 });

      return progression;
    } catch (error) {
      logger.error('Failed to get character progression', {
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Get progression statistics for a character
   */
  async getProgressionStats(characterId: string): Promise<{
    currentLevel: number;
    currentPhase: string;
    experienceToNextLevel: bigint;
    progressPercentage: number;
    totalStatPointsEarned: number;
    availableStatPoints: number;
    titlesUnlocked: string[];
    nextMilestone: number | null;
  } | null> {
    try {
      const progression = await this.getCharacterProgression(characterId);
      if (!progression) {
        return null;
      }

      const nextLevelExp = this.calculateExpForLevel(progression.level + 1);
      const currentLevelExp = this.calculateTotalExpForLevel(progression.level);
      const experienceInCurrentLevel = progression.experience - currentLevelExp;
      const experienceNeededForCurrentLevel = nextLevelExp;
      
      const progressPercentage = experienceNeededForCurrentLevel > 0n 
        ? Number((experienceInCurrentLevel * 100n) / experienceNeededForCurrentLevel)
        : 100;

      const nextMilestone = PROGRESSION_CONSTANTS.MILESTONE_LEVELS
        .find(level => level > progression.level) || null;

      return {
        currentLevel: progression.level,
        currentPhase: progression.currentPhase.name,
        experienceToNextLevel: nextLevelExp - experienceInCurrentLevel,
        progressPercentage: Math.min(progressPercentage, 100),
        totalStatPointsEarned: progression.totalStatPoints,
        availableStatPoints: progression.availableStatPoints,
        titlesUnlocked: progression.titles,
        nextMilestone
      };
    } catch (error) {
      logger.error('Failed to get progression stats', {
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    }
  }

  /**
   * Clear character progression cache
   */
  private async clearCharacterCache(characterId: string): Promise<void> {
    try {
      await Promise.all([
        this.cacheManager.delete(`progression:${characterId  return;
}`),
        this.cacheManager.delete(`char:${characterId}:data`)
      ]);
    } catch (error) {
      logger.warn('Failed to clear character cache', {
        characterId,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
    }
  }

  /**
   * Get experience history for a character
   */
  async getExperienceHistory(
    characterId: string,
    limit: number = 50,
    offset: number = 0
  ) {
    return this.progressionRepo.getExperienceHistory(characterId, limit, offset);
  }

  /**
   * Get level up history for a character
   */
  async getLevelUpHistory(
    characterId: string,
    limit: number = 20,
    offset: number = 0
  ) {
    return this.progressionRepo.getLevelUpHistory(characterId, limit, offset);
  }

  /**
   * Calculate experience curve preview for level range
   */
  calculateExperienceCurve(startLevel: number, endLevel: number): Array<{
    level: number;
    expForLevel: string;
    totalExp: string;
    phase: string;
  }> {
    const curve = [];
    
    for (let level = startLevel; level <= endLevel; level++) {
      const expForLevel = this.calculateExpForLevel(level);
      const totalExp = this.calculateTotalExpForLevel(level);
      const phase = this.getProgressionPhase(level);
      
      curve.push({
        level,
        expForLevel: expForLevel.toString(),
        totalExp: totalExp.toString(),
        phase: phase.name
      });
    }
    
    return curve;
  }
}