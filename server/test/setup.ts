/**
 * Jest Test Setup
 * Global test configuration and environment setup
 */

import { config } from 'dotenv';
import { logger } from '../src/utils/logger';

// Load test environment variables
config({ path: '.env.test' });

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Silence logs during tests
logger.transports.forEach(transport => {
  transport.silent = true;
});

// Global test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(async () => {
  jest.clearAllMocks();
});

// Global error handler for unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});