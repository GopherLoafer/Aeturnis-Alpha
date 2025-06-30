#!/usr/bin/env node

/**
 * Final TypeScript Fix Script - Addresses remaining structural corruption
 */

const fs = require('fs');
const path = require('path');

function colorLog(message, color = 'reset') {
  const colors = {
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', 
    blue: '\x1b[34m', cyan: '\x1b[36m', reset: '\x1b[0m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function fixCharacterController() {
  const filePath = 'server/src/controllers/CharacterController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix the specific malformed JSON response pattern
  content = content.replace(
    /message:\s*'Authentication required'\s*\);\s*\}\s*\}\);/g,
    `message: 'Authentication required'
          }
        });`
  );
  
  // Fix similar patterns throughout the file
  content = content.replace(
    /code:\s*'([^']+)',\s*message:\s*'([^']+)'\s*\);\s*\}\s*\}\);/g,
    `code: '$1',
            message: '$2'
          }
        });`
  );
  
  // Fix other malformed error responses
  content = content.replace(
    /error:\s*\{\s*code:\s*'([^']+)',\s*message:\s*'([^']+)'\s*\)\s*\}/g,
    `error: {
            code: '$1',
            message: '$2'
          }`
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixCombatController() {
  const filePath = 'server/src/controllers/CombatController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix Socket.io emit patterns that got corrupted
  content = content.replace(
    /io\.to\(`([^`]+)`\)\.emit\('([^']+)',\s*([^;]+);/g,
    `io.to(\`$1\`).emit('$2', $3);`
  );
  
  // Fix combat result JSON responses
  content = content.replace(
    /success:\s*true,\s*data:\s*([^}]+)\}\s*\)\s*\}/g,
    `success: true,
        data: $1
      }`
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixCombatService() {
  const filePath = 'server/src/services/CombatService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix BigInt calculations that got corrupted
  content = content.replace(/BigInt\(([^)]+)\)\s*\+\s*BigInt\(([^)]+)\)\s*return;/g, 'BigInt($1) + BigInt($2)');
  
  // Fix combat formulas
  content = content.replace(
    /Math\.max\(1,\s*\(([^)]+)\s*-\s*([^)]+)\)\s*\*\s*([^)]+)\)\s*return;/g,
    'Math.max(1, ($1 - $2) * $3)'
  );
  
  // Fix damage calculations
  content = content.replace(
    /const\s+damage\s*=\s*([^;]+)\s*return;/g,
    'const damage = $1;'
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixProgressionService() {
  const filePath = 'server/src/services/ProgressionService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix experience calculations with BigInt
  content = content.replace(
    /const\s+([^=]+)=\s*BigInt\(([^)]+)\)\s*\*\s*BigInt\(([^)]+)\)\s*return;/g,
    'const $1 = BigInt($2) * BigInt($3);'
  );
  
  // Fix level calculations
  content = content.replace(
    /Math\.floor\(([^)]+)\)\s*return;/g,
    'Math.floor($1)'
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixMovementService() {
  const filePath = 'server/src/services/MovementService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix database queries that got corrupted
  content = content.replace(
    /await\s+client\.query\(\s*`([^`]+)`\s*,\s*\[([^\]]+)\]\s*\)\s*return;/g,
    'await client.query(`$1`, [$2]);'
  );
  
  // Fix movement validation
  content = content.replace(
    /if\s*\(\s*([^)]+)\s*\)\s*\{\s*throw\s+new\s+Error\(\s*`([^`]+)`\s*\)\s*return;/g,
    'if ($1) {\n      throw new Error(`$2`);'
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixMigrate() {
  const filePath = 'server/src/database/migrate.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix logging statements that got corrupted
  content = content.replace(
    /this\.logger\.(info|warn|error)\(\s*`([^`]+)`\s*\)\s*return;/g,
    'this.logger.$1(`$2`);'
  );
  
  // Fix error throwing
  content = content.replace(
    /throw\s+new\s+Error\(\s*`([^`]+)`\s*\)\s*return;/g,
    'throw new Error(`$1`);'
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixDatabaseIndex() {
  const filePath = 'server/src/database/index.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix export statements that got corrupted
  content = content.replace(/export\s*\{\s*([^}]+)\s*\}\s*return;/g, 'export { $1 };');
  
  // Fix import statements
  content = content.replace(/import\s*\{\s*([^}]+)\s*\}\s*from\s*'([^']+)'\s*return;/g, "import { $1 } from '$2';");
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixMovementController() {
  const filePath = 'server/src/controllers/MovementController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix the import statement that got corrupted
  content = content.replace(
    /import \{ getErrorMessage \} from '\.\.\/utils\/errorUtils';\s*Direction,\s*MovementErrorCode,\s*ZoneQueryParams\s*\} from '\.\.\/types\/zone\.types';/,
    `import { getErrorMessage } from '../utils/errorUtils';
import {
  Direction,
  MovementErrorCode,
  ZoneQueryParams
} from '../types/zone.types';`
  );
  
  // Fix movement responses
  content = content.replace(
    /success:\s*true,\s*message:\s*'([^']+)',\s*data:\s*([^}]+)\}\s*\)\s*\}/g,
    `success: true,
        message: '$1',
        data: $2
      }`
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

async function main() {
  colorLog('🎯 Final TypeScript Structural Fixes...', 'blue');
  
  const fixes = [
    { name: 'CharacterController', fn: fixCharacterController },
    { name: 'CombatController', fn: fixCombatController },
    { name: 'CombatService', fn: fixCombatService },
    { name: 'ProgressionService', fn: fixProgressionService },
    { name: 'MovementService', fn: fixMovementService },
    { name: 'DatabaseMigrate', fn: fixMigrate },
    { name: 'DatabaseIndex', fn: fixDatabaseIndex },
    { name: 'MovementController', fn: fixMovementController }
  ];
  
  for (const fix of fixes) {
    try {
      colorLog(`🔧 ${fix.name}...`, 'yellow');
      fix.fn();
      colorLog(`✅ ${fix.name} completed`, 'green');
    } catch (error) {
      colorLog(`❌ Error fixing ${fix.name}: ${error.message}`, 'red');
    }
  }
  
  // Final TypeScript check
  colorLog('\n🔍 Final TypeScript validation...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      colorLog(`📊 Final error count: ${errorLines.length}`, errorLines.length > 100 ? 'red' : errorLines.length > 50 ? 'yellow' : 'green');
      
      if (errorLines.length <= 100) {
        // Show error distribution
        const errorsByFile = {};
        errorLines.forEach(line => {
          const match = line.match(/^([^(]+)/);
          if (match) {
            const file = match[1].split('/').pop();
            errorsByFile[file] = (errorsByFile[file] || 0) + 1;
          }
        });
        
        colorLog('\n📁 Remaining errors by file:', 'cyan');
        Object.entries(errorsByFile)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .forEach(([file, count]) => {
            colorLog(`   ${count}: ${file}`, count > 20 ? 'red' : 'yellow');
          });
      }
      
      if (errorLines.length <= 20) {
        colorLog('\n📝 Remaining errors:', 'yellow');
        errorLines.forEach(line => {
          colorLog(`   ${line}`, 'red');
        });
      }
    } else {
      colorLog('🏆 All TypeScript errors resolved!', 'green');
    }
  });
}

main().catch(error => {
  colorLog(`💥 Final fix failed: ${error.message}`, 'red');
  process.exit(1);
});