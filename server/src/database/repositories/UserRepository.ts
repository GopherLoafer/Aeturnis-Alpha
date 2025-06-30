import BaseRepository, { AuditInfo } from '../BaseRepository';
import { isValidEmail, isValidUsername } from '../../utils/validation';

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  email_verified: boolean;
  email_verification_token?: string;
  status: 'active' | 'suspended' | 'banned';
  role: 'user' | 'moderator' | 'admin';
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  metadata: Record<string, any>;
}

export interface CreateUser {
  email: string;
  username: string;
  password_hash: string;
  email_verification_token?: string;
  role?: 'user' | 'moderator' | 'admin';
  metadata?: Record<string, any>;
}

export interface UpdateUser {
  email?: string;
  username?: string;
  password_hash?: string;
  email_verified?: boolean;
  email_verification_token?: string;
  status?: 'active' | 'suspended' | 'banned';
  role?: 'user' | 'moderator' | 'admin';
  last_login?: Date;
  metadata?: Record<string, any>;
}

export class UserRepository extends BaseRepository<User, CreateUser, UpdateUser> {
  constructor() {
    super('users', 'id', true);
  }

  protected async validateCreate(data: CreateUser): Promise<void> {
    if (!isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    if (!isValidUsername(data.username)) {
      throw new Error('Invalid username format');
    }

    // Check for existing user
    const existingUser = await this.queries.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
      [data.email, data.username]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('Email or username already exists');
    }
  }

  protected async validateUpdate(data: UpdateUser): Promise<void> {
    if (data.email && !isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    if (data.username && !isValidUsername(data.username)) {
      throw new Error('Invalid username format');
    }
  }

  protected sanitizeOutput(data: any): User {
    // Remove sensitive data from output
    const { password_hash, ...sanitized } = data;
    return {
      ...sanitized,
      password_hash: '[REDACTED]' // Never expose password hash
    };
  }

  // Find user by email or username
  async findByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
    const result = await this.queries.query<User>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1',
      [emailOrUsername]
    );
    return result.rows[0] ? this.sanitizeOutput(result.rows[0]) : null;
  }

  // Find user with password hash (for authentication)
  async findByEmailOrUsernameWithPassword(emailOrUsername: string): Promise<User | null> {
    const result = await this.queries.query<User>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1) LIMIT 1',
      [emailOrUsername]
    );
    return result.rows[0] || null; // Return raw data including password_hash
  }

  // Update last login
  async updateLastLogin(id: string, auditInfo?: AuditInfo): Promise<void> {
    await this.update(
      id,
      { last_login: new Date() },
      auditInfo ? { ...auditInfo, action: 'login' } : undefined
    );
  }

  // Verify email
  async verifyEmail(token: string, auditInfo?: AuditInfo): Promise<User | null> {
    const user = await this.queries.query<User>(
      'SELECT * FROM users WHERE email_verification_token = $1 LIMIT 1',
      [token]
    );

    if (user.rows.length === 0) {
      return null;
    }

    return this.update(
      user.rows[0].id,
      {
        email_verified: true,
        email_verification_token: null
      },
      auditInfo ? { ...auditInfo, action: 'email_verification' } : undefined
    );
  }

  // Search users
  async searchUsers(query: string, limit = 20): Promise<User[]> {
    const result = await this.queries.query<User>(
      `SELECT * FROM users 
       WHERE LOWER(username) ILIKE LOWER($1) 
          OR LOWER(email) ILIKE LOWER($1)
       ORDER BY username 
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    return result.rows.map(row => this.sanitizeOutput(row));
  }
}

export default UserRepository;