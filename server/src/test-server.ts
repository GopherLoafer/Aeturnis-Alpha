/**
 * Simple Express API Test Server
 * Bypasses database initialization to test Express infrastructure
 */

import { config, validateCriticalEnvVars } from './config/environment';
import { logger } from './utils/logger';
import { createApp } from './app';
import { getErrorMessage } from '../utils/errorUtils';

const startTestServer = async (): Promise<void> => {
  try {
    // Validate environment
    validateCriticalEnvVars();

    console.log('🚀 Starting Express API Test Server...');

    // Create Express application
    const app = createApp();

    // Start HTTP server
    const server = app.listen(config.PORT, config.HOST, () => {
      console.log(`✅ Express API Test Server started successfully on http://${config.HOST}:${config.PORT}`);
      
      // Log available endpoints
      console.log('📡 Available endpoints:');
      console.log(`  - Health: http://${config.HOST}:${config.PORT}/health`);
      console.log(`  - Ready: http://${config.HOST}:${config.PORT}/health/ready`);
      console.log(`  - Live: http://${config.HOST}:${config.PORT}/health/live`);
      console.log(`  - Detailed: http://${config.HOST}:${config.PORT}/health/detailed`);
      if (config.ENABLE_SWAGGER) {
        console.log(`  - Docs: http://${config.HOST}:${config.PORT}/docs`);
        console.log(`  - API Spec: http://${config.HOST}:${config.PORT}/api-docs`);
      }
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      switch (error.code) {
        case 'EADDRINUSE':
          console.error(`❌ Port ${config.PORT} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n⏹️  Shutting down Express API Test Server...');
      server.close(() => {
        console.log('✅ Server shutdown complete');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start test server:', error);
    process.exit(1);
  }
};

startTestServer();