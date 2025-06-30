import { PoolClient, QueryResult } from 'pg';
import { queries, TypedQueries, QueryOptions } from './index';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SortOptions {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface FilterOptions {
  where?: Record<string, any>;
  whereIn?: Record<string, any[]>;
  whereLike?: Record<string, string>;
  whereNull?: string[];
  whereNotNull?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface AuditInfo {
  userId?: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: Record<string, any>;
}

export abstract class BaseRepository<T = any, CreateT = Partial<T>, UpdateT = Partial<T>> {
  protected queries: TypedQueries;
  protected tableName: string;
  protected primaryKey: string;
  protected auditEnabled: boolean;

  constructor(tableName: string, primaryKey = 'id', auditEnabled = true) {
    this.queries = queries;
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.auditEnabled = auditEnabled;
  }

  // Abstract methods to be implemented by child classes
  protected abstract validateCreate(data: CreateT): Promise<void>;
  protected abstract validateUpdate(data: UpdateT): Promise<void>;
  protected abstract sanitizeOutput(data: any): T;

  // Find single record by ID
  async findById(id: any, options: QueryOptions = {}): Promise<T | null> {
    const result = await this.queries.findOne<T>(
      this.tableName,
      { [this.primaryKey]: id },
      options
    );
    return result ? this.sanitizeOutput(result) : null;
  }

  // Find single record by criteria
  async findOne(
    where: Record<string, any>,
    options: QueryOptions = {}
  ): Promise<T | null> {
    const result = await this.queries.findOne<T>(this.tableName, where, options);
    return result ? this.sanitizeOutput(result) : null;
  }

  // Find multiple records with advanced filtering
  async findMany(
    filters: FilterOptions = {},
    sort?: SortOptions,
    pagination?: PaginationOptions,
    options: QueryOptions = {}
  ): Promise<T[]> {
    const { where = {}, whereIn = {}, whereLike = {}, whereNull = [], whereNotNull = [] } = filters;
    
    let query = `SELECT * FROM ${this.tableName}`;
    const values: any[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    // Basic WHERE conditions
    Object.entries(where).forEach(([key, value]) => {
      conditions.push(`${key} = $${paramIndex++}`);
      values.push(value);
    });

    // WHERE IN conditions
    Object.entries(whereIn).forEach(([key, valueArray]) => {
      if (valueArray.length > 0) {
        const placeholders = valueArray.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...valueArray);
      }
    });

    // LIKE conditions
    Object.entries(whereLike).forEach(([key, value]) => {
      conditions.push(`${key} ILIKE $${paramIndex++}`);
      values.push(`%${value}%`);
    });

    // NULL checks
    whereNull.forEach(column => {
      conditions.push(`${column} IS NULL`);
    });

    whereNotNull.forEach(column => {
      conditions.push(`${column} IS NOT NULL`);
    });

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Sorting
    if (sort) {
      query += ` ORDER BY ${sort.column} ${sort.direction}`;
    }

    // Pagination
    if (pagination?.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(pagination.limit);
    }

    if (pagination?.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(pagination.offset);
    }

    const result = await this.queries.query<T>(query, values, options);
    return result.rows.map(row => this.sanitizeOutput(row));
  }

  // Paginated find with total count
  async findPaginated(
    filters: FilterOptions = {},
    sort?: SortOptions,
    pagination: PaginationOptions = {},
    options: QueryOptions = {}
  ): Promise<PaginatedResult<T>> {
    const { page = 1, limit = 10 } = pagination;
    const offset = (page - 1) * limit;

    // Get total count
    const totalResult = await this.getCount(filters, options);
    const total = totalResult;

    // Get paginated data
    const data = await this.findMany(
      filters,
      sort,
      { limit, offset },
      options
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  // Get count of records
  async getCount(
    filters: FilterOptions = {},
    options: QueryOptions = {}
  ): Promise<number> {
    const { where = {}, whereIn = {}, whereLike = {}, whereNull = [], whereNotNull = [] } = filters;
    
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const values: any[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    // Apply same filtering logic as findMany
    Object.entries(where).forEach(([key, value]) => {
      conditions.push(`${key} = $${paramIndex++}`);
      values.push(value);
    });

    Object.entries(whereIn).forEach(([key, valueArray]) => {
      if (valueArray.length > 0) {
        const placeholders = valueArray.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...valueArray);
      }
    });

    Object.entries(whereLike).forEach(([key, value]) => {
      conditions.push(`${key} ILIKE $${paramIndex++}`);
      values.push(`%${value}%`);
    });

    whereNull.forEach(column => {
      conditions.push(`${column} IS NULL`);
    });

    whereNotNull.forEach(column => {
      conditions.push(`${column} IS NOT NULL`);
    });

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.queries.query<{ count: string }>(query, values, options);
    return parseInt(result.rows[0].count, 10);
  }

  // Create new record
  async create(
    data: CreateT,
    auditInfo?: AuditInfo,
    options: QueryOptions = {}
  ): Promise<T> {
    await this.validateCreate(data);

    return this.queries.transaction(async (client) => {
      // Insert the record
      const result = await this.queries.insert<T>(
        this.tableName,
        data as Record<string, any>,
        '*',
        options
      );

      // Log audit trail if enabled
      if (this.auditEnabled && auditInfo) {
        await this.logAudit(
          client,
          result[this.primaryKey as keyof T],
          auditInfo.action,
          this.tableName,
          data as Record<string, any>,
          auditInfo
        );
      }

      return this.sanitizeOutput(result);
    });
  }

  // Update record
  async update(
    id: any,
    data: UpdateT,
    auditInfo?: AuditInfo,
    options: QueryOptions = {}
  ): Promise<T | null> {
    await this.validateUpdate(data);

    return this.queries.transaction(async (client) => {
      // Get original record for audit
      const original = this.auditEnabled && auditInfo 
        ? await this.findById(id, options)
        : null;

      // Update the record
      const result = await this.queries.update<T>(
        this.tableName,
        data as Record<string, any>,
        { [this.primaryKey]: id },
        '*',
        options
      );

      if (!result) return null;

      // Log audit trail if enabled
      if (this.auditEnabled && auditInfo && original) {
        const changes = this.getChanges(original, data as Record<string, any>);
        await this.logAudit(
          client,
          id,
          auditInfo.action,
          this.tableName,
          changes,
          auditInfo
        );
      }

      return this.sanitizeOutput(result);
    });
  }

  // Soft delete (sets deleted_at timestamp)
  async softDelete(
    id: any,
    auditInfo?: AuditInfo,
    options: QueryOptions = {}
  ): Promise<boolean> {
    const deletedAt = new Date().toISOString();
    const result = await this.update(
      id,
      { deleted_at: deletedAt } as UpdateT,
      auditInfo ? { ...auditInfo, action: 'soft_delete' } : undefined,
      options
    );
    return result !== null;
  }

  // Hard delete
  async delete(
    id: any,
    auditInfo?: AuditInfo,
    options: QueryOptions = {}
  ): Promise<boolean> {
    return this.queries.transaction(async (client) => {
      // Get record for audit before deletion
      const original = this.auditEnabled && auditInfo 
        ? await this.findById(id, options)
        : null;

      // Delete the record
      const deletedCount = await this.queries.delete(
        this.tableName,
        { [this.primaryKey]: id },
        options
      );

      // Log audit trail if enabled
      if (this.auditEnabled && auditInfo && original) {
        await this.logAudit(
          client,
          id,
          auditInfo.action || 'delete',
          this.tableName,
          original,
          auditInfo
        );
      }

      return deletedCount > 0;
    });
  }

  // Bulk operations
  async bulkCreate(
    records: CreateT[],
    auditInfo?: AuditInfo,
    options: QueryOptions = {}
  ): Promise<T[]> {
    return this.queries.transaction(async (client) => {
      const results: T[] = [];
      
      for (const record of records) {
        const created = await this.create(record, auditInfo, options);
        results.push(created);
      }
      
      return results;
    });
  }

  // Check if record exists
  async exists(id: any, options: QueryOptions = {}): Promise<boolean> {
    const result = await this.queries.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1)`,
      [id],
      options
    );
    return result.rows[0].exists;
  }

  // Get changes between original and updated data
  private getChanges(original: any, updated: Record<string, any>): Record<string, any> {
    const changes: Record<string, any> = {};
    
    Object.entries(updated).forEach(([key, value]) => {
      if (original[key] !== value) {
        changes[key] = {
          from: original[key],
          to: value
        };
      }
    });
    
    return changes;
  }

  // Log audit trail
  private async logAudit(
    client: PoolClient,
    resourceId: any,
    action: string,
    resourceType: string,
    changes: Record<string, any>,
    auditInfo: AuditInfo
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        auditInfo.userId || null,
        action,
        resourceType,
        String(resourceId),
        JSON.stringify(changes),
        auditInfo.ipAddress || null,
        auditInfo.userAgent || null
      ]
    );
  }
}

export default BaseRepository;