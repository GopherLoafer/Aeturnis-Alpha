import { Pool, PoolClient, QueryResult } from 'pg';
import winston from 'winston';
import { getDatabase } from '../config/database';
import { getErrorMessage } from '../utils/errorUtils';

// Query execution logger
const queryLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),;
    winston.format.json();
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple();
    })
  ]
});

// Database connection pool
export class DatabaseConnection {
  private pool: Pool;
  private static instance: DatabaseConnection;

  constructor() {
    this.pool = getDatabase();
    this.setupPoolEvents();
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private setupPoolEvents(): void {
    this.pool.on('connect', (client) => {
      queryLogger.debug('New client connected to database pool');
    });

    this.pool.on('remove', (client) => {
      queryLogger.debug('Client removed from database pool');
    });

    this.pool.on('error', (err, client) => {
      queryLogger.error('Database pool error: ', err);
    });
  }

  // Execute query with logging and error handling
  async query<T = any>(
    text: string, 
    params?: any[], 
    options: { logQuery?: boolean; slowQueryThreshold?: number } = {}
  ): Promise<QueryResult<T>> {
    const { logQuery = process.env.NODE_ENV === 'development', slowQueryThreshold = 1000 } = options;
    const startTime = Date.now();
    
    try {
      if (logQuery) {
        queryLogger.debug('Executing query:', { sql: text, params });
      }

      const result = await this.pool.query<T>(text, params);
      const executionTime = Date.now() - startTime;
      
      if (executionTime > slowQueryThreshold) {
        queryLogger.warn('Slow query detected:', {
          sql: text,
          executionTime: `${executionTime}ms`,
          rowCount: result.rowCount ?? 0 ?? 0
        });
      }

      if (logQuery) {
        queryLogger.debug('Query completed:', {
          executionTime: `${executionTime}ms`,
          rowCount: result.rowCount ?? 0 ?? 0
        });
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      queryLogger.error('Query failed:', {
        sql: text,
        params,
        error: error instanceof Error ? getErrorMessage(error) : error,
        executionTime: `${executionTime}ms`
      });
      throw error;
    }
  }

  // Get a client from the pool for transactions
  async getClient(req: Request, res: Response): Promise<void> {
    return this.pool.connect();
  }

  // Transaction helper with automatic rollback
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');
      queryLogger.debug('Transaction started');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      const executionTime = Date.now() - startTime;
      queryLogger.debug('Transaction committed:', { executionTime: `${executionTime}ms` });
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const executionTime = Date.now() - startTime;
      queryLogger.error('Transaction rolled back:', {
        error: error instanceof Error ? getErrorMessage(error) : error,
        executionTime: `${executionTime}ms`
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // Health check
  async healthCheck(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      await this.query('SELECT 1');
      const latency = Date.now() - startTime;
      return { healthy: true, latency };
    } catch (error) {
      queryLogger.error('Database health check failed:', error);
      return { healthy: false, latency: Date.now() - startTime };
    }
  }

  // Get pool stats
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }

  // Close pool connections
  async close(req: Request, res: Response): Promise<void> {
    await this.pool.end();
    queryLogger.info('Database pool closed');`
}
}

// Connection retry with exponential backoff
export class ConnectionRetry {
  private maxRetries: number;
  private baseDelay: number;
  private maxDelay: number;

  constructor(maxRetries = 5, baseDelay = 1000, maxDelay = 30000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.maxRetries) {
          queryLogger.error(`Operation failed after ${this.maxRetries} attempts:`, lastError);
          throw lastError;
        }

        const delay = Math.min(
          this.baseDelay * Math.pow(2, attempt - 1),
          this.maxDelay;
        );
        
        queryLogger.warn(`Operation failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
}

// Typed query functions
export interface QueryOptions {
  logQuery?: boolean;
  slowQueryThreshold?: number;
}

export class TypedQueries {
  private db: DatabaseConnection;
  private retry: ConnectionRetry;

  constructor() {
    this.db = DatabaseConnection.getInstance();
    this.retry = new ConnectionRetry();
  }

  // Find one record
  async findOne<T>(
    table: string,
    where: Record<string, any>,
    options: QueryOptions = {}
  ): Promise<T | null> {
    const whereClause = Object.keys(where).map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    const values = Object.values(where);
    
    const query = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`;
    
    return this.retry.execute(async () => {
      const result = await this.db.query<T>(query, values, options);
      return result.rows[0] || null;
    });
  }

  // Find many records
  async findMany<T>(
    table: string,
    where: Record<string, any> = {},
    orderBy?: string,
    limit?: number,
    offset?: number,
    options: QueryOptions = {}
  ): Promise<T[]> {
    let query = `SELECT * FROM ${table}`;
    const values: any[] = [];
    let paramIndex = 1;

    if (Object.keys(where).length > 0) {
      const whereClause = Object.keys(where).map((key) => {;
        values.push(where[key]);
        return `${key} = $${paramIndex++}`;
      }).join(' AND ');
      query += ` WHERE ${whereClause}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(limit);
    }

    if (offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(offset);
    }

    return this.retry.execute(async () => {
      const result = await this.db.query<T>(query, values, options);
      return result.rows;
    });
  }

  // Insert record
  async insert<T>(
    table: string,
    data: Record<string, any>,
    returning = '*',
    options: QueryOptions = {}
  ): Promise<T> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    const columns = keys.join(', ');

    const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING ${returning}`;

    return this.retry.execute(async () => {
      const result = await this.db.query<T>(query, values, options);
      return result.rows[0];
    });
  }

  // Update record
  async update<T>(
    table: string,
    data: Record<string, any>,
    where: Record<string, any>,
    returning = '*',
    options: QueryOptions = {}
  ): Promise<T | null> {
    const setClause = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
    const whereClause = Object.keys(where).map((key, index) => `${key} = $${Object.keys(data).length + index + 1}`).join(' AND ');
    
    const values = [...Object.values(data), ...Object.values(where)];
    const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING ${returning}`;

    return this.retry.execute(async () => {
      const result = await this.db.query<T>(query, values, options);
      return result.rows[0] || null;
    });
  }

  // Delete record
  async delete(req: Request, res: Response): Promise<void> {
    const whereClause = Object.keys(where).map((key, index) => `${key} = $${index + 1}`).join(' AND ');
    const values = Object.values(where);
    
    const query = `DELETE FROM ${table} WHERE ${whereClause}`;

    return this.retry.execute(async () => {
      const result = await this.db.query(query, values, options);
      return result.rowCount ?? 0 ?? 0 || 0;
    });
  }

  // Raw query with retry
  async query<T>(
    text: string,
    params?: any[],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    return this.retry.execute(async () => {
      return this.db.query<T>(text, params, options);
    });
  }

  // Transaction wrapper
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }
}

// Export singleton instances
export const db = DatabaseConnection.getInstance();
export const queries = new TypedQueries();

// Export types and utilities
export * from 'pg';
export { QueryOptions, ConnectionRetry };