import { z } from 'zod';

// User database schema
export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  email_verified: boolean;
  email_verification_token?: string;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  failed_login_attempts: number;
  locked_until?: Date;
}

// Sanitized user (without sensitive data)
export interface SafeUser {
  id: number;
  email: string;
  username: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

// JWT token payloads
export interface AccessTokenPayload {
  userId: number;
  email: string;
  username: string;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  userId: number;
  type: 'refresh';
  iat: number;
  exp: number;
}

// Authentication responses
export interface AuthResponse {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

// Service result types
export type ServiceResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  details?: any;
};

export type AsyncServiceResult<T> = Promise<ServiceResult<T>>;

// Validation schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

// Utility functions
export const isValidEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

export const sanitizeUser = (user: User): SafeUser => {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    email_verified: user.email_verified,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login: user.last_login
  };
};