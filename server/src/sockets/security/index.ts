/**
 * Socket.io Security System
 * Input validation, anti-cheat measures, and security utilities
 */

import { SocketWithAuth } from '../middleware/auth';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export interface SecurityValidationResult {
  isValid: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  action?: 'warn' | 'disconnect' | 'ban';
}

export interface MovementValidation {
  position: { x: number; y: number; z?: number };
  previousPosition?: { x: number; y: number; z?: number };
  timestamp: number;
  maxSpeed?: number;
  allowedZones?: string[];
}

export interface ActionValidation {
  action: string;
  targetId?: string;
  parameters?: any;
  timestamp: number;
  characterId: string;
  userId: string;
}

export class SocketSecurityService {
  private suspiciousActivities: Map<string, number> = new Map();
  private lastPositions: Map<string, { x: number; y: number; z: number; timestamp: number }> = new Map();
  private actionCooldowns: Map<string, Map<string, number>> = new Map();

  // Movement validation constants
  private readonly MAX_MOVEMENT_SPEED = 10; // units per second
  private readonly MAX_TELEPORT_DISTANCE = 50; // units
  private readonly POSITION_VALIDATION_THRESHOLD = 0.1; // tolerance for floating point errors

  /**
   * Validate character movement for anti-cheat
   */
  public validateMovement(socket: SocketWithAuth, validation: MovementValidation): SecurityValidationResult {
    const { position, timestamp, maxSpeed = this.MAX_MOVEMENT_SPEED } = validation;
    const userId = socket.userId;

    try {
      // Check for valid coordinates
      if (!this.isValidPosition(position)) {
        return {
          isValid: false,
          reason: 'Invalid position coordinates',
          severity: 'medium',
          action: 'warn'
        };
      }

      const lastPosition = this.lastPositions.get(userId);
      
      if (lastPosition) {
        const timeDiff = (timestamp - lastPosition.timestamp) / 1000; // Convert to seconds
        const distance = this.calculateDistance(position, lastPosition);

        // Check for impossible speed
        if (timeDiff > 0) {
          const speed = distance / timeDiff;
          if (speed > maxSpeed) {
            this.incrementSuspiciousActivity(userId);
            return {
              isValid: false,
              reason: `Movement speed too high: ${speed.toFixed(2)} > ${maxSpeed}`,
              severity: 'high',
              action: 'disconnect'
            };
          }
        }

        // Check for teleportation
        if (distance > this.MAX_TELEPORT_DISTANCE && timeDiff < 1) {
          this.incrementSuspiciousActivity(userId);
          return {
            isValid: false,
            reason: `Teleportation detected: ${distance.toFixed(2)} units in ${timeDiff.toFixed(3)}s`,
            severity: 'critical',
            action: 'ban'
          };
        }
      }

      // Update last position
      this.lastPositions.set(userId, {
        x: position.x,
        y: position.y,
        z: position.z || 0,
        timestamp
      });

      return { isValid: true };
    } catch (error) {
      logger.error('Movement validation error', {
        userId,
        position,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      
      return {
        isValid: false,
        reason: 'Validation error',
        severity: 'medium',
        action: 'warn'
      };
    }
  }

  /**
   * Validate character actions for anti-cheat
   */
  public validateAction(socket: SocketWithAuth, validation: ActionValidation): SecurityValidationResult {
    const { action, timestamp, characterId, userId } = validation;

    try {
      // Check action cooldowns
      const userCooldowns = this.actionCooldowns.get(userId) || new Map();
      const lastActionTime = userCooldowns.get(action) || 0;
      const cooldownDuration = this.getActionCooldown(action);

      if (timestamp - lastActionTime < cooldownDuration) {
        this.incrementSuspiciousActivity(userId);
        return {
          isValid: false,
          reason: `Action on cooldown: ${action}`,
          severity: 'medium',
          action: 'warn'
        };
      }

      // Validate action parameters
      if (!this.isValidActionParameters(action, validation.parameters)) {
        return {
          isValid: false,
          reason: `Invalid action parameters for: ${action}`,
          severity: 'medium',
          action: 'warn'
        };
      }

      // Update cooldowns
      userCooldowns.set(action, timestamp);
      this.actionCooldowns.set(userId, userCooldowns);

      return { isValid: true };
    } catch (error) {
      logger.error('Action validation error', {
        userId,
        action,
        error: error instanceof Error ? getErrorMessage(error) : error,
      });
      
      return {
        isValid: false,
        reason: 'Validation error',
        severity: 'medium',
        action: 'warn'
      };
    }
  }

  /**
   * Sanitize chat message content
   */
  public sanitizeChatMessage(content: string): string {
    // Remove HTML tags
    let sanitized = content.replace(/<[^>]*>/g, '');
    
    // Remove potentially dangerous scripts
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    
    // Limit length
    const maxLength = 500;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
    }
    
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  }

  /**
   * Check if content contains profanity or inappropriate language
   */
  public containsProfanity(content: string): boolean {
    const profanityPatterns = [
      /\b(spam|hack|cheat|exploit)\b/gi,
      // Add more patterns as needed;
    ];

    return profanityPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Rate limit validation for events
   */
  public validateEventRate(socket: SocketWithAuth, eventType: string, maxEventsPerMinute: number): SecurityValidationResult {
    const userId = socket.userId;
    const currentTime = Date.now();
    const windowKey = `${userId}:${eventType}:${Math.floor(currentTime / 60000)}`;
    
    // This is a simplified rate limiting - in production, use Redis
    const eventCount = parseInt(socket.data?.eventCounts?.[windowKey] || '0');
    
    if (eventCount >= maxEventsPerMinute) {
      this.incrementSuspiciousActivity(userId);
      return {
        isValid: false,
        reason: `Rate limit exceeded for ${eventType}`,
        severity: 'high',
        action: 'disconnect'
      };
    }

    return { isValid: true };
  }

  /**
   * Get suspicious activity count for a user
   */
  public getSuspiciousActivityCount(userId: string): number {
    return this.suspiciousActivities.get(userId) || 0;
  }

  /**
   * Reset suspicious activity count
   */
  public resetSuspiciousActivity(userId: string): void {
    this.suspiciousActivities.delete(userId);
  }

  // Private helper methods

  private isValidPosition(position: { x: number; y: number; z?: number }): boolean {
    const { x, y, z = 0 } = position;
    
    // Check for NaN or Infinity
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }
    
    // Check for reasonable bounds (adjust based on your game world)
    const maxCoordinate = 10000;
    if (Math.abs(x) > maxCoordinate || Math.abs(y) > maxCoordinate || Math.abs(z) > maxCoordinate) {
      return false;
    }
    
    return true;
  }

  private calculateDistance(pos1: { x: number; y: number; z?: number }, pos2: { x: number; y: number; z?: number }): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = (pos1.z || 0) - (pos2.z || 0);
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private getActionCooldown(action: string): number {
    const cooldowns: Record<string, number> = {
      'attack': 1000,   // 1 second
      'cast_spell': 2000, // 2 seconds
      'use_item': 500,   // 0.5 seconds
      'chat': 100,       // 0.1 seconds
      'move': 50,        // 0.05 seconds
    };
    
    return cooldowns[action] || 1000; // Default 1 second cooldown
  }

  private isValidActionParameters(action: string, parameters: any): boolean {
    if (!parameters) {
      return true; // Some actions might not need parameters
    }
    
    // Validate based on action type
    switch (action) {
      case 'attack':
        return parameters.targetId && typeof parameters.targetId === 'string';
      case 'cast_spell':
        return parameters.spellId && typeof parameters.spellId === 'string';
      case 'use_item':
        return parameters.itemId && typeof parameters.itemId === 'string';
      default:
        return true; // Allow unknown actions with any parameters
    }
  }

  private incrementSuspiciousActivity(userId: string): void {
    const current = this.suspiciousActivities.get(userId) || 0;
    this.suspiciousActivities.set(userId, current + 1);
    
    logger.warn('Suspicious activity detected', {
      userId,
      count: current + 1,
    });
  }
}