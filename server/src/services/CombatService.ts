/**
 * Combat Service - Step 2.5 Implementation
 * Core turn-based combat engine with initiative, damage calculation, and state management
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { CacheManager } from './CacheManager';
import { RealtimeService } from './RealtimeService';
import { EquipmentService } from './EquipmentService';
import { AffinityService } from './AffinityService';
import { getErrorMessage } from '../utils/errorUtils';
  CombatSession,
  CombatParticipant,
  CombatAction,
  CombatActionRequest,
  CombatActionResult,
  CombatStats,
  CreateCombatSessionDto,
  CreateCombatParticipantDto,
  CombatType,
  CombatStatus,
  ParticipantStatus,
  ActionType,
  CombatValidation,
  CombatErrorCode,
  CombatStartEvent,
  CombatUpdateEvent,
  CombatEndEvent,
  CombatEndReason,
  CombatRewards,
  StatusEffect,
  StatusEffectType,
  COMBAT_CONSTANTS
} from '../types/combat.types';

export class CombatService {
  private db: Pool;
  private cacheManager: CacheManager;
  private realtimeService: RealtimeService;
  private equipmentService: EquipmentService;
  private affinityService: AffinityService;

  constructor(
    db: Pool,
    cacheManager: CacheManager,
    realtimeService: RealtimeService,
    affinityService: AffinityService
  ) {
    this.db = db;
    this.cacheManager = cacheManager;
    this.realtimeService = realtimeService;
    this.equipmentService = new EquipmentService(db);
    this.affinityService = affinityService;
  }

  /**
   * Start a new combat encounter
   */
  async startEncounter(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Validate participants are not already in combat
      for (const participant of sessionData.participants) {
        const existingCombat = await this.getActiveCombatForCharacter(participant.characterId);
        if (existingCombat) {
          throw new Error(`Character ${participant.characterId} is already in combat`);
        }
      }

      // Create combat session
      const sessionResult = await client.query(`
        INSERT INTO combat_sessions (
          session_type, status, initiator_id, target_id, zone_id,
          turn_order, current_turn, turn_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        sessionData.sessionType,
        'waiting',
        sessionData.initiatorId,
        sessionData.targetId,
        sessionData.zoneId,
        [],
        0,
        1;
      ]);

      const session: CombatSession = this.mapSessionRow(sessionResult.rows[0]);

      // Create participants and calculate initiative
      const participants: CombatParticipant[] = [];
      for (let i = 0; i < sessionData.participants.length; i++) {
        const participantData = sessionData.participants[i];
        const characterStats = await this.getCharacterCombatStats(participantData?.characterId);
        
        const initiative = this.calculateInitiative(characterStats.dexterity, characterStats.level);
        
        const participantResult = await client.query(`
          INSERT INTO combat_participants (
            session_id, character_id, participant_type, side, initiative, position,
            current_hp, max_hp, current_mp, max_mp, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `, [
          session.id,
          participantData?.characterId,
          participantData?.participantType,
          participantData?.side,
          initiative,
          participantData?.position || i,
          characterStats.hp,
          characterStats.hp,
          characterStats.mp,
          characterStats.mp,
          'alive';
        ]);

        participants.push(this.mapParticipantRow(participantResult.rows[0]));
      }

      // Determine turn order based on initiative
      const turnOrder = participants
        .sort((a, b) => b.initiative - a.initiative);
        .map(p => p.characterId);

      // Update session with turn order and activate
      await client.query(`
        UPDATE combat_sessions 
        SET turn_order = $1, status = $2, started_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [turnOrder, 'active', session.id]);

      session.turnOrder = turnOrder;
      session.status = 'active' as CombatStatus;
      session.startedAt = new Date();

      await client.query('COMMIT');

      // Clear cache and broadcast start
      await this.clearCombatCache(session.id);
      await this.broadcastCombatStart(session, participants);

      // Update character status to 'combat'
      for (const participant of participants) {
        await this.updateCharacterCombatStatus(participant.characterId, 'combat');
      }

      logger.info('Combat encounter started', {
        sessionId: session.id,
        sessionType: session.sessionType,
        participantCount: participants.length,
        turnOrder
      });

      return session;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to start combat encounter', {
        sessionData,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Perform a combat action
   */
  async performAction(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Validate action
      const validation = await this.validateAction(sessionId, actorId, actionRequest);
      if (!validation.canAct) {
        return {
          success: false,
          message: validation.errorMessage || 'Action not allowed',
          error: validation.errorCode};
      }

      const session = await this.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          message: 'Combat session not found',
          error: CombatErrorCode.COMBAT_NOT_FOUND};
      }

      // Calculate action results
      const actionResult = await this.calculateActionResult(
        sessionId,
        actorId,
        actionRequest;
      );

      // Process the action using stored procedure
      const actionId = await client.query(`;
        SELECT process_combat_action($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
      `, [
        sessionId,
        actorId,
        actionRequest.targetId,
        actionRequest.actionType,
        actionRequest.actionName,
        actionResult.damage || 0,
        actionResult.healing || 0,
        actionResult.mpCost || 0,
        actionResult.isCritical || false,
        actionResult.isBlocked || false,
        actionResult.isMissed || false,
        actionResult.statusEffectApplied,
        actionResult.description
      ]);

      // Get updated participants
      const participants = await this.getSessionParticipants(sessionId);

      // Check for combat end conditions
      const combatEndCheck = this.checkCombatEndConditions(participants);
      let combatEnded = false;
      let winner: string | undefined;

      if (combatEndCheck.ended) {
        combatEnded = true;
        winner = combatEndCheck.winner;
        
        await this.endEncounter(sessionId, winner, combatEndCheck.reason);
      } else {
        // Advance turn
        await this.advanceTurn(sessionId);
      }

      // Award affinity experience for the action
      if (actionResult.damage > 0 || actionResult.healing > 0) {
        try {
          await this.affinityService.awardCombatAffinityExp(
            actorId,
            actionRequest.actionName,
            actionResult.damage,
            actionResult.isCritical,
            sessionId
          );
        } catch (affinityError) {
          // Log error but don't fail combat
          logger.warn('Failed to award affinity experience', {
            sessionId,
            actorId,
            actionName: actionRequest.actionName,
            error: affinityError instanceof Error ? affinityError.message : 'Unknown error'
          });
        }
      }

      // Get next turn info
      const updatedSession = await this.getSession(sessionId);
      const nextTurn = combatEnded ? undefined : updatedSession?.turnOrder[updatedSession.currentTurn];

      await client.query('COMMIT');

      // Clear cache and broadcast update
      await this.clearCombatCache(sessionId);
      await this.broadcastCombatUpdate(sessionId, actionResult, participants, nextTurn || '');

      // If combat ended, broadcast end event
      if (combatEnded && winner) {
        const stats = await this.getCombatStatistics(sessionId);
        const rewards = await this.calculateRewards(sessionId, winner);
        await this.broadcastCombatEnd(sessionId, winner, combatEndCheck.reason, stats, rewards);
      }

      return {
        success: true,
        action: actionResult,
        message: actionResult.description,
        nextTurn,
        combatEnded,
        winner
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to perform combat action', {
        sessionId,
        actorId,
        actionRequest,
        error: error instanceof Error ? getErrorMessage(error) : error
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get combat session by ID
   */
  async getSession(req: Request, res: Response): Promise<void> {
    const cacheKey = `combat:session:${sessionId}`;
    const cached = await this.cacheManager.get<CombatSession>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT * FROM combat_sessions WHERE id = $1;
      `, [sessionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const session = this.mapSessionRow(result.rows[0]);
      await this.cacheManager.set(cacheKey, session, { ttl: 300 }); // 5 minute cache

      return session;
    } finally {
      client.release();
    }
  }

  /**
   * End combat encounter
   */
  async endEncounter(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Update session status
      await client.query(`
        UPDATE combat_sessions 
        SET status = $1, ended_at = CURRENT_TIMESTAMP, winner = $2
        WHERE id = $3
      `, ['ended', winner, sessionId]);

      // Update all participants to remove from combat
      const participants = await this.getSessionParticipants(sessionId);
      for (const participant of participants) {
        await this.updateCharacterCombatStatus(participant.characterId, 'idle');`
}

      // Award experience and rewards if there's a winner
      if (winner && reason === CombatEndReason.VICTORY) {
        await this.awardCombatRewards(sessionId, winner);
      }

      await client.query('COMMIT');
      await this.clearCombatCache(sessionId);

      logger.info('Combat encounter ended', {
        sessionId,
        winner,
        reason,
        participantCount: participants.length
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get session participants
   */
  async getSessionParticipants(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT * FROM combat_participants 
        WHERE session_id = $1 
        ORDER BY initiative DESC;
      `, [sessionId]);

      return result.rows.map(row => this.mapParticipantRow(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get combat statistics
   */
  async getCombatStatistics(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`;
        SELECT * FROM get_combat_statistics($1);
      `, [sessionId]);

      if (result.rows.length === 0) {
        throw new Error('Combat statistics not found');
      }

      const stats = result.rows[0];
      return {
        sessionId,
        totalDamage: parseInt(stats.total_damage),
        totalHealing: parseInt(stats.total_healing),
        totalActions: parseInt(stats.total_actions),
        criticalHits: parseInt(stats.critical_hits),
        blocks: parseInt(stats.blocks),
        misses: parseInt(stats.misses),
        statusEffectsApplied: parseInt(stats.status_effects_applied),
        turnsDuration: parseInt(stats.turns_duration),
        participantStats: stats.participant_stats
      };
    } finally {
      client.release();
    }
  }

  /**
   * Calculate initiative based on dexterity and level
   */
  private calculateInitiative(dexterity: number, level: number): number {
    const baseInitiative = dexterity * 2 + level;
    const randomBonus = Math.floor(Math.random() * 20) + 1; // 1d20
    return baseInitiative + randomBonus;
  }

  /**
   * Validate combat action
   */
  private async validateAction(req: Request, res: Response): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return {
        canAct: false,
        errorCode: CombatErrorCode.COMBAT_NOT_FOUND,
        errorMessage: 'Combat session not found'
      };
    }

    if (session.status !== 'active') {
      return {
        canAct: false,
        errorCode: CombatErrorCode.COMBAT_ENDED,
        errorMessage: 'Combat has ended'
      };
    }

    // Check if it's the actor's turn
    const currentActorId = session.turnOrder[session.currentTurn];
    if (currentActorId !== actorId) {
      return {
        canAct: false,
        errorCode: CombatErrorCode.NOT_YOUR_TURN,
        errorMessage: 'It is not your turn'
      };
    }

    // Get participant data
    const participants = await this.getSessionParticipants(sessionId);
    const actor = participants.find(p => p.characterId === actorId);
    
    if (!actor) {
      return {
        canAct: false,
        errorCode: CombatErrorCode.NOT_PARTICIPANT,
        errorMessage: 'You are not a participant in this combat'
      };
    }

    if (actor.status !== 'alive') {
      return {
        canAct: false,
        errorCode: CombatErrorCode.PARTICIPANT_DEAD,
        errorMessage: 'You cannot act while dead'
      };
    }

    // Check action cooldown
    const cooldownKey = actionRequest.actionType.toUpperCase() as keyof typeof COMBAT_CONSTANTS.ACTION_COOLDOWNS;
    const cooldownDuration = COMBAT_CONSTANTS.ACTION_COOLDOWNS[cooldownKey];
    
    if (actor.actionCooldowns[cooldownKey]) {
      const cooldownEnd = new Date(actor.actionCooldowns[cooldownKey]);
      const now = new Date();
      
      if (now < cooldownEnd) {
        const remainingMs = cooldownEnd.getTime() - now.getTime();
        return {
          canAct: false,
          errorCode: CombatErrorCode.ACTION_ON_COOLDOWN,
          errorMessage: 'Action is on cooldown',
          cooldownRemaining: Math.ceil(remainingMs / 1000);
        };
      }
    }

    // Check MP requirements for spells
    if (actionRequest.actionType === 'spell') {
      const mpCost = this.calculateMpCost(actionRequest.actionName);
      if (actor.currentMp < mpCost) {
        return {
          canAct: false,
          errorCode: CombatErrorCode.INSUFFICIENT_MP,
          errorMessage: 'Insufficient MP',
          requiredMp: mpCost
        };
      }
    }

    // Validate target if required
    if (actionRequest.targetId && actionRequest.actionType !== 'heal') {
      const target = participants.find(p => p.characterId === actionRequest.targetId);
      if (!target) {
        return {
          canAct: false,
          errorCode: CombatErrorCode.INVALID_TARGET,
          errorMessage: 'Invalid target'
        };
      }

      if (target.status === 'dead') {
        return {
          canAct: false,
          errorCode: CombatErrorCode.TARGET_DEAD,
          errorMessage: 'Target is dead'
        };
      }
    }

    return { canAct: true };
  }

  /**
   * Calculate action result with damage, healing, and effects
   */
  private async calculateActionResult(req: Request, res: Response): Promise<void> {
    const participants = await this.getSessionParticipants(sessionId);
    const actor = participants.find(p => p.characterId === actorId);
    const target = actionRequest.targetId ? ;
      participants.find(p => p.characterId === actionRequest.targetId) : null;

    if (!actor) {
      throw new Error('Actor not found');
    }

    const actorStats = await this.getCharacterCombatStats(actorId);
    let targetStats = null;
    if (target) {
      targetStats = await this.getCharacterCombatStats(target.characterId);
    }
    
    let damage = 0;
    let healing = 0;
    let mpCost = 0;
    let isCritical = false;
    let isBlocked = false;
    let isMissed = false;
    let statusEffect: string | undefined;
    let description = '';

    switch (actionRequest.actionType) {
      case 'attack':
        damage = await this.calculateAttackDamage(
          actorId, 
          actorStats.strength, 
          targetStats?.vitality || 0,
          actionRequest.actionName
        );
        isCritical = Math.random() < this.calculateCriticalChance(actorStats.dexterity);
        if (isCritical) damage *= COMBAT_CONSTANTS.CRITICAL_DAMAGE_MULTIPLIER;
        
        isMissed = Math.random() < COMBAT_CONSTANTS.MISS_CHANCE;
        if (isMissed) damage = 0;
        
        isBlocked = Math.random() < COMBAT_CONSTANTS.BLOCK_CHANCE;
        if (isBlocked) damage = Math.floor(damage  * 0.3);
        
        description = this.generateActionDescription('attack', actor, target || null, damage, isCritical, isBlocked, isMissed);
        break;

      case 'spell':
        mpCost = this.calculateMpCost(actionRequest.actionName);
        damage = await this.calculateSpellDamage(
          actorId,
          actorStats.intelligence, 
          actorStats.level, 
          actionRequest.actionName
        );
        isCritical = Math.random() < this.calculateCriticalChance(actorStats.dexterity) * 1.5; // Spells have higher crit chance
        if (isCritical) damage *= COMBAT_CONSTANTS.CRITICAL_DAMAGE_MULTIPLIER;
        
        statusEffect = this.determineStatusEffect(actionRequest.actionName);
        description = this.generateActionDescription('spell', actor, target || null, damage, isCritical, false, false, statusEffect);
        break;

      case 'heal':
        mpCost = this.calculateMpCost(actionRequest.actionName);
        healing = await this.calculateHealingAmount(
          actorId,
          actorStats.wisdom, 
          actorStats.level,
          actionRequest.actionName
        );
        description = this.generateActionDescription('heal', actor, target || null, 0, false, false, false, undefined, healing);
        break;

      case 'defend':
        // Defend reduces incoming damage next turn (handled in status effects)
        statusEffect = 'shield';
        description = `${actor.characterId} takes a defensive stance.`;
        break;

      case 'flee':
        // Flee has a chance to succeed
        const fleeSuccess = Math.random() < COMBAT_CONSTANTS.FLEE_CHANCE;
        description = fleeSuccess ? 
          `${actor.characterId} successfully flees from combat!` :
          `${actor.characterId} fails to flee!`;
        break;

      default:
        description = `${actor.characterId} performs ${actionRequest.actionName}.`;
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return {
      id: '', // Will be set by database
      sessionId,
      actorId,
      targetId: actionRequest.targetId,
      actionType: actionRequest.actionType,
      actionName: actionRequest.actionName,
      damage,
      healing,
      mpCost,
      isCritical,
      isBlocked,
      isMissed,
      statusEffectApplied: statusEffect,
      description,
      turnNumber: session.turnNumber,
      createdAt: new Date();
    };
  }

  /**
   * Helper methods for damage calculations
   */
  private async calculateAttackDamage(req: Request, res: Response): Promise<void> {
    const weaponCoef = await this.equipmentService.getWeaponCoefficient(actorId);
    
    // Get weapon affinity from action name mapping
    const weaponAffinity = this.getWeaponAffinityFromAction(actionName);
    let affinityBonus = 0;
    
    if (weaponAffinity) {
      try {
        affinityBonus = await this.affinityService.getAffinityBonus(actorId, weaponAffinity);
      } catch (error) {
        // Log error but continue without bonus
        logger.warn('Failed to get weapon affinity bonus', {
          actorId,
          weaponAffinity,
          error: error instanceof Error ? getErrorMessage(error) : 'Unknown error'
        });
      }
    }
    
    const baseDamage = Math.max(1, (strength  - targetVitality) * weaponCoef);
    
    // Apply affinity bonus (percentage increase)
    const affinityMultiplier = 1 + (affinityBonus / 100);
    const enhancedDamage = Math.floor(baseDamage  * affinityMultiplier);
    
    const variance = Math.floor(Math.random() * (enhancedDamage * COMBAT_CONSTANTS.DAMAGE_VARIANCE)) + 1;
    return enhancedDamage + variance;
  }

  /**
   * Get weapon affinity from action name
   */
  private getWeaponAffinityFromAction(actionName: string): string | null {
    const weaponMap: Record<string, string> = {
      'basic_attack': 'sword',
      'heavy_strike': 'sword',
      'quick_slash': 'dagger',
      'power_attack': 'axe',
      'precise_shot': 'bow',
      'staff_strike': 'staff',
      'crushing_blow': 'mace',
      'thrust': 'spear',
      'martial_arts': 'unarmed'
    };
    
    return weaponMap[actionName] || null;
  }

  /**
   * Get magic affinity from spell name
   */
  private getMagicAffinityFromSpell(spellName: string): string | null {
    const magicMap: Record<string, string> = {
      'fireball': 'fire',
      'heal': 'light',
      'lightning_bolt': 'lightning',
      'ice_shard': 'ice',
      'stone_armor': 'earth',
      'water_healing': 'water',
      'shadow_strike': 'shadow',
      'arcane_missile': 'arcane'
    };
    
    return magicMap[spellName] || null;
  }

  /**
   * Calculate critical hit chance based on dexterity
   */
  private calculateCriticalChance(dexterity: number): number {
    return COMBAT_CONSTANTS.BASE_CRITICAL_CHANCE + (dexterity / COMBAT_CONSTANTS.DEXTERITY_CRIT_FACTOR);
  }

  private async calculateSpellDamage(req: Request, res: Response): Promise<void> {
    const baseDamage = intelligence * 1.5 + level;
    const spellMultiplier = this.getSpellMultiplier(spellName);
    
    // Get magic affinity from spell name mapping
    const magicAffinity = this.getMagicAffinityFromSpell(spellName);
    let affinityBonus = 0;
    
    if (magicAffinity) {
      try {
        affinityBonus = await this.affinityService.getAffinityBonus(actorId, magicAffinity);
      } catch (error) {
        // Log error but continue without bonus
        logger.warn('Failed to get magic affinity bonus', {
          actorId,
          magicAffinity,
          error: error instanceof Error ? getErrorMessage(error) : 'Unknown error'
        });
      }
    }
    
    // Apply affinity bonus (percentage increase)
    const affinityMultiplier = 1 + (affinityBonus / 100);
    const enhancedBaseDamage = Math.floor(baseDamage  * affinityMultiplier);
    
    const variance = Math.floor(Math.random() * (enhancedBaseDamage * 0.2)) + 1;
    return Math.floor((enhancedBaseDamage + variance) * spellMultiplier);
  }

  private async calculateHealingAmount(req: Request, res: Response): Promise<void> {
    const baseHealing = wisdom * 1.2 + level;
    
    // Get magic affinity from spell name mapping
    const magicAffinity = this.getMagicAffinityFromSpell(spellName);
    let affinityBonus = 0;
    
    if (magicAffinity) {
      try {
        affinityBonus = await this.affinityService.getAffinityBonus(actorId, magicAffinity);
      } catch (error) {
        // Log error but continue without bonus
        logger.warn('Failed to get magic affinity bonus for healing', {
          actorId,
          magicAffinity,
          error: error instanceof Error ? getErrorMessage(error) : 'Unknown error'
        });
      }
    }
    
    // Apply affinity bonus (percentage increase)
    const affinityMultiplier = 1 + (affinityBonus / 100);
    const enhancedHealing = Math.floor(baseHealing  * affinityMultiplier);
    
    const variance = Math.floor(Math.random() * (enhancedHealing * 0.2)) + 1;
    return Math.floor(enhancedHealing + variance);
  }

  private calculateMpCost(actionName: string): number {
    const mpCosts: Record<string, number> = {
      'fireball': 15,
      'heal': 10,
      'lightning': 12,
      'shield': 8,
      'poison': 6,
      'greater_heal': 20
    };
    return mpCosts[actionName] || 5;
  }

  private getSpellMultiplier(spellName: string): number {
    const multipliers: Record<string, number> = {
      'fireball': 1.5,
      'lightning': 1.3,
      'poison': 0.8,
      'heal': 1.0,
      'shield': 0.5
    };
    return multipliers[spellName] || 1.0;
  }

  private determineStatusEffect(spellName: string): string | undefined {
    const effects: Record<string, string> = {
      'fireball': 'burn',
      'lightning': 'stun',
      'poison': 'poison',
      'freeze': 'freeze'
    };
    return effects[spellName];
  }

  private generateActionDescription(
    actionType: string,
    actor: CombatParticipant,
    target: CombatParticipant | null,
    damage: number,
    isCritical: boolean,
    isBlocked: boolean,
    isMissed: boolean,
    statusEffect?: string,
    healing?: number
  ): string {
    const actorName = actor.characterId; // In real implementation, get character name
    const targetName = target?.characterId || 'unknown';

    if (isMissed) {
      return `${actorName} misses their attack!`;
    }

    if (isBlocked) {
      return `${targetName} blocks ${actorName}'s attack! (${damage} damage)`;
    }

    if (isCritical && damage > 0) {
      return `${actorName} scores a critical hit on ${targetName} for ${damage} damage!`;
    }

    if (healing && healing > 0) {
      return `${actorName} heals ${targetName} for ${healing} HP.`;
    }

    if (damage > 0) {
      return `${actorName} attacks ${targetName} for ${damage} damage.`;
    }

    if (statusEffect) {
      return `${actorName} applies ${statusEffect} to ${targetName}.`;
    }

    return `${actorName} performs an action.`;
  }

  /**
   * Get character combat stats
   */
  private async getCharacterCombatStats(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT c.*, cv.* 
        FROM characters c
        JOIN character_stats_view cv ON cv.character_id = c.id
        WHERE c.id = $1 AND c.deleted_at IS NULL;
      `, [characterId]);

      if (result.rows.length === 0) {
        throw new Error('Character not found');
      }

      const character = result.rows[0];
      return {
        level: character.level,
        hp: character.max_hp,
        mp: character.max_mp,
        strength: character.total_strength,
        vitality: character.total_vitality,
        dexterity: character.total_dexterity,
        intelligence: character.total_intelligence,
        wisdom: character.total_wisdom
      };
    } finally {
      client.release();
    }
  }

  /**
   * Check if combat should end
   */
  private checkCombatEndConditions(participants: CombatParticipant[]): { 
    ended: boolean; 
    winner?: string; 
    reason: CombatEndReason;
  } {
    const aliveParticipants = participants.filter(p => p.status === 'alive');
    const sides = new Set(aliveParticipants.map(p => p.side));

    // Combat ends if only one side remains
    if (sides.size <= 1) {
      const winningSide = Array.from(sides)[0];
      const winner = aliveParticipants.find(p => p.side === winningSide)?.characterId;
      
      return {
        ended: true,
        winner,
        reason: CombatEndReason.VICTORY
      };
    }

    return {
      ended: false,
      reason: CombatEndReason.VICTORY
    };
  }

  /**
   * Advance to next turn
   */
  private async advanceTurn(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        UPDATE combat_sessions 
        SET current_turn = (current_turn + 1) % array_length(turn_order, 1),
            turn_number = CASE 
              WHEN (current_turn + 1) % array_length(turn_order, 1) = 0 
              THEN turn_number + 1 
              ELSE turn_number 
            END
        WHERE id = $1
      `, [sessionId]);`
} finally {
      client.release();
    }
  }

  /**
   * Get active combat for character
   */
  private async getActiveCombatForCharacter(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT cs.* FROM combat_sessions cs
        JOIN combat_participants cp ON cp.session_id = cs.id
        WHERE cp.character_id = $1 AND cs.status = 'active';
      `, [characterId]);

      return result.rows.length > 0 ? this.mapSessionRow(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  /**
   * Update character combat status
   */
  private async updateCharacterCombatStatus(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        UPDATE characters SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [status, characterId]);`
} finally {
      client.release();
    }
  }

  /**
   * Calculate and award combat rewards
   */
  private async awardCombatRewards(req: Request, res: Response): Promise<void> {
    // Basic experience and gold calculation
    const baseExperience = 100;
    const baseGold = 50;

    const client = await this.db.connect();
    try {
      await client.query(`
        UPDATE combat_sessions 
        SET experience = $1, gold = $2
        WHERE id = $3
      `, [baseExperience, baseGold, sessionId]);

      // Award to winner's character (integrate with progression system)
      // This would call the ProgressionService to award experience`
} finally {
      client.release();
    }
  }

  /**
   * Calculate combat rewards
   */
  private async calculateRewards(req: Request, res: Response): Promise<void> {
    return {
      experience: 100,
      gold: 50,
      items: [],
      titles: []
    };
  }

  /**
   * Real-time broadcasting methods
   */
  private async broadcastCombatStart(session: CombatSession, participants: CombatParticipant[]): Promise<void> { const event: CombatStartEvent = {
      sessionId: session.id,
      participants,
      turnOrder: session.turnOrder,
      currentTurn: session.turnOrder[session.currentTurn],
      message: 'Combat has begun!' }
};

    this.realtimeService.broadcastToCombat(session.id, 'combat:start', event);
  }

  private async broadcastCombatUpdate(
    sessionId: string,
    action: CombatAction,
    participants: CombatParticipant[],
    currentTurn: string
  ): Promise<void> { const session = await this.getSession(sessionId);
    if (!session) }
    const event: CombatUpdateEvent = {
      sessionId,
      action,
      updatedParticipants: participants,
      currentTurn,
      turnNumber: session.turnNumber,
      message: action.description
    };

    this.realtimeService.broadcastToCombat(sessionId, 'combat:update', event);
  }

  private async broadcastCombatEnd(req: Request, res: Response): Promise<void> {
    const event: CombatEndEvent = {
      sessionId,
      winner,
      reason,
      stats,
      rewards,
      message: `Combat ended! Winner: ${winner}`
    };

    this.realtimeService.broadcastToCombat(sessionId, 'combat:end', event);
  }

  /**
   * Clear combat-related cache
   */
  private async clearCombatCache(req: Request, res: Response): Promise<void> {
    await this.cacheManager.deletePattern(`combat:session:${sessionId}*`);
  }

  /**
   * Map database rows to typed objects
   */
  private mapSessionRow(row: any): CombatSession {
    return {
      id: row.id,
      sessionType: row.session_type,
      status: row.status,
      initiatorId: row.initiator_id,
      targetId: row.target_id,
      zoneId: row.zone_id,
      turnOrder: row.turn_order || [],
      currentTurn: row.current_turn || 0,
      turnNumber: row.turn_number || 1,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      winner: row.winner,
      experience: row.experience || 0,
      gold: row.gold || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapParticipantRow(row: any): CombatParticipant {
    return {
      id: row.id,
      sessionId: row.session_id,
      characterId: row.character_id,
      participantType: row.participant_type,
      side: row.side,
      initiative: row.initiative,
      position: row.position,
      currentHp: row.current_hp,
      maxHp: row.max_hp,
      currentMp: row.current_mp,
      maxMp: row.max_mp,
      status: row.status,
      statusEffects: row.status_effects || [],
      lastActionAt: row.last_action_at,
      actionCooldowns: row.action_cooldowns || {},
      damageTaken: row.damage_taken || 0,
      damageDealt: row.damage_dealt || 0,
      actionsUsed: row.actions_used || 0,
      joinedAt: row.joined_at,
      leftAt: row.left_at
    };
  }
}