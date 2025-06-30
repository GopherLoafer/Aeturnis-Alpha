/**
 * Socket.io Authentication Middleware
 * JWT verification and user attachment for socket connections
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import jwt from 'jsonwebtoken';
import { getRedis } from '../../config/database';
import { logger } from '../../utils/logger';
import { config } from '../../config/environment';
import { getErrorMessage } from '../utils/errorUtils';

export interface SocketWithAuth extends Socket {
  userId: string;
  characterId?: string;
  roles: string[];
  isAuthenticated: boolean;
}

interface TokenPayload {
  userId: string;
  roles: string[];
  characterId?: string;
  iat: number;
  exp: number;
}

interface AuthAttemptTracker {
  attempts: number;
  lastAttempt: number;
  blocked: boolean;
}

export async function authenticateSocket(
  socket: SocketWithAuth, 
  next: (err?: ExtendedError) => void
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Extract JWT from socket handshake
    const token = extractToken(socket);
    
    if (!token) {
      logger.warn('Socket authentication failed: No token provided', {
        socketId: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
      });
      
      return next(new Error('Authentication required'));
    }

    // Check rate limiting for failed attempts
    const rateLimitCheck = await checkRateLimit(socket);
    if (!rateLimitCheck.allowed) {
      logger.warn('Socket authentication blocked: Rate limit exceeded', {
        socketId: socket.id,
        ip: socket.handshake.address,
        attempts: rateLimitCheck.attempts,
        resetTime: rateLimitCheck.resetTime,
      });
      
      return next(new Error('Too many failed authentication attempts'));
    }

    // Verify JWT token
    const payload = await verifyToken(token);
    
    // Check if token is blacklisted
    const isBlacklisted = await checkTokenBlacklist(token);
    if (isBlacklisted) {
      await trackFailedAttempt(socket);
      
      logger.warn('Socket authentication failed: Token blacklisted', {
        socketId: socket.id,
        userId: payload.userId,
        ip: socket.handshake.address,
      });
      
      return next(new Error('Token has been revoked'));
    }

    // Attach user metadata to socket
    socket.userId = payload.userId;
    socket.characterId = payload.characterId;
    socket.roles = payload.roles || ['user'];
    socket.isAuthenticated = true;

    // Clear any previous failed attempts
    await clearFailedAttempts(socket);

    // Track successful authentication
    await trackSuccessfulAuth(socket, payload);

    const authTime = Date.now() - startTime;
    
    logger.info('Socket authenticated successfully', {
      socketId: socket.id,
      userId: payload.userId,
      characterId: payload.characterId,
      roles: payload.roles,
      authTime,
      ip: socket.handshake.address,
    });

    next();

  } catch (error) {
    await trackFailedAttempt(socket);
    
    const authTime = Date.now() - startTime;
    
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Socket authentication failed: Token expired', {
        socketId: socket.id,
        ip: socket.handshake.address,
        authTime,
      });
      
      return next(new Error('Token expired'));
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Socket authentication failed: Invalid token', {
        socketId: socket.id,
        ip: socket.handshake.address,
        error: getErrorMessage(error),
        authTime,
      });
      
      return next(new Error('Invalid token'));
    }

    logger.error('Socket authentication error', {
      socketId: socket.id,
      ip: socket.handshake.address,
      error: error instanceof Error ? getErrorMessage(error) : error,
      stack: error instanceof Error ? error.stack : undefined,
      authTime,
    });

    next(new Error('Authentication failed'));
  }
}

function extractToken(socket: Socket): string | null {
  // Check auth object first (recommended)
  if (socket.handshake.auth?.token) {
    return socket.handshake.auth.token;
  }

  // Check Authorization header
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check query parameter (fallback for older clients)
  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
}

async function verifyToken(token: string): Promise<TokenPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
        return;
      }

      if (!decoded || typeof decoded !== 'object') {
        reject(new Error('Invalid token payload'));
        return;
      }

      const payload = decoded as TokenPayload;
      
      // Validate required fields
      if (!payload.userId) {
        reject(new Error('Token missing userId'));
        return;
      }

      resolve(payload);
    });
  });
}

async function checkTokenBlacklist(token: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `blacklist:token:${token}`;
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Failed to check token blacklist', {
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    
    // Fail open - if Redis is down, allow the connection
    return false;
  }
}

async function checkRateLimit(socket: Socket): Promise<{
  allowed: boolean;
  attempts: number;
  resetTime?: number;
}> {
  try {
    const redis = getRedis();
    const ip = socket.handshake.address;
    const key = `auth_attempts:${ip}`;
    
    const current = await redis.get(key);
    const tracker: AuthAttemptTracker = current ? JSON.parse(current) : {
      attempts: 0,
      lastAttempt: 0,
      blocked: false,
    };

    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;

    // Reset if window has passed
    if (now - tracker.lastAttempt > windowMs) {
      tracker.attempts = 0;
      tracker.blocked = false;
    }

    if (tracker.attempts >= maxAttempts) {
      return {
        allowed: false,
        attempts: tracker.attempts,
        resetTime: tracker.lastAttempt + windowMs,
      };
    }

    return {
      allowed: true,
      attempts: tracker.attempts,
    };

  } catch (error) {
    logger.error('Failed to check auth rate limit', {
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
    
    // Fail open - if Redis is down, allow the connection
    return { allowed: true, attempts: 0 };
  }
}

async function trackFailedAttempt(socket: Socket): Promise<void> {
  try {
    const redis = getRedis();
    const ip = socket.handshake.address;
    const key = `auth_attempts:${ip}`;
    
    const current = await redis.get(key);
    const tracker: AuthAttemptTracker = current ? JSON.parse(current) : {
      attempts: 0,
      lastAttempt: 0,
      blocked: false,
    };

    tracker.attempts += 1;
    tracker.lastAttempt = Date.now();
    tracker.blocked = tracker.attempts >= 5;

    await redis.setex(key, 900, JSON.stringify(tracker)); // 15 minutes TTL

  } catch (error) {
    logger.error('Failed to track failed auth attempt', {
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
  }
}

async function clearFailedAttempts(socket: Socket): Promise<void> {
  try {
    const redis = getRedis();
    const ip = socket.handshake.address;
    const key = `auth_attempts:${ip}`;
    
    await redis.del(key);

  } catch (error) {
    logger.error('Failed to clear failed auth attempts', {
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
  }
}

async function trackSuccessfulAuth(socket: Socket, payload: TokenPayload): Promise<void> {
  try {
    const redis = getRedis();
    const sessionKey = `socket_session:${socket.id}`;
    
    const sessionData = {
      userId: payload.userId,
      characterId: payload.characterId,
      roles: payload.roles,
      connectedAt: Date.now(),
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
    };

    // Store session with TTL (1 hour)
    await redis.setex(sessionKey, 3600, JSON.stringify(sessionData));

    // Track user's active sockets
    const userSocketsKey = `user_sockets:${payload.userId}`;
    await redis.sadd(userSocketsKey, socket.id);
    await redis.expire(userSocketsKey, 3600);

  } catch (error) {
    logger.error('Failed to track successful auth', {
      error: error instanceof Error ? getErrorMessage(error) : error,
    });
  }
}

export function requireAuth(socket: SocketWithAuth): boolean {
  return socket.isAuthenticated && !!socket.userId;
}

export function requireRole(socket: SocketWithAuth, role: string): boolean {
  return requireAuth(socket) && socket.roles.includes(role);
}

export function requireCharacter(socket: SocketWithAuth): boolean {
  return requireAuth(socket) && !!socket.characterId;
}