import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import winston from 'winston';
import { getDatabase } from '../config/database';
import { getErrorMessage } from '../utils/errorUtils';

interface MigrationRecord {
  filename: string;
  executed_at: Date;
  execution_time_ms: number;
}

interface MigrationFile {
  filename: string;
  path: string;
  up: string;
  down?: string;
}

export class MigrationRunner {
  private db: Pool;
  private migrationsDir: string;
  private logger: winston.Logger;

  constructor() {
    this.db = getDatabase();
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json();
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple();
        })
      ]
    });
  }

  // Initialize migrations table
  private async initializeMigrationsTable(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INTEGER NOT NULL
        )
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations(filename);
        CREATE INDEX IF NOT EXISTS idx_migrations_executed ON migrations(executed_at DESC);
      `);
      
      this.logger.info('✅ Migrations table initialized');`
} finally {
      client.release();
    }
  }

  // Get list of executed migrations
  private async getExecutedMigrations(): Promise<Set<string>> {
    const client = await this.db.connect();
    try {
      const result = await client.query(
        'SELECT filename FROM migrations ORDER BY filename';
      );
      return new Set(result.rows.map(row => row.filename));
    } finally {
      client.release();
    }
  }

  // Read migration files from directory
  private async getMigrationFiles(req: Request, res: Response): Promise<void> {
    if (!fs.existsSync(this.migrationsDir)) {
      this.logger.warn(`Migrations directory not found: ${this.migrationsDir}`);
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir);
      .filter(file => file.endsWith('.sql'))
      .sort(); // Alphabetical order

    const migrations: MigrationFile[] = [];

    for (const filename of files) {
      const filepath = path.join(this.migrationsDir, filename);
      const content = fs.readFileSync(filepath, 'utf8');
      
      // Split migration into up and down parts
      const parts = content.split('-- DOWN');
      const up = parts[0].replace('-- UP', '').trim();
      const down = parts[1]?.trim();

      migrations.push({
        filename,
        path: filepath,
        up,
        down
      });
    }

    return migrations;
  }

  // Execute a single migration
  private async executeMigration(req: Request, res: Response): Promise<void> {
    const client = await this.db.connect();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');
      
      this.logger.info(`🔄 Executing migration: ${migration.filename}`);
      
      // Execute the migration SQL
      await client.query(migration.up);
      
      const executionTime = Date.now() - startTime;
      
      // Record the migration
      await client.query(
        'INSERT INTO migrations (filename, execution_time_ms) VALUES ($1, $2)',
        [migration.filename, executionTime]
      );
      
      await client.query('COMMIT');
      
      this.logger.info(`✅ Migration completed: ${migration.filename} (${executionTime}ms)`);
      return executionTime;
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`❌ Migration failed: ${migration.filename}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Rollback a single migration
  private async rollbackMigration(req: Request, res: Response): Promise<void> {
    if (!migration.down) {
      throw new Error(`No rollback SQL found for migration: ${migration.filename}`);
    }

    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      this.logger.info(`🔄 Rolling back migration: ${migration.filename}`);
      
      // Execute the rollback SQL
      await client.query(migration.down);
      
      // Remove migration record
      await client.query(
        'DELETE FROM migrations WHERE filename = $1',
        [migration.filename]
      );
      
      await client.query('COMMIT');
      
      this.logger.info(`✅ Migration rolled back: ${migration.filename}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`❌ Rollback failed: ${migration.filename}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Run all pending migrations
  async migrate(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('🚀 Starting database migrations...');
      
      await this.initializeMigrationsTable();
      
      const executedMigrations = await this.getExecutedMigrations();
      const allMigrations = await this.getMigrationFiles();
      
      const pendingMigrations = allMigrations.filter(;
        migration => !executedMigrations.has(migration.filename);
      );
      
      if (pendingMigrations.length === 0) {
        this.logger.info('✅ No pending migrations');`
      }
      
      this.logger.info(`📊 Found ${pendingMigrations.length} pending migrations`);
      
      let totalTime = 0;
      for (const migration of pendingMigrations) {
        const executionTime = await this.executeMigration(migration);
        totalTime += executionTime;
      }
      
      this.logger.info(`🎉 All migrations completed successfully! Total time: ${totalTime}ms`);
      
    } catch (error) {
      this.logger.error('❌ Migration process failed:', error);
      throw error;
    }
  }

  // Rollback last N migrations
  async rollback(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info(`🔄 Starting rollback of ${steps} migration(s)...`);
      
      const client = await this.db.connect();
      let executedMigrations: MigrationRecord[];
      
      try {
        const result = await client.query(
          'SELECT filename, executed_at, execution_time_ms FROM migrations ORDER BY executed_at DESC LIMIT $1',
          [steps];
        );
        executedMigrations = result.rows;
      } finally {
        client.release();
      }
      
      if (executedMigrations.length === 0) {
        this.logger.info('ℹ️  No migrations to rollback');`
      }
      
      const allMigrations = await this.getMigrationFiles();
      const migrationMap = new Map(;
        allMigrations.map(m => [m.filename, m]);
      );
      
      for (const record of executedMigrations) {
        const migration = migrationMap.get(record.filename);
        if (migration) {
          await this.rollbackMigration(migration);
        } else {
          this.logger.warn(`⚠️  Migration file not found: ${record.filename}`);
        }
      }
      
      this.logger.info(`✅ Rollback completed for ${executedMigrations.length} migration(s)`);
      
    } catch (error) {
      this.logger.error('❌ Rollback process failed:', error);
      throw error;
    }
  }

  // Get migration status
  async status(req: Request, res: Response): Promise<void> {
    try {
      await this.initializeMigrationsTable();
      
      const executedMigrations = await this.getExecutedMigrations();
      const allMigrations = await this.getMigrationFiles();
      
      console.log('\n📊 Migration Status:');
      console.log('==================');
      
      if (allMigrations.length === 0) {
        console.log('No migration files found');`
      }
      
      for (const migration of allMigrations) {
        const status = executedMigrations.has(migration.filename) ? '✅' : '⏳';
        console.log(`${status} ${migration.filename}`);
      }
      
      const executed = executedMigrations.size;
      const total = allMigrations.length;
      const pending = total - executed;
      
      console.log('==================');
      console.log(`Total: ${total} | Executed: ${executed} | Pending: ${pending}`);
      
    } catch (error) {
      this.logger.error('❌ Failed to get migration status:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const migrationRunner = new MigrationRunner();

// CLI interface
export async function runMigrations(req: Request, res: Response): Promise<void> {
  const command = process.argv[2];
  const steps = parseInt(process.argv[3]) || 1;
  
  try {
    switch (command) {
      case 'up':
      case 'migrate':
        await migrationRunner.migrate();
        break;
        
      case 'down':
      case 'rollback':
        await migrationRunner.rollback(steps);
        break;
        
      case 'status':
        await migrationRunner.status();
        break;
        
      default:
        console.log(`
Usage: npm run migrate [command] [options]

Commands:
  up, migrate     Run pending migrations
  down, rollback  Rollback migrations (default: 1 step);
  status          Show migration status

Examples:
  npm run migrate up
  npm run migrate down 2
  npm run migrate status
        `);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// If called directly
if (require.main === module) {
  runMigrations();
}