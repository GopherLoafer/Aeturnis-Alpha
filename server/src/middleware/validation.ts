/**
 * Request Validation System
 * Comprehensive input validation and sanitization using express-validator
 */

import { body, param, query, header, validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errorHandler';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * Common validation rules
 */
export const ValidationRules = {
  // User-related validations
  username: () => 
    body('username')
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
      .trim()
      .escape(),

  email: () =>
    body('email')
      .isEmail()
      .withMessage('Must be a valid email address')
      .normalizeEmail()
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters')
      .trim(),

  password: () =>
    body('password')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),

  confirmPassword: () =>
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password');
        }
        return true;
      }),

  // ID validations
  id: (field = 'id') =>
    param(field)
      .isInt({ min: 1 })
      .withMessage(`${field} must be a positive integer`)
      .toInt(),

  uuid: (field = 'id') =>
    param(field)
      .isUUID()
      .withMessage(`${field} must be a valid UUID`),

  // Pagination validations
  page: () =>
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),

  limit: () =>
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),

  // Game-specific validations
  characterName: () =>
    body('characterName')
      .isLength({ min: 2, max: 50 })
      .withMessage('Character name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z0-9\s'.-]+$/)
      .withMessage('Character name contains invalid characters')
      .trim()
      .escape(),

  level: () =>
    body('level')
      .isInt({ min: 1, max: 100 })
      .withMessage('Level must be between 1 and 100')
      .toInt(),

  coordinates: () => [
    body('x')
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('X coordinate must be between -1000 and 1000')
      .toFloat(),
    body('y')
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('Y coordinate must be between -1000 and 1000')
      .toFloat(),
    body('z')
      .optional()
      .isFloat({ min: -1000, max: 1000 })
      .withMessage('Z coordinate must be between -1000 and 1000')
      .toFloat(),
  ],

  // API Key validation
  apiKey: () =>
    header('x-api-key')
      .isLength({ min: 32, max: 128 })
      .withMessage('API key must be between 32 and 128 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('API key contains invalid characters'),

  // Content validations
  title: () =>
    body('title')
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters')
      .trim()
      .escape(),

  description: () =>
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
      .trim()
      .escape(),

  // Date validations
  dateRange: () => [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date')
      .toDate(),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
      .toDate()
      .custom((value, { req }) => {
        if (req.query?.startDate && value < req.query.startDate) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
  ],

  // File upload validations
  imageFile: () =>
    body('imageFile')
      .custom((value, { req }) => {
        if (!req.file) {
          throw new Error('Image file is required');
        }
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(req.file.mimetype)) {
          throw new Error('File must be a valid image (JPEG, PNG, or GIF)');
        }
        
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (req.file.size > maxSize) {
          throw new Error('File size must be less than 5MB');
        }
        
        return true;
      }),
};

/**
 * Game-specific validation chains
 */
export const GameValidationChains = {
  createCharacter: [
    ValidationRules.characterName(),
    body('class')
      .isIn(['warrior', 'mage', 'archer', 'rogue'])
      .withMessage('Character class must be warrior, mage, archer, or rogue'),
    body('race')
      .isIn(['human', 'elf', 'dwarf', 'orc'])
      .withMessage('Character race must be human, elf, dwarf, or orc'),
    body('stats')
      .isObject()
      .withMessage('Stats must be an object'),
    body('stats.strength')
      .isInt({ min: 1, max: 20 })
      .withMessage('Strength must be between 1 and 20')
      .toInt(),
    body('stats.dexterity')
      .isInt({ min: 1, max: 20 })
      .withMessage('Dexterity must be between 1 and 20')
      .toInt(),
    body('stats.intelligence')
      .isInt({ min: 1, max: 20 })
      .withMessage('Intelligence must be between 1 and 20')
      .toInt(),
    body('stats.constitution')
      .isInt({ min: 1, max: 20 })
      .withMessage('Constitution must be between 1 and 20')
      .toInt(),
  ],

  updatePosition: [
    ...ValidationRules.coordinates(),
    body('mapId')
      .isInt({ min: 1 })
      .withMessage('Map ID must be a positive integer')
      .toInt(),
    body('timestamp')
      .isISO8601()
      .withMessage('Timestamp must be a valid ISO 8601 date')
      .toDate(),
  ],

  sendMessage: [
    body('message')
      .isLength({ min: 1, max: 500 })
      .withMessage('Message must be between 1 and 500 characters')
      .trim()
      .escape(),
    body('channel')
      .isIn(['global', 'guild', 'party', 'whisper'])
      .withMessage('Channel must be global, guild, party, or whisper'),
    body('targetUserId')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Target user ID must be a positive integer')
      .toInt(),
  ],
};

/**
 * Authentication validation chains
 */
export const AuthValidationChains = {
  register: [
    ValidationRules.username(),
    ValidationRules.email(),
    ValidationRules.password(),
    ValidationRules.confirmPassword(),
    body('acceptTerms')
      .isBoolean()
      .withMessage('Terms acceptance must be a boolean')
      .custom((value) => {
        if (!value) {
          throw new Error('You must accept the terms and conditions');
        }
        return true;
      }),
  ],

  login: [
    body('usernameOrEmail')
      .isLength({ min: 1 })
      .withMessage('Username or email is required')
      .trim(),
    body('password')
      .isLength({ min: 1 })
      .withMessage('Password is required'),
    body('rememberMe')
      .optional()
      .isBoolean()
      .withMessage('Remember me must be a boolean'),
  ],

  forgotPassword: [
    ValidationRules.email(),
  ],

  resetPassword: [
    body('token')
      .isLength({ min: 1 })
      .withMessage('Reset token is required')
      .trim(),
    ValidationRules.password(),
    ValidationRules.confirmPassword(),
  ],

  changePassword: [
    body('currentPassword')
      .isLength({ min: 1 })
      .withMessage('Current password is required'),
    ValidationRules.password(),
    ValidationRules.confirmPassword(),
  ],
};

/**
 * Custom validators for game-specific rules
 */
export const CustomValidators = {
  isValidCharacterName: (name: string): boolean => {
    // Check for profanity, reserved names, etc.
    const reservedNames = ['admin', 'moderator', 'system', 'null', 'undefined'];
    const profanityWords = ['damn', 'hell']; // In real app, use a comprehensive list
    
    const lowerName = name.toLowerCase();
    return !reservedNames.includes(lowerName) && 
           !profanityWords.some(word => lowerName.includes(word));
  },

  isValidStatDistribution: (stats: any): boolean => {
    if (!stats || typeof stats !== 'object') return false;
    
    const required = ['strength', 'dexterity', 'intelligence', 'constitution'];
    const total = required.reduce((sum, stat) => sum + (stats[stat] || 0), 0);
    
    // Total stat points should equal specific value (e.g., 30 for starting characters)
    return total === 30;
  },

  isValidCoordinates: (x: number, y: number, mapId: number): boolean => {
    // In a real game, you'd check against actual map boundaries
    const mapBoundaries: { [key: number]: { minX: number, maxX: number, minY: number, maxY: number } } = {
      1: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
      2: { minX: -200, maxX: 200, minY: -200, maxY: 200 },
    };
    
    const boundaries = mapBoundaries[mapId];
    if (!boundaries) return false;
    
    return x >= boundaries.minX && x <= boundaries.maxX &&
           y >= boundaries.minY && y <= boundaries.maxY;
  },
};

/**
 * Middleware to handle validation results
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const requestId = req.headers['x-request-id'] as string;
    const formattedErrors = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : error.type,
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
    }));
    
    const validationError = new ValidationError(
      'Validation failed',
      formattedErrors,
      requestId
    );
    
    return next(validationError);
  }
  
  next();
};

/**
 * Create validation middleware chain
 */
export const validate = (validations: ValidationChain[]) => {
  return [
    ...validations,
    handleValidationErrors,
  ];
};

/**
 * Sanitize request body recursively
 */
export const sanitizeRequestBody = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
};

