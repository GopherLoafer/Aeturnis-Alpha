import { Router } from 'express';
import { register, login, refreshToken, logout, logoutAll } from '@/controllers/authController';
import { authenticateToken } from '@/middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for refresh token endpoint (more lenient)
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Allow more refresh attempts
  message: {
    success: false,
    error: 'Too many refresh attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to registration and login
router.use(['/register', '/login'], authLimiter);
router.use('/refresh', refreshLimiter);

// Public authentication routes
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);

// Protected authentication routes
router.post('/logout', logout); // Can work with either access or refresh token
router.post('/logout-all', authenticateToken, logoutAll); // Requires valid access token

export default router;