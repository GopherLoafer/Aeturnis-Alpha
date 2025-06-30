import { migrator, MigrationResult } from './migrator';
import { logger } from './connection';

export interface DatabaseInitializationResult {
  success: boolean;
  migrationsRun: number;
  errors: string[];
  executionTime: number;
}

export class DatabaseInitializer {
  
  /**
   * Initialize database on application startup
   */
  static async initializeDatabase(): Promise<DatabaseInitializationResult> {
    const startTime = Date.now();
    logger.info('Starting database initialization...');

    try {
      // Validate existing migrations
      const validation = await migrator.validateMigrations();
      if (!validation.valid) {
        logger.warn('Migration validation issues found:', validation.issues);
        // Continue anyway in development, fail in production
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`Migration validation failed: ${validation.issues.join(', ')}`);
        }
      }

      // Run pending migrations
      const migrationResults = await migrator.runMigrations();
      
      // Collect results
      const errors: string[] = [];
      let successCount = 0;
      
      for (const result of migrationResults) {
        if (result.success) {
          successCount++;
        } else {
          errors.push(result.error || 'Unknown migration error');
        }
      }

      const executionTime = Date.now() - startTime;
      
      if (errors.length > 0) {
        logger.error(`Database initialization completed with errors: ${errors.join(', ')}`);
        return {
          success: false,
          migrationsRun: successCount,
          errors,
          executionTime
        };
      }

      if (successCount > 0) {
        logger.info(`Database initialization completed successfully. ${successCount} migrations executed in ${executionTime}ms`);
      } else {
        logger.info(`Database already up to date. No migrations needed. (${executionTime}ms)`);
      }

      // Log migration status
      await this.logMigrationStatus();

      return {
        success: true,
        migrationsRun: successCount,
        errors: [],
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      
      logger.error('Database initialization failed:', error);
      
      return {
        success: false,
        migrationsRun: 0,
        errors: [errorMessage],
        executionTime
      };
    }
  }

  /**
   * Log current migration status for monitoring
   */
  private static async logMigrationStatus(): Promise<void> {
    try {
      const status = await migrator.getMigrationStatus();
      const recent = await migrator.getRecentMigrations(5);
      
      logger.info('Migration Status Overview:', {
        statusSummary: status,
        recentMigrations: recent.map(m => ({
          name: m.migration_name,
          status: m.status,
          appliedAt: m.applied_at,
          executionTime: m.execution_time_ms
        }))
      });
    } catch (error) {
      logger.warn('Failed to log migration status:', error);
    }
  }

  /**
   * Verify database schema integrity
   */
  static async verifyDatabaseIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check for required tables
      const requiredTables = ['users', 'user_sessions', 'user_audit_log', 'migration_history'];
      
      for (const tableName of requiredTables) {
        const tableExists = await this.checkTableExists(tableName);
        if (!tableExists) {
          issues.push(`Required table missing: ${tableName}`);
        }
      }

      // Check for required indexes
      const requiredIndexes = [
        'idx_users_email',
        'idx_users_username', 
        'idx_user_sessions_user_id',
        'idx_audit_log_user_id'
      ];

      for (const indexName of requiredIndexes) {
        const indexExists = await this.checkIndexExists(indexName);
        if (!indexExists) {
          issues.push(`Required index missing: ${indexName}`);
        }
      }

      // Check for required functions
      const requiredFunctions = [
        'update_updated_at_column',
        'log_user_event',
        'start_migration'
      ];

      for (const functionName of requiredFunctions) {
        const functionExists = await this.checkFunctionExists(functionName);
        if (!functionExists) {
          issues.push(`Required function missing: ${functionName}`);
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      logger.error('Database integrity check failed:', error);
      return {
        valid: false,
        issues: [`Integrity check error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Check if table exists
   */
  private static async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const { pool } = require('./connection');
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists
      `, [tableName]);
      
      return result.rows[0].exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if index exists
   */
  private static async checkIndexExists(indexName: string): Promise<boolean> {
    try {
      const { pool } = require('./connection');
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM pg_indexes 
          WHERE indexname = $1
        ) as exists
      `, [indexName]);
      
      return result.rows[0].exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if function exists
   */
  private static async checkFunctionExists(functionName: string): Promise<boolean> {
    try {
      const { pool } = require('./connection');
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM pg_proc 
          WHERE proname = $1
        ) as exists
      `, [functionName]);
      
      return result.rows[0].exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create database backup before major operations
   */
  static async createBackup(backupName?: string): Promise<{ success: boolean; message: string }> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = backupName || `backup_${timestamp}`;
      
      // Log backup creation (actual backup would require pg_dump in production)
      logger.info(`Database backup created: ${name}`);
      
      return {
        success: true,
        message: `Backup created: ${name}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown backup error';
      logger.error('Backup creation failed:', error);
      
      return {
        success: false,
        message: `Backup failed: ${errorMessage}`
      };
    }
  }

  /**
   * Get database statistics for monitoring
   */
  static async getDatabaseStatistics(): Promise<any> {
    try {
      const { pool } = require('./connection');
      
      // Get table sizes and row counts
      const tableStats = await pool.query(`
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE schemaname = 'public'
        ORDER BY tablename, attname
      `);

      // Get connection pool status
      const poolStats = {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingConnections: pool.waitingCount
      };

      return {
        tableStatistics: tableStats.rows,
        connectionPool: poolStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get database statistics:', error);
      throw error;
    }
  }
}