/**
 * Recursively sanitize object properties
 */
const sanitizeObject = (obj: any): any => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove null bytes and control characters
      sanitized[key] = value.replace(/\0/g, '').replace(/[\x00-\x1F\x7F]/g, '');
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Rate limit validation
 */
export const validateRateLimit = (
  maxRequests: number,
  windowMs: number,
  message?: string
) => {
  const requests = new Map<string, number[]>();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip + (req.user ? `:${(req as any).user.id}` : '');
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key)!;
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= maxRequests) {
      const requestId = req.headers['x-request-id'] as string;
      const error = new ValidationError(
        message || 'Too many requests',
        { retryAfter: Math.ceil(windowMs / 1000) },
        requestId
      );
      return next(error);
    }
    
    validRequests.push(now);
    requests.set(key, validRequests);
    
    next();
  };
};

/**
 * Content type validation middleware
 */
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');
    
    if (req.method !== 'GET' && req.method !== 'DELETE' && !contentType) {
      const requestId = req.headers['x-request-id'] as string;
      const error = new ValidationError(
        'Content-Type header is required',
        undefined,
        requestId
      );
      return next(error);
    }
    
    if (contentType && !allowedTypes.some(type => contentType.includes(type))) {
      const requestId = req.headers['x-request-id'] as string;
      const error = new ValidationError(
        `Content-Type must be one of: ${allowedTypes.join(', ')}`,
        { received: contentType, allowed: allowedTypes },
        requestId
      );
      return next(error);
    }
    
    next();
  };
};

export default {
  ValidationRules,
  GameValidationChains,
  AuthValidationChains,
  CustomValidators,
  validate,
  handleValidationErrors,
  sanitizeRequestBody,
  validateRateLimit,
  validateContentType,
};