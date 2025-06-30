/**
 * API Integration Tests
 * Tests Express API endpoints with real HTTP requests
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { Application } from 'express';
import { getErrorMessage } from '../utils/errorUtils';

describe('API Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    app = createApp();
  });

  describe('Health Endpoints', () => {
    test('GET /health should return 200', async () => {
      const response = await request(app);
        .get('/health');
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api/unknown should return standardized error', async () => {
      const response = await request(app);
        .get('/api/unknown');
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
    });
  });
});