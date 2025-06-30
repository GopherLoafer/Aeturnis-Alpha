export interface Player {
  id: string;
  username: string;
  email: string;
  level: number;
  experience: number;
  gold: number;
  health: number;
  mana: number;
  strength: number;
  agility: number;
  intelligence: number;
  locationX: number;
  locationY: number;
  locationZ: number;
  mapId: string;
  guildId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date;
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
  iat?: number;
  exp?: number;
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