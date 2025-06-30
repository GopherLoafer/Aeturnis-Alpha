/**
 * Affinity Service - Step 2.6
 * Service for weapon and magic affinity tracking with tier progression
 */

import { Pool } from 'pg';
import { CacheManager } from './CacheManager';
import { RealtimeService } from './RealtimeService';
import { SlidingWindowLimiter } from '../utils/slidingWindowLimiter';
import {
  Affinity,
  CharacterAffinity,
  AffinityResult,
  AwardAffinityExpDto,
  AffinityError,
  AFFINITY_ERRORS,
  AFFINITY_CONSTANTS,
  AFFINITY_TIERS,
  AffinityLevelUpEvent,
  AffinityExpGainEvent
} from '../types/affinity.types';
import winston from 'winston';
import { getErrorMessage } from '../utils/errorUtils';

export class AffinityService {
  private db: Pool;
  private cacheManager: CacheManager;
  private realtimeService: RealtimeService;
  private slidingWindowLimiter: SlidingWindowLimiter;
  private logger: winston.Logger;

  constructor(
    db: Pool,
    cacheManager: CacheManager,
    realtimeService: RealtimeService
  ) {
    this.db = db;
    this.cacheManager = cacheManager;
    this.realtimeService = realtimeService;
    this.slidingWindowLimiter = new SlidingWindowLimiter(cacheManager);
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json();
      ),
      defaultMeta: { service: 'AffinityService' }
    });
  }

  /**
   * Award affinity experience to a character
   */
  async awardAffinityExp(req: Request, res: Response): Promise<void> {
    // Max experience guard
    if (amount > BigInt(AFFINITY_CONSTANTS.MAX_EXP_AWARD)) {
      throw new AffinityError(
        `Experience amount ${amount} exceeds maximum allowed (${AFFINITY_CONSTANTS.MAX_EXP_AWARD})`,
        AFFINITY_ERRORS.INVALID_EXPERIENCE_AMOUNT,
        400
      );
    }

    // Sliding window rate limiting check
    const slidingWindowResult = await this.slidingWindowLimiter.checkLimit(
      `affinity:window:${characterId}`,
      {
        windowSize: AFFINITY_CONSTANTS.SLIDING_WINDOW_DURATION,
        maxRequests: AFFINITY_CONSTANTS.SLIDING_WINDOW_LIMIT
      };
    );

    if (!slidingWindowResult.allowed) {
      throw new AffinityError(
        `Experience award rate limited. ${slidingWindowResult.remaining} requests remaining. Reset at ${new Date(slidingWindowResult.resetTime).toISOString()}`,
        AFFINITY_ERRORS.RATE_LIMITED,
        429
      );
    }

    // Per-affinity cooldown check
    const rateLimitKey = `affinity:ratelimit:${characterId}:${affinityName}`;
    const isRateLimited = await this.cacheManager.get(rateLimitKey);
    
    if (isRateLimited) {
      throw new AffinityError(
        'Experience award rate limited. Please wait before awarding experience to this affinity again.',
        AFFINITY_ERRORS.RATE_LIMITED,
        429
      );
    }

    // Set per-affinity rate limit
    await this.cacheManager.set(rateLimitKey, 'true', { ttl: AFFINITY_CONSTANTS.EXP_AWARD_COOLDOWN / 1000 });

    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Get affinity by name
      const affinityResult = await client.query(
        'SELECT * FROM affinities WHERE name = $1',
        [affinityName];
      );

      if (affinityResult.rows.length === 0) {
        throw new AffinityError(
          `Affinity '${affinityName}' not found`,
          AFFINITY_ERRORS.AFFINITY_NOT_FOUND,
          404
        );
      }

      const affinity = affinityResult.rows[0];

      // Get or create character affinity
      let characterAffinityResult = await client.query(
        'SELECT * FROM character_affinities WHERE character_id = $1 AND affinity_id = $2',
        [characterId, affinity.id];
      );

      let characterAffinity: CharacterAffinity;
      let previousTier: number;

      if (characterAffinityResult.rows.length === 0) {
        // Create new character affinity record
        const insertResult = await client.query(`;
          INSERT INTO character_affinities (character_id, affinity_id, experience, tier);
          VALUES ($1, $2, $3, 1)
          RETURNING *
        `, [characterId, affinity.id, amount]);

        characterAffinity = insertResult.rows[0];
        previousTier = 1;
      } else {
        // Update existing character affinity
        characterAffinity = characterAffinityResult.rows[0];
        previousTier = characterAffinity.tier;

        const newExperience = BigInt(characterAffinity.experience) + amount;

        const updateResult = await client.query(`
          UPDATE character_affinities 
          SET experience = $1, last_updated = CURRENT_TIMESTAMP
          WHERE character_id = $2 AND affinity_id = $3
          RETURNING *;
        `, [newExperience.toString(), characterId, affinity.id]);

        characterAffinity = updateResult.rows[0];
      }

      // Calculate new tier and bonuses
      const newTier = this.calculateTierFromExperience(BigInt(characterAffinity.experience));
      const bonusPercentage = this.calculateAffinityBonus(newTier);
      const nextTierExp = this.calculateTierExperience(newTier + 1);
      const expToNextTier = nextTierExp - BigInt(characterAffinity.experience);

      const result: AffinityResult = {
        success: true,
        character_affinity: {
          ...characterAffinity,
          experience: BigInt(characterAffinity.experience),
          affinity_name: affinity.name,
          affinity_type: affinity.type,
          affinity_description: affinity.description,
          bonus_percentage: bonusPercentage,
          next_tier_experience: nextTierExp,
          experience_to_next_tier: expToNextTier
        },
        previous_tier: previousTier,
        new_tier: newTier,
        experience_awarded: amount,
        tier_up: newTier > previousTier,
        total_experience: BigInt(characterAffinity.experience),
        bonus_percentage: bonusPercentage,
        next_tier_experience: nextTierExp,
        experience_to_next_tier: expToNextTier
      };

      await client.query('COMMIT');

      // Granular cache invalidation - only invalidate specific affinity
      await this.cacheManager.delete(`affinity:${characterId}:${affinityName}`);

      // Real-time events
      if (result.tier_up) {
        await this.broadcastTierUp(characterId, affinity.name, affinity.type, previousTier, newTier, result);
      } else {
        await this.broadcastExpGain(characterId, affinity.name, amount, result, source);
      }

      this.logger.info('Affinity experience awarded', {
        characterId,
        affinityName,
        amount: amount.toString(),
        previousTier,
        newTier,
        tierUp: result.tier_up,
        source,
        sessionId
      });

      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all character affinities with progression data
   */
  async getCharacterAffinities(req: Request, res: Response): Promise<void> {
    const cacheKey = `character:affinities:${characterId}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached, (key, value) => {
        // Parse BigInt values
        if (key === 'experience' || key === 'next_tier_experience' || key === 'experience_to_next_tier') {
          return BigInt(value);
        }
        return value;
      });
    }

    const result = await this.db.query(`
      SELECT 
        ca.*,
        a.name as affinity_name,
        a.type as affinity_type,
        a.description as affinity_description,
        (ca.tier * $1) as bonus_percentage,
        calculate_tier_experience(ca.tier + 1) as next_tier_experience,
        (calculate_tier_experience(ca.tier + 1) - ca.experience) as experience_to_next_tier
      FROM character_affinities ca
      JOIN affinities a ON ca.affinity_id = a.id
      WHERE ca.character_id = $2
      ORDER BY a.type, a.name;
    `, [AFFINITY_CONSTANTS.BONUS_PER_TIER, characterId]);

    const affinities = result.rows.map(row => ({
      ...row,
      experience: BigInt(row.experience),
      next_tier_experience: BigInt(row.next_tier_experience),;
      experience_to_next_tier: BigInt(row.experience_to_next_tier);
    }));

    // Cache for 5 minutes
    await this.cacheManager.set(
      cacheKey, 
      JSON.stringify(affinities, (key, value) => {
        // Stringify BigInt values
        return typeof value === 'bigint' ? value.toString() : value;
      }), 
      300
    );

    return affinities;
  }

  /**
   * Get affinity bonus percentage for a specific affinity
   */
  async getAffinityBonus(req: Request, res: Response): Promise<void> {
    const cacheKey = `affinity:bonus:${characterId}:${affinityName}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return parseFloat(cached);
    }

    const result = await this.db.query(`
      SELECT ca.tier
      FROM character_affinities ca
      JOIN affinities a ON ca.affinity_id = a.id
      WHERE ca.character_id = $1 AND a.name = $2;
    `, [characterId, affinityName]);

    let bonus = 0;
    if (result.rows.length > 0) {
      bonus = this.calculateAffinityBonus(result.rows[0].tier);
    }

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, bonus.toString(), 300);

    return bonus;
  }

  /**
   * Get a single affinity by name
   */
  async getAffinityByName(req: Request, res: Response): Promise<void> {
    const cacheKey = `affinity:${affinityName}`;
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.db.query(
      'SELECT * FROM affinities WHERE name = $1',
      [affinityName];
    );

    if (result.rows.length === 0) {
      return null;
    }

    const affinity = result.rows[0];
    
    // Cache for 30 minutes (affinities rarely change)
    await this.cacheManager.set(cacheKey, JSON.stringify(affinity), 1800);

    return affinity;
  }

  /**
   * Get all available affinities
   */
  async getAllAffinities(req: Request, res: Response): Promise<void> {
    const cacheKey = 'affinities:all';
    const cached = await this.cacheManager.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.db.query(`
      SELECT * FROM affinities 
      ORDER BY type, name;
    `);

    const affinities = result.rows;
    
    // Cache for 30 minutes
    await this.cacheManager.set(cacheKey, JSON.stringify(affinities), 1800);

    return affinities;
  }

  /**
   * Award experience for a combat action
   */
  async awardCombatAffinityExp(req: Request, res: Response): Promise<void> {
    const results: AffinityResult[] = [];

    // Determine affinity type from action
    const weaponAffinity = AFFINITY_CONSTANTS.WEAPON_AFFINITY_MAP[actionName];
    const magicAffinity = AFFINITY_CONSTANTS.MAGIC_AFFINITY_MAP[actionName];

    let baseExp = BigInt(AFFINITY_CONSTANTS.COMBAT_BASE_EXP);
    
    // Add critical hit bonus
    if (isCritical) {
      baseExp += BigInt(AFFINITY_CONSTANTS.CRITICAL_HIT_BONUS);
    }

    // Scale experience by damage dealt (more damage = more experience)
    const damageMultiplier = Math.max(1, Math.floor(damage / 10));
    baseExp *= BigInt(damageMultiplier);

    // Award weapon affinity experience
    if (weaponAffinity) {
      try {
        const result = await this.awardAffinityExp(
          characterId,
          weaponAffinity,
          baseExp,
          'combat',
          sessionId;
        );
        results.push(result);
      } catch (error) {
        // Log error but don't fail the entire process
        this.logger.warn('Failed to award weapon affinity experience', {
          characterId,
          weaponAffinity,
          error: error instanceof Error ? getErrorMessage(error) : 'Unknown error'
        });
      }
    }

    // Award magic affinity experience
    if (magicAffinity) {
      let magicExp = BigInt(AFFINITY_CONSTANTS.SPELL_BASE_EXP);
      
      // Add healing bonus for healing spells
      if (actionName.includes('heal')) {
        magicExp += BigInt(AFFINITY_CONSTANTS.HEALING_BONUS);
      }

      try {
        const result = await this.awardAffinityExp(
          characterId,
          magicAffinity,
          magicExp,
          'combat',
          sessionId;
        );
        results.push(result);
      } catch (error) {
        this.logger.warn('Failed to award magic affinity experience', {
          characterId,
          magicAffinity,
          error: error instanceof Error ? getErrorMessage(error) : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Calculate affinity bonus percentage from tier
   */
  private calculateAffinityBonus(tier: number): number {
    return tier * AFFINITY_CONSTANTS.BONUS_PER_TIER;
  }

  /**
   * Calculate experience required for a specific tier
   */
  private calculateTierExperience(tier: number): bigint {
    if (tier <= 1) return BigInt(0);
    
    // Formula: 100 * (1.2^tier - 1.2) / (1.2 - 1)
    const base = AFFINITY_CONSTANTS.BASE_EXP_PER_TIER;
    const multiplier = AFFINITY_CONSTANTS.EXP_MULTIPLIER;
    
    const numerator = Math.pow(multiplier, tier) - multiplier;
    const denominator = multiplier - 1;
    
    return BigInt(Math.floor(base * numerator / denominator));
  }

  /**
   * Calculate tier from total experience
   */
  private calculateTierFromExperience(experience: bigint): number {
    for (let tier = 1; tier <= AFFINITY_CONSTANTS.MAX_TIER; tier++) {
      const requiredExp = this.calculateTierExperience(tier + 1);
      if (experience < requiredExp) {
        return tier;
      }
    }
    return AFFINITY_CONSTANTS.MAX_TIER;
  }

  /**
   * Broadcast tier up event
   */
  private async broadcastTierUp(req: Request, res: Response): Promise<void> {
    const event: AffinityLevelUpEvent = {
      character_id: characterId,
      affinity_name: affinityName,
      affinity_type: affinityType,
      previous_tier: previousTier,
      new_tier: newTier,
      tier_name: AFFINITY_TIERS[newTier as keyof typeof AFFINITY_TIERS],
      bonus_percentage: result.bonus_percentage,
      total_experience: result.total_experience,
      experience_to_next_tier: result.experience_to_next_tier,
      timestamp: new Date()`
};

    // Broadcast to character's socket rooms
    this.realtimeService.broadcastToUser(characterId, 'affinity:levelup', event);
    this.realtimeService.broadcastToCharacter(characterId, 'affinity:levelup', event);
  }

  /**
   * Broadcast experience gain event
   */
  private async broadcastExpGain(
    characterId: string,
    affinityName: string,
    experienceAwarded: bigint,
    result: AffinityResult,
    source: string
  ): Promise<void> { const event: AffinityExpGainEvent = {
      character_id: characterId,
      affinity_name: affinityName,
      experience_awarded: experienceAwarded,
      total_experience: result.total_experience,
      current_tier: result.new_tier,
      bonus_percentage: result.bonus_percentage,
      source,
      timestamp: new Date() }
};

    this.realtimeService.broadcastToUser(characterId, 'affinity:exp_gain', event);
  }

  /**
   * Invalidate affinity-related cache entries
   */
  private async invalidateAffinityCache(req: Request, res: Response): Promise<void> {
    const patterns = [
      `character:affinities:${characterId}`,
      `affinity:bonus:${characterId}:*`;
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // For wildcard patterns, we'd need to implement a scan operation
        // For now, just log that we should clear these
        this.logger.debug('Cache invalidation needed for pattern', { pattern });
      } else {
        await this.cacheManager.delete(pattern);
      }
    }
  }
}