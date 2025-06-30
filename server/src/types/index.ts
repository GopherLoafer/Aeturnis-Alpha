// Core user authentication interface (matches users table)
export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  status: 'active' | 'inactive' | 'suspended' | 'banned';
  email_verified: boolean;
  email_verification_token?: string;
  email_verification_expires_at?: Date;
  password_reset_token?: string;
  password_reset_expires_at?: Date;
  failed_login_attempts: number;
  locked_until?: Date;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

// Player game data interface (will be separate table in future)
export interface Player {
  id: string;
  user_id: string;
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
  created_at: Date;
  updated_at: Date;
}

// User session interface (matches user_sessions table)
export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  refresh_token_hash: string;
  token_family: string;
  device_type?: string;
  device_name?: string;
  user_agent?: string;
  ip_address?: string;
  location_country?: string;
  location_city?: string;
  status: 'active' | 'expired' | 'revoked' | 'suspicious';
  is_trusted: boolean;
  last_activity: Date;
  expires_at: Date;
  login_method: string;
  is_suspicious: boolean;
  risk_score: number;
  created_at: Date;
  revoked_at?: Date;
  revoked_by?: string;
}

// Audit log interface (matches user_audit_log table)
export interface UserAuditLog {
  id: string;
  user_id?: string;
  session_id?: string;
  event_type: string;
  event_category: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  status: string;
  result_code?: string;
  message?: string;
  ip_address?: string;
  user_agent?: string;
  location_country?: string;
  location_city?: string;
  risk_score?: number;
  request_method?: string;
  request_path?: string;
  request_params?: any;
  response_status?: number;
  metadata?: any;
  tags?: string[];
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  is_sensitive: boolean;
  retention_policy: string;
  created_at: Date;
  processed_at?: Date;
  expires_at?: Date;
}

// Game session interface (for real-time gaming)
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