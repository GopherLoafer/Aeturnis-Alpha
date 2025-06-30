import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { authenticate, authRateLimit } from '../middleware/auth';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from '../types/index';
import winston from 'winston';

const router = Router();
const authService = new AuthService();

// Helper function to validate request body
const validateRequest = (schema: any, data: any) => {
  try {
    return { success: true, data: schema.parse(data) };
  } catch (error) {
    return { success: false, error: error.errors || error.message };
  }
};

// Helper function to get client IP
const getClientIp = (req: Request): string => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
};

/**
 * POST /api/auth/register
 * User registration endpoint
 */
router.post('/register', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(registerSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid registration data',
        details: validation.error,
        requestId: req.requestId
      });
      return;
    }

    const { email, username, password } = validation.data;

    // Register user
    const result = await authService.register(email, username, password);

    if (!result.success) {
      res.status(400).json({
        error: result.error,
        message: 'Registration failed',
        requestId: req.requestId
      });
      return;
    }

    winston.info('User registration successful', {
      userId: result.data.id,
      email: result.data.email,
      requestId: req.requestId
    });

    res.status(201).json({
      message: 'Registration successful',
      user: result.data,
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Registration endpoint error:', {
      error: error,
      requestId: req.requestId,
      ip: getClientIp(req)
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Registration failed due to server error',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/login
 * User login endpoint
 */
router.post('/login', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(loginSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid login data',
        details: validation.error,
        requestId: req.requestId
      });
      return;
    }

    const { emailOrUsername, password } = validation.data;
    const clientIp = getClientIp(req);

    // Attempt login
    const result = await authService.login(emailOrUsername, password, clientIp);

    if (!result.success) {
      res.status(401).json({
        error: result.error,
        message: 'Login failed',
        requestId: req.requestId
      });
      return;
    }

    winston.info('User login successful', {
      userId: result.data.user.id,
      email: result.data.user.email,
      requestId: req.requestId
    });

    res.status(200).json({
      message: 'Login successful',
      ...result.data,
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Login endpoint error:', {
      error: error,
      requestId: req.requestId,
      ip: getClientIp(req)
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Login failed due to server error',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/refresh
 * Token refresh endpoint
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Refresh token is required',
        requestId: req.requestId
      });
      return;
    }

    // Refresh token
    const result = await authService.refreshToken(refreshToken);

    if (!result.success) {
      res.status(401).json({
        error: result.error,
        message: 'Token refresh failed',
        requestId: req.requestId
      });
      return;
    }

    winston.info('Token refresh successful', {
      requestId: req.requestId
    });

    res.status(200).json({
      message: 'Token refresh successful',
      ...result.data,
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Token refresh endpoint error:', {
      error: error,
      requestId: req.requestId,
      ip: getClientIp(req)
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Token refresh failed due to server error',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/logout
 * User logout endpoint
 */
router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to logout',
        requestId: req.requestId
      });
      return;
    }

    // Logout user
    const result = await authService.logout(req.user.id);

    if (!result.success) {
      res.status(500).json({
        error: result.error,
        message: 'Logout failed',
        requestId: req.requestId
      });
      return;
    }

    winston.info('User logout successful', {
      userId: req.user.id,
      email: req.user.email,
      requestId: req.requestId
    });

    res.status(200).json({
      message: 'Logout successful',
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Logout endpoint error:', {
      error: error,
      requestId: req.requestId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Logout failed due to server error',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Password reset request endpoint
 */
router.post('/forgot-password', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(forgotPasswordSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid email format',
        details: validation.error,
        requestId: req.requestId
      });
      return;
    }

    const { email } = validation.data;

    // Request password reset
    const result = await authService.forgotPassword(email);

    // Always return success to prevent email enumeration
    winston.info('Password reset requested', {
      email: email,
      success: result.success,
      requestId: req.requestId
    });

    res.status(200).json({
      message: 'If an account with that email exists, a password reset link has been sent',
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Forgot password endpoint error:', {
      error: error,
      requestId: req.requestId,
      ip: getClientIp(req)
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Password reset request failed due to server error',
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Password reset endpoint
 */
router.post('/reset-password', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body
    const validation = validateRequest(resetPasswordSchema, req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid reset data',
        details: validation.error,
        requestId: req.requestId
      });
      return;
    }

    const { token, newPassword } = validation.data;

    // Reset password
    const result = await authService.resetPassword(token, newPassword);

    if (!result.success) {
      res.status(400).json({
        error: result.error,
        message: 'Password reset failed',
        requestId: req.requestId
      });
      return;
    }

    winston.info('Password reset successful', {
      requestId: req.requestId
    });

    res.status(200).json({
      message: 'Password reset successful',
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Reset password endpoint error:', {
      error: error,
      requestId: req.requestId,
      ip: getClientIp(req)
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Password reset failed due to server error',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated',
        requestId: req.requestId
      });
      return;
    }

    winston.info('User profile accessed', {
      userId: req.user.id,
      email: req.user.email,
      requestId: req.requestId
    });

    res.status(200).json({
      message: 'User profile retrieved successfully',
      user: req.user,
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Get profile endpoint error:', {
      error: error,
      requestId: req.requestId,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user profile',
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/auth/status
 * Authentication status check
 */
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      authenticated: !!req.user,
      user: req.user || null,
      timestamp: new Date().toISOString(),
      requestId: req.requestId
    });

  } catch (error) {
    winston.error('Auth status endpoint error:', {
      error: error,
      requestId: req.requestId
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check authentication status',
      requestId: req.requestId
    });
  }
});

export default router;