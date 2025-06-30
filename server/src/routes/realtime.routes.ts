/**
 * Realtime API Routes
 * Endpoints for monitoring and managing real-time communication
 */

import { Router, Request, Response } from 'express';
import { asyncWrapper } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/realtime/stats:
 *   get:
 *     summary: Get real-time communication statistics
 *     tags: [Realtime]
 *     responses:
 *       200:
 *         description: Realtime statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get('/stats', asyncWrapper(async (req: Request, res: Response) => {
  const realtimeService = (global as any).realtimeService;
  
  if (!realtimeService) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Realtime service not available',
      },
    });
  }

  const stats = {
    connectedClients: realtimeService.getConnectedCount(),
    rooms: realtimeService.getRoomsInfo(),
    metrics: realtimeService.getMetrics(),
    uptime: process.uptime(),
    timestamp: Date.now(),
  };

  res.success(stats);
}));

/**
 * @swagger
 * /api/realtime/announcement:
 *   post:
 *     summary: Send system announcement to all players
 *     tags: [Realtime]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *     responses:
 *       200:
 *         description: Announcement sent successfully
 */
router.post('/announcement', asyncWrapper(async (req: Request, res: Response) => {
  const { message, priority = 'medium' } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_MESSAGE',
        message: 'Message is required and must be a string',
      },
    });
  }

  const realtimeService = (global as any).realtimeService;
  
  if (!realtimeService) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Realtime service not available',
      },
    });
  }

  await realtimeService.sendAnnouncement(message, priority);

  logger.info('System announcement sent via API', {
    message,
    priority,
    sender: 'admin', // TODO: Get from authenticated user
  });

  res.success({
    message: 'Announcement sent successfully',
    timestamp: Date.now(),
  });
}));

/**
 * @swagger
 * /api/realtime/notify:
 *   post:
 *     summary: Send notification to specific users
 *     tags: [Realtime]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userIds
 *               - event
 *               - data
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               event:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Notification sent successfully
 */
router.post('/notify', asyncWrapper(async (req: Request, res: Response) => {
  const { userIds, event, data } = req.body;
  
  if (!Array.isArray(userIds) || !event || !data) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'userIds (array), event (string), and data (object) are required',
      },
    });
  }

  const realtimeService = (global as any).realtimeService;
  
  if (!realtimeService) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Realtime service not available',
      },
    });
  }

  await realtimeService.notifyUsers(userIds, event, data);

  logger.info('Bulk notification sent via API', {
    userCount: userIds.length,
    event,
    sender: 'admin', // TODO: Get from authenticated user
  });

  res.success({
    message: 'Notification sent successfully',
    userCount: userIds.length,
    timestamp: Date.now(),
  });
}));

export default router;