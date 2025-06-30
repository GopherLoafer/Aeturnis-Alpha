const { register } = require('tsx/esm');
require('dotenv').config();

// Set JWT_SECRET if not provided
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'aeturnis-online-super-secure-jwt-secret-key-2025-production-ready';
}

// Register TypeScript loader and import server
register().then(() => {
  require('./server/src/server.ts');
}).catch(console.error);