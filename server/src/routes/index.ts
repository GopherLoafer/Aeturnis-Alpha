import { Router } from 'express';
import authRoutes from './auth';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'Aeturnis Online API',
      version: process.env.GAME_VERSION || '1.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString()
    }
  });
});

// Mount route modules
router.use('/auth', authRoutes);

export default router;