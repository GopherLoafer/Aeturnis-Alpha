/**
 * Minimal Express Test to isolate path-to-regexp issue
 */

import express from 'express';
import { config } from './config/environment';

console.log('Starting minimal Express test...');

const app = express();

// Basic health endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is healthy',
    timestamp: new Date().toISOString()
  });
});

// Test server startup
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`✅ Minimal server running on http://${config.HOST}:${config.PORT}`);
  console.log('Available endpoints:');
  console.log(`  - http://${config.HOST}:${config.PORT}/health`);
});

server.on('error', (error: any) => {
  console.error('❌ Server error:', error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});