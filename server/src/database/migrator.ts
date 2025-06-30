import fs from 'fs/promises';
import path from 'path';
import { pool, logger } from './connection';

export interface Migration {
  id: number;
  name: string;
  filename: string;
  content: string;
  checksum: string;
  description?: string;
  type: 'schema' | 'data' | 'index' | 'function';
}

export interface MigrationResult {
  success: boolean;
  migrationId?: number;
  error?: string;
  executionTime?: number;
}

export class DatabaseMigrator {
  private migrationsPath: string;

  constructor(migrationsPath?: string) {
    this.migrationsPath = migrationsPath || path.join(__dirname, 'migrations');
  }

  /**
   * Initialize migration system - create migration_history table if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      // Check if migration_history table exists
      const tableExists = await this.checkMigrationTableExists();
      
      if (!tableExists) {
        logger.info('Creating migration_history table...');
        
        // Read and execute the migration history creation script
        const migrationHistoryPath = path.join(this.migrationsPath, '004_create_migration_history.sql');
        const migrationContent = await fs.readFile(migrationHistoryPath, 'utf-8');
        
        await pool.query(migrationContent);
        logger.info('Migration system initialized successfully');
      } else {
        logger.info('Migration system already initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize migration system:', error);
      throw error;
    }
  }

  /**
   * Check if migration_history table exists
   */
  private async checkMigrationTableExists(): Promise<boolean> {
    try {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'migration_history'
        ) as exists
      `);
      
      return result.rows[0].exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of migration files from filesystem
   */
  async getMigrationFiles(): Promise<Migration[]> {
    try {
      const files = await fs.readdir(this.migrationsPath);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure proper execution order

      const migrations: Migration[] = [];

      for (const filename of migrationFiles) {
        const filePath = path.join(this.migrationsPath, filename);
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Extract migration name (remove extension and number prefix)
        const name = filename.replace(/^\d+_/, '').replace('.sql', '');
        
        // Calculate checksum
        const checksum = this.calculateChecksum(content);
        
        // Extract description from first comment line
        const description = this.extractDescription(content);
        
        // Determine migration type
        const type = this.determineMigrationType(content);

        migrations.push({
          id: 0, // Will be set when executed
          name,
          filename,
          content,
          checksum,
          description,
          type
        });
      }

      return migrations;
    } catch (error) {
      logger.error('Failed to read migration files:', error);
      throw error;
    }
  }

  /**
   * Get list of applied migrations from database
   */
  async getAppliedMigrations(): Promise<string[]> {
    try {
      const result = await pool.query(`
        SELECT migration_name 
        FROM migration_history 
        WHERE status = 'completed'
        ORDER BY applied_at
      `);
      
      return result.rows.map(row => row.migration_name);
    } catch (error) {
      logger.error('Failed to get applied migrations:', error);
      throw error;
    }
  }

  /**
   * Get pending migrations that need to be executed
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    return allMigrations.filter(migration => 
      !appliedMigrations.includes(migration.name)
    );
  }

  /**
   * Execute a single migration
   */
  async executeMigration(migration: Migration): Promise<MigrationResult> {
    const client = await pool.connect();
    const startTime = Date.now();
    let migrationId: number | undefined;

    try {
      await client.query('BEGIN');

      // Start migration tracking
      const startResult = await client.query(`
        SELECT start_migration($1, $2, $3, $4, $5) as migration_id
      `, [
        migration.name,
        migration.filename,
        migration.description,
        migration.type,
        migration.checksum
      ]);

      migrationId = startResult.rows[0].migration_id;
      
      logger.info(`Executing migration: ${migration.filename}`);

      // Execute migration content
      await client.query(migration.content);

      const executionTime = Date.now() - startTime;

      // Mark migration as completed
      await client.query(`
        SELECT complete_migration($1, $2)
      `, [migrationId, executionTime]);

      await client.query('COMMIT');
      
      logger.info(`Migration completed: ${migration.filename} (${executionTime}ms)`);
      
      return {
        success: true,
        migrationId,
        executionTime
      };

    } catch (error) {
      await client.query('ROLLBACK');
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Mark migration as failed (if we got a migration ID)
      if (migrationId) {
        try {
          await client.query(`
            SELECT fail_migration($1, $2)
          `, [migrationId, errorMessage]);
        } catch (updateError) {
          logger.error('Failed to update migration status:', updateError);
        }
      }

      logger.error(`Migration failed: ${migration.filename}`, error);
      
      return {
        success: false,
        migrationId,
        error: errorMessage
      };
    } finally {
      client.release();
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<MigrationResult[]> {
    await this.initialize();
    
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to execute');
      return [];
    }

    logger.info(`Found ${pendingMigrations.length} pending migrations`);
    
    const results: MigrationResult[] = [];

    for (const migration of pendingMigrations) {
      const result = await this.executeMigration(migration);
      results.push(result);

      // Stop on first failure
      if (!result.success) {
        logger.error(`Migration failed, stopping execution: ${migration.filename}`);
        break;
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    logger.info(`Migration summary: ${successful} successful, ${failed} failed`);
    
    return results;
  }

  /**
   * Get migration status overview
   */
  async getMigrationStatus(): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT * FROM migration_status_overview
      `);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      throw error;
    }
  }

  /**
   * Get recent migrations
   */
  async getRecentMigrations(limit: number = 10): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT * FROM recent_migrations LIMIT $1
      `, [limit]);
      
      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent migrations:', error);
      throw error;
    }
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    // Simple MD5 hash - in production would use SHA-256
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Extract description from migration file comments
   */
  private extractDescription(content: string): string | undefined {
    const lines = content.split('\n');
    const descriptionLine = lines.find(line => 
      line.trim().startsWith('-- Description:')
    );
    
    if (descriptionLine) {
      return descriptionLine.replace('-- Description:', '').trim();
    }
    
    return undefined;
  }

  /**
   * Determine migration type based on content
   */
  private determineMigrationType(content: string): 'schema' | 'data' | 'index' | 'function' {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('create function') || lowerContent.includes('create or replace function')) {
      return 'function';
    }
    
    if (lowerContent.includes('create index') || lowerContent.includes('create unique index')) {
      return 'index';
    }
    
    if (lowerContent.includes('insert into') || lowerContent.includes('update ') || lowerContent.includes('delete from')) {
      return 'data';
    }
    
    return 'schema';
  }

  /**
   * Validate migration integrity
   */
  async validateMigrations(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Check for missing migration files
      const appliedMigrations = await this.getAppliedMigrations();
      const availableFiles = await this.getMigrationFiles();
      const availableNames = availableFiles.map(m => m.name);
      
      for (const appliedName of appliedMigrations) {
        if (!availableNames.includes(appliedName)) {
          issues.push(`Applied migration file missing: ${appliedName}`);
        }
      }
      
      // Check for checksum mismatches
      for (const migration of availableFiles) {
        if (appliedMigrations.includes(migration.name)) {
          const result = await pool.query(`
            SELECT checksum FROM migration_history 
            WHERE migration_name = $1 AND status = 'completed'
          `, [migration.name]);
          
          if (result.rows.length > 0) {
            const storedChecksum = result.rows[0].checksum;
            if (storedChecksum && storedChecksum !== migration.checksum) {
              issues.push(`Checksum mismatch for migration: ${migration.name}`);
            }
          }
        }
      }
      
      return {
        valid: issues.length === 0,
        issues
      };
      
    } catch (error) {
      logger.error('Failed to validate migrations:', error);
      return {
        valid: false,
        issues: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
}

// Create default migrator instance
export const migrator = new DatabaseMigrator();