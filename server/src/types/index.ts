export interface Player {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  level: number;
  experience: number;
  gold: number;
  health: number;
  max_health: number;
  mana: number;
  max_mana: number;
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  location_x: number;
  location_y: number;
  location_z: number;
  map_id: string;
  guild_id?: string;
  is_active: boolean;
  is_banned: boolean;
  ban_reason?: string;
  ban_expires_at?: Date;
  created_at: Date;
  updated_at: Date;
  last_login: Date;
}

export interface GameSession {
  playerId: string;
  sessionToken: string;
  socketId?: string;
  isOnline: boolean;
  lastActivity: Date;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for refresh tokens
}

export interface RefreshTokenData {
  userId: string;
  username: string;
  tokenFamily: string;
  createdAt: Date;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface GameConfig {
  maxPlayersPerServer: number;
  gameName: string;
  gameVersion: string;
}

export interface DatabaseConnection {
  isConnected: boolean;
  lastError?: string;
}

export interface RedisConnection {
  isConnected: boolean;
  lastError?: string;
}