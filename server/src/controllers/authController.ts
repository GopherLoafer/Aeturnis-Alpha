import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, logger } from '@/database/connection';
import { APIResponse, JWTPayload } from '@/types';

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(100)
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { username, email, password } = validatedData;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM players WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Username or email already exists'
      } as APIResponse);
      return;
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new player
    const newPlayer = await pool.query(
      `INSERT INTO players (username, email, password_hash, level, experience, gold, health, mana, strength, agility, intelligence, location_x, location_y, location_z, map_id, created_at, updated_at, last_login)
       VALUES ($1, $2, $3, 1, 0, 100, 100, 50, 10, 10, 10, 0, 0, 0, 'starter_town', NOW(), NOW(), NOW())
       RETURNING id, username, email, level, created_at`,
      [username, email, hashedPassword]
    );

    const player = newPlayer.rows[0];

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        error: 'Server configuration error'
      } as APIResponse);
      return;
    }

    const tokenPayload: JWTPayload = {
      userId: player.id,
      username: player.username
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });

    logger.info(`New player registered: ${username}`);

    res.status(201).json({
      success: true,
      data: {
        player: {
          id: player.id,
          username: player.username,
          email: player.email,
          level: player.level,
          createdAt: player.created_at
        },
        token
      }
    } as APIResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid input data',
        data: error.errors
      } as APIResponse);
      return;
    }

    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as APIResponse);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { username, password } = validatedData;

    // Find user
    const userResult = await pool.query(
      'SELECT id, username, email, password_hash, level FROM players WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as APIResponse);
      return;
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as APIResponse);
      return;
    }

    // Update last login
    await pool.query(
      'UPDATE players SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        error: 'Server configuration error'
      } as APIResponse);
      return;
    }

    const tokenPayload: JWTPayload = {
      userId: user.id,
      username: user.username
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '24h' });

    logger.info(`Player logged in: ${username}`);

    res.json({
      success: true,
      data: {
        player: {
          id: user.id,
          username: user.username,
          email: user.email,
          level: user.level
        },
        token
      }
    } as APIResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid input data',
        data: error.errors
      } as APIResponse);
      return;
    }

    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as APIResponse);
  }
};