import { ZodSchema, ZodError } from 'zod';
import { getErrorMessage } from '../utils/errorUtils';

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: any;
}

// Generic validation function
export const validateRequest = <T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> => {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof ZodError) {
      return { 
        success: false, 
        error: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      };
    }
    return { success: false, error: error instanceof Error ? getErrorMessage(error) : 'Validation failed' };
  }
};

// Password strength checker
export const checkPasswordStrength = (password: string): { score: number; feedback: string[] } => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters long');

  if (password.length >= 12) score += 1;
  else if (password.length >= 8) feedback.push('Consider using a longer password for better security');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Add numbers');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Add special characters (!@#$%^&* etc.)');

  return { score, feedback };
};

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Username validation
export const isValidUsername = (username: string): boolean => {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

// Sanitize string input
export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

// Rate limiting key generator
export const generateRateLimitKey = (prefix: string, identifier: string): string => {
  return `${prefix}:${identifier}`;
};