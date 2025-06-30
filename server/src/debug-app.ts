/**
 * Debug Express App - Incrementally test middleware components
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { json, urlencoded } from 'express';

import { config, getCorsOrigins } from './config/environment';
import { responseMiddleware } from './utils/response';
import { globalErrorHandler, handle404 } from './middleware/errorHandler';
import healthRoutes from './routes/health.routes';

console.log('🔧 Debug Express App - Testing components incrementally...');

const app = express();

// 1. Basic security middleware
console.log('1. Adding Helmet...');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

// 2. CORS
console.log('2. Adding CORS...');
app.use(cors({
  origin: getCorsOrigins(),
  credentials: config.CORS_CREDENTIALS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 3. Rate limiting
console.log('3. Adding Rate Limiting...');
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' },
  },
});
app.use(globalLimiter);

// 4. Body parsing
console.log('4. Adding Body Parsing...');
app.use(json({ limit: '10mb' }));
app.use(urlencoded({ extended: true, limit: '10mb' }));

// 5. Compression
console.log('5. Adding Compression...');
app.use(compression());

// 6. Response helpers
console.log('6. Adding Response Helpers...');
app.use(responseMiddleware);

// 7. Health routes
console.log('7. Adding Health Routes...');
app.use('/health', healthRoutes);

// 8. Basic route
console.log('8. Adding Basic Routes...');
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Aeturnis Online API',
    version: config.APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// 9. Error handling
console.log('9. Adding Error Handling...');
app.use(handle404);
app.use(globalErrorHandler);

// Start server  
console.log('🚀 Starting debug server...');
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`✅ Debug server running on http://${config.HOST}:${config.PORT}`);
  console.log('Available endpoints:');
  console.log(`  - Root: http://${config.HOST}:${config.PORT}/`);
  console.log(`  - Health: http://${config.HOST}:${config.PORT}/health`);
  console.log(`  - Ready: http://${config.HOST}:${config.PORT}/health/ready`);
});

server.on('error', (error: any) => {
  console.error('❌ Server startup error:', error.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down debug server...');
  server.close(() => {
    console.log('✅ Debug server closed');
    process.exit(0);
  });
});