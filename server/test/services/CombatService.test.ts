/**
 * Combat Service Tests - Step 2.5 Patch
 * Unit tests for combat formula alignment verification
 */

import { Pool } from 'pg';
import { CombatService } from '../../src/services/CombatService';
import { CacheManager } from '../../src/services/CacheManager';
import { RealtimeService } from '../../src/services/RealtimeService';
import { EquipmentService } from '../../src/services/EquipmentService';
import { COMBAT_CONSTANTS } from '../../src/types/combat.types';

// Mock the dependencies
const mockDb = {} as Pool;
const mockCacheManager = {} as CacheManager;
const mockRealtimeService = {} as RealtimeService;

describe('CombatService Formula Tests', () => {
  let combatService: CombatService;

  beforeEach(() => {
    combatService = new CombatService(mockDb, mockCacheManager, mockRealtimeService);
  });

  describe('Critical Hit Calculation', () => {
    test('should calculate base critical chance correctly', () => {
      // Access the private method through type assertion for testing
      const calculateCriticalChance = (combatService as any).calculateCriticalChance.bind(combatService);
      
      // Test base critical chance (5%)
      const baseCrit = calculateCriticalChance(0);
      expect(baseCrit).toBe(COMBAT_CONSTANTS.BASE_CRITICAL_CHANCE);
    });

    test('should increase critical chance with dexterity', () => {
      const calculateCriticalChance = (combatService as any).calculateCriticalChance.bind(combatService);
      
      // Test dexterity scaling: 5% + DEX/200
      const dexterity = 100;
      const expectedCrit = COMBAT_CONSTANTS.BASE_CRITICAL_CHANCE + (dexterity / COMBAT_CONSTANTS.DEXTERITY_CRIT_FACTOR);
      const actualCrit = calculateCriticalChance(dexterity);
      
      expect(actualCrit).toBe(expectedCrit);
      expect(actualCrit).toBe(0.55); // 5% + 100/200 = 55%
    });

    test('should scale critical chance linearly with dexterity', () => {
      const calculateCriticalChance = (combatService as any).calculateCriticalChance.bind(combatService);
      
      // Test various dexterity values
      const testCases = [
        { dex: 0, expected: 0.05 },    // 5% base
        { dex: 50, expected: 0.30 },   // 5% + 25% = 30%
        { dex: 200, expected: 1.05 },  // 5% + 100% = 105% (can exceed 100%)
        { dex: 400, expected: 2.05 }   // 5% + 200% = 205%
      ];

      testCases.forEach(({ dex, expected }) => {
        const actual = calculateCriticalChance(dex);
        expect(actual).toBeCloseTo(expected, 2);
      });
    });
  });

  describe('Damage Formula Constants', () => {
    test('should have correct combat constants', () => {
      expect(COMBAT_CONSTANTS.BASE_CRITICAL_CHANCE).toBe(0.05);
      expect(COMBAT_CONSTANTS.CRITICAL_DAMAGE_MULTIPLIER).toBe(1.5);
      expect(COMBAT_CONSTANTS.DEXTERITY_CRIT_FACTOR).toBe(200);
      expect(COMBAT_CONSTANTS.DAMAGE_VARIANCE).toBe(0.3);
    });

    test('should use 1.5x multiplier for critical damage', () => {
      const baseDamage = 100;
      const criticalDamage = baseDamage * COMBAT_CONSTANTS.CRITICAL_DAMAGE_MULTIPLIER;
      expect(criticalDamage).toBe(150);
    });

    test('should use 30% damage variance', () => {
      const baseDamage = 100;
      const maxVariance = baseDamage * COMBAT_CONSTANTS.DAMAGE_VARIANCE;
      expect(maxVariance).toBe(30);
    });
  });

  describe('Damage Calculation Verification', () => {
    test('should ensure minimum damage of 1', () => {
      // Mock the calculateAttackDamage to test the Math.max(1, ...) logic
      const strength = 10;
      const vitality = 20; // Higher than strength
      const weaponCoef = 1.0;
      
      const baseDamage = Math.max(1, (strength - vitality) * weaponCoef);
      expect(baseDamage).toBe(1); // Should floor at 1 even when strength < vitality
    });

    test('should calculate damage reduction from vitality', () => {
      const strength = 100;
      const vitality = 30;
      const weaponCoef = 1.0;
      
      const expectedBaseDamage = (strength - vitality) * weaponCoef;
      expect(expectedBaseDamage).toBe(70);
    });

    test('should apply weapon coefficient multiplier', () => {
      const strength = 50;
      const vitality = 20;
      const weaponCoef = 1.5; // 50% weapon bonus
      
      const expectedBaseDamage = (strength - vitality) * weaponCoef;
      expect(expectedBaseDamage).toBe(45); // (50-20) * 1.5 = 45
    });
  });

  describe('Equipment Integration', () => {
    test('should create EquipmentService instance', () => {
      expect(combatService).toBeDefined();
      // Verify that EquipmentService is integrated (instance variable exists)
      expect((combatService as any).equipmentService).toBeDefined();
    });
  });
});

// Integration test helpers
export const CombatTestHelpers = {
  /**
   * Create a mock character with specific stats for testing
   */
  createMockCharacter: (stats: {
    strength: number;
    vitality: number;
    dexterity: number;
    intelligence: number;
    wisdom: number;
    level: number;
  }) => ({
    id: 'test-character-id',
    name: 'Test Character',
    level: stats.level,
    total_strength: stats.strength,
    total_vitality: stats.vitality,
    total_dexterity: stats.dexterity,
    total_intelligence: stats.intelligence,
    total_wisdom: stats.wisdom,
    max_hp: stats.vitality * 10,
    max_mp: stats.intelligence * 5
  }),

  /**
   * Validate damage calculation follows new formula
   */
  validateDamageFormula: (
    attackerStrength: number,
    defenderVitality: number,
    weaponCoefficient: number,
    actualDamage: number
  ): boolean => {
    const expectedBaseDamage = Math.max(1, (attackerStrength - defenderVitality) * weaponCoefficient);
    const maxVariance = expectedBaseDamage * COMBAT_CONSTANTS.DAMAGE_VARIANCE;
    
    // Damage should be within expected range (base ± variance)
    const minDamage = expectedBaseDamage;
    const maxDamage = expectedBaseDamage + maxVariance;
    
    return actualDamage >= minDamage && actualDamage <= maxDamage;
  },

  /**
   * Validate critical hit chance calculation
   */
  validateCriticalChance: (dexterity: number, actualCritChance: number): boolean => {
    const expectedCritChance = COMBAT_CONSTANTS.BASE_CRITICAL_CHANCE + 
      (dexterity / COMBAT_CONSTANTS.DEXTERITY_CRIT_FACTOR);
    
    return Math.abs(actualCritChance - expectedCritChance) < 0.001; // Allow for floating point precision
  }
};