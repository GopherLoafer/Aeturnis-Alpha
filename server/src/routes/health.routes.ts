/**
 * Health Check Routes
 * Comprehensive health monitoring endpoints for the API
 */

import { Router, Request, Response } from 'express';
import { createHealthCheckResponse } from '../utils/response';
import { testDatabaseConnection } from '../config/database';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

const router = Router();

/**
 * Test database connectivity
 */
const checkDatabase = async (): Promise<{ status: 'up' | 'down' | 'degraded'; responseTime?: number; message?: string; lastChecked: string }> => {
  const startTime = Date.now();
  
  try {
    const isConnected = await testDatabaseConnection();
    const responseTime = Date.now() - startTime;
    
    return {
      status: isConnected ? 'up' : 'down',
      responseTime,
      message: isConnected ? 'Connected successfully' : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'down',
      responseTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
};

/**
 * Test Redis connectivity (if configured)
 */
const checkRedis = async (): Promise<{ status: 'up' | 'down' | 'degraded'; responseTime?: number; message?: string; lastChecked: string }> => {
  if (!config.REDIS_URL && !config.REDIS_HOST) {
    return {
      status: 'up',
      message: 'Redis not configured',
      lastChecked: new Date().toISOString(),
    };
  }

  const startTime = Date.now();
  
  try {
    // Import Redis client here to avoid issues if Redis is not configured
    const { testRedisConnection } = await import('../config/database');
    const isConnected = await testRedisConnection();
    const responseTime = Date.now() - startTime;
    
    return {
      status: isConnected ? 'up' : 'down',
      responseTime,
      message: isConnected ? 'Connected successfully' : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'down',
      responseTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    };
  }
};

/**
 * Get system memory information
 */
const getSystemMemory = () => {
  const used = process.memoryUsage();
  const total = used.heapTotal;
  const percentage = Math.round((used.heapUsed / total) * 100);
  
  return {
    used: used.heapUsed,
    total,
    percentage,
  };
};

/**
 * Get system CPU information (basic)
 */
const getSystemCPU = () => {
  const cpus = require('os').cpus();
  
  // Calculate average CPU usage (simplified)
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach((cpu: any) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const usage = Math.round(100 - (totalIdle / totalTick) * 100);
  
  return {
    usage: Math.max(0, Math.min(100, usage)), // Ensure 0-100 range
  };
};

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const [database, redis] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

    const services = {
      database,
      redis,
    };

    const system = {
      memory: getSystemMemory(),
      cpu: getSystemCPU(),
    };

    const healthResponse = createHealthCheckResponse(services, system);

    // Set appropriate status code based on health
    const statusCode = healthResponse.status === 'healthy' ? 200 
      : healthResponse.status === 'degraded' ? 207 
      : 503;

    res.status(statusCode).json(healthResponse);
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.APP_VERSION,
      error: 'Health check failed',
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe - checks if the service is ready to serve traffic
 */
router.get('/health/ready', async (req: Request, res: Response) => {
  try {
    const database = await checkDatabase();
    
    if (database.status === 'up') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        services: {
          database,
        },
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not available',
        services: {
          database,
        },
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /health/live
 * Liveness probe - checks if the service is alive
 */
router.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: config.APP_VERSION,
    pid: process.pid,
  });
});

/**
 * GET /health/detailed
 * Detailed health information for monitoring systems
 */
router.get('/health/detailed', async (req: Request, res: Response) => {
  try {
    const [database, redis] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

    const services = {
      database,
      redis,
    };

    const system = {
      memory: getSystemMemory(),
      cpu: getSystemCPU(),
    };

    const processInfo = {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    };

    const healthResponse = {
      ...createHealthCheckResponse(services, system),
      process: processInfo,
      environment: {
        nodeEnv: config.NODE_ENV,
        version: config.APP_VERSION,
      },
    };

    const statusCode = healthResponse.status === 'healthy' ? 200 
      : healthResponse.status === 'degraded' ? 207 
      : 503;

    res.status(statusCode).json(healthResponse);
  } catch (error) {
    logger.error('Detailed health check failed', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
    });
  }
});

/**
 * GET /health/database
 * Database-specific health check
 */
router.get('/health/database', async (req: Request, res: Response) => {
  try {
    const database = await checkDatabase();
    
    res.status(database.status === 'up' ? 200 : 503).json({
      service: 'database',
      ...database,
    });
  } catch (error) {
    res.status(503).json({
      service: 'database',
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/redis
 * Redis-specific health check
 */
router.get('/health/redis', async (req: Request, res: Response) => {
  try {
    const redis = await checkRedis();
    
    res.status(redis.status === 'up' ? 200 : 503).json({
      service: 'redis',
      ...redis,
    });
  } catch (error) {
    res.status(503).json({
      service: 'redis',
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString(),
    });
  }
});

/**
 * GET /health/metrics
 * Basic metrics endpoint for monitoring
 */
router.get('/health/metrics', (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    process: {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  res.status(200).json(metrics);
});

export default router;