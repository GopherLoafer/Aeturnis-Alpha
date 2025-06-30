#!/usr/bin/env tsx

/**
 * Database Migration CLI
 * Usage: tsx server/src/cli/migrate.ts [command] [options]
 */

import { migrationRunner } from '../database/migrate';
import { getErrorMessage } from '../utils/errorUtils';

async function main() {
  const command = process.argv[2];
  const steps = parseInt(process.argv[3]) || 1;
  
  console.log('🗄️  Aeturnis Online - Database Migration Tool\n');
  
  try {
    switch (command) {
      case 'up':
      case 'migrate':
        console.log('📈 Running migrations...');
        await migrationRunner.migrate();
        break;
        
      case 'down':
      case 'rollback':
        console.log(`📉 Rolling back ${steps} migration(s)...`);
        await migrationRunner.rollback(steps);
        break;
        
      case 'status':
        console.log('📊 Checking migration status...');
        await migrationRunner.status();
        break;
        
      default:
        console.log(`
📚 Usage: tsx server/src/cli/migrate.ts [command] [options]

Commands:
  up, migrate     Run pending migrations
  down, rollback  Rollback migrations (default: 1 step)
  status          Show migration status

Examples:
  tsx server/src/cli/migrate.ts up
  tsx server/src/cli/migrate.ts down 2
  tsx server/src/cli/migrate.ts status
        `);
        process.exit(0);
    }
    
    console.log('\n✅ Migration operation completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error instanceof Error ? getErrorMessage(error) : error);
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main();
}

export default main;