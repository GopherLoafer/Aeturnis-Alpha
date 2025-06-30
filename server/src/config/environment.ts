/**
 * Environment Configuration System
 * Validates and manages environment variables with Joi schema validation
 */

import Joi from 'joi';
import dotenv from 'dotenv';
import path from 'path';
import { getErrorMessage } from '../utils/errorUtils';

// Load environment files in order of precedence
const loadEnvironmentFiles = (): void => {
  const envFiles = ['.env', '.env.local'];
  
  envFiles.forEach(file => {
    const envPath = path.resolve(process.cwd(), file);
    dotenv.config({ path: envPath, override: false });
  });
};

// Environment variable validation schema
const envSchema = Joi.object({
  // Application Configuration
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1024).max(65535).default(3000),
  HOST: Joi.string().hostname().default('0.0.0.0'),
  
  // Database Configuration
  DATABASE_URL: Joi.string().uri().required(),
  PGHOST: Joi.string().hostname().required(),
  PGPORT: Joi.number().integer().min(1).max(65535).required(),
  PGDATABASE: Joi.string().min(1).required(),
  PGUSER: Joi.string().min(1).required(),
  PGPASSWORD: Joi.string().min(1).required(),
  
  // Redis Configuration (optional)
  REDIS_URL: Joi.string().uri().optional(),
  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  
  // Security Configuration
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  API_KEY_SECRET: Joi.string().min(32).optional(),
  ENCRYPTION_KEY: Joi.string().length(64).optional(),
  
  // Rate Limiting
  RATE_LIMIT_GLOBAL: Joi.number().integer().min(1).default(100),
  RATE_LIMIT_WINDOW: Joi.number().integer().min(1).default(900000), // 15 minutes in ms
  RATE_LIMIT_AUTH: Joi.number().integer().min(1).default(5),
  RATE_LIMIT_API: Joi.number().integer().min(1).default(1000),
  
  // CORS Configuration
  CORS_ORIGIN: Joi.string().optional(),
  CORS_CREDENTIALS: Joi.boolean().default(true),
  
  // Application Settings
  REQUEST_SIZE_LIMIT: Joi.string().default('10mb'),
  COMPRESSION_THRESHOLD: Joi.number().integer().min(0).default(1024),
  
  // Logging Configuration
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  LOG_FILE: Joi.string().default('logs/application.log'),
  
  // Maintenance Mode
  MAINTENANCE_MODE: Joi.boolean().default(false),
  MAINTENANCE_BYPASS_KEY: Joi.string().optional(),
  
  // Application Version
  APP_VERSION: Joi.string().default('1.0.0'),
  
  // Feature Flags
  ENABLE_SWAGGER: Joi.boolean().default(true),
  ENABLE_METRICS: Joi.boolean().default(true),
  ENABLE_AUDIT_LOG: Joi.boolean().default(true),
}).unknown(true);

export interface EnvironmentConfig {
  // Application Configuration
  NODE_ENV: 'development' | 'staging' | 'production';
  PORT: number;
  HOST: string;
  
  // Database Configuration
  DATABASE_URL: string;
  PGHOST: string;
  PGPORT: number;
  PGDATABASE: string;
  PGUSER: string;
  PGPASSWORD: string;
  
  // Redis Configuration
  REDIS_URL?: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  
  // Security Configuration
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  API_KEY_SECRET?: string;
  ENCRYPTION_KEY?: string;
  
  // Rate Limiting
  RATE_LIMIT_GLOBAL: number;
  RATE_LIMIT_WINDOW: number;
  RATE_LIMIT_AUTH: number;
  RATE_LIMIT_API: number;
  
  // CORS Configuration
  CORS_ORIGIN?: string;
  CORS_CREDENTIALS: boolean;
  
  // Application Settings
  REQUEST_SIZE_LIMIT: string;
  COMPRESSION_THRESHOLD: number;
  
  // Logging Configuration
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
  LOG_FILE: string;
  
  // Maintenance Mode
  MAINTENANCE_MODE: boolean;
  MAINTENANCE_BYPASS_KEY?: string;
  
  // Application Version
  APP_VERSION: string;
  
  // Feature Flags
  ENABLE_SWAGGER: boolean;
  ENABLE_METRICS: boolean;
  ENABLE_AUDIT_LOG: boolean;
}

/**
 * Validate and return environment configuration
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  // Load environment files
  loadEnvironmentFiles();
  
  // Validate environment variables
  const { error, value } = envSchema.validate(process.env, {
    allowUnknown: true,
    stripUnknown: false,
  });
  
  if (error) {
    console.error('❌ Environment validation failed:');
    error.details.forEach(detail => {
      console.error(`   ${detail.message}`);
    });
    console.error('\n💡 Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }
  
  return value as EnvironmentConfig;
};

/**
 * Check if running in production environment
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === 'production';
};

/**
 * Check if running in development environment
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Check if running in staging environment
 */
export const isStaging = (): boolean => {
  return process.env.NODE_ENV === 'staging';
};

/**
 * Get CORS origins based on environment
 */
export const getCorsOrigins = (): string[] | string | boolean => {
  const config = getEnvironmentConfig();
  
  if (config.CORS_ORIGIN) {
    return config.CORS_ORIGIN.split(',').map(origin => origin.trim());
  }
  
  // Default CORS settings based on environment
  switch (config.NODE_ENV) {
    case 'production':
      return ['https://aeturnis.com', 'https://www.aeturnis.com'];
    case 'staging':
      return ['https://staging.aeturnis.com'];
    case 'development':
      return true; // Allow all origins in development
    default:
      return false;
  }
};

/**
 * Validate critical environment variables on startup
 */
export const validateCriticalEnvVars = (): void => {
  const config = getEnvironmentConfig();
  const criticalVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET'
  ];
  
  const missing = criticalVars.filter(varName => !config[varName as keyof EnvironmentConfig]);
  
  if (missing.length > 0) {
    console.error('❌ Critical environment variables missing:');
    missing.forEach(varName => {
      console.error(`   ${varName}`);
    });
    console.error('\n💡 Application cannot start without these variables.');
    process.exit(1);
  }
  
  console.log('✅ Environment configuration validated successfully');
};

// Export singleton config instance
export const config = getEnvironmentConfig();