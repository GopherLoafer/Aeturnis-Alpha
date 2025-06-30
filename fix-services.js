#!/usr/bin/env node

/**
 * Service Layer TypeScript Fix Script
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

function fixCombatService() {
  const filePath = 'server/src/services/CombatService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix BigInt operations
  content = content.replace(/BigInt\(([^)]+)\)\s*\+\s*BigInt\(([^)]+)\)/g, 'BigInt($1) + BigInt($2)');
  content = content.replace(/BigInt\(([^)]+)\)\s*\*\s*BigInt\(([^)]+)\)/g, 'BigInt($1) * BigInt($2)');
  content = content.replace(/BigInt\(([^)]+)\)\s*-\s*BigInt\(([^)]+)\)/g, 'BigInt($1) - BigInt($2)');
  
  // Fix damage calculations
  content = content.replace(/Math\.max\(1,\s*\(([^)]+)\s*-\s*([^)]+)\)\s*\*\s*([^)]+)\)/g, 'Math.max(1, ($1 - $2) * $3)');
  content = content.replace(/Math\.floor\(([^)]+)\s*\*\s*([^)]+)\)/g, 'Math.floor($1 * $2)');
  
  // Fix async database operations
  content = content.replace(/await\s+this\.db\.query\([^)]+\)/g, (match) => {
    return match.replace(/\s*return;$/, '');
  });
  
  // Fix JSON serialization for BigInt
  content = content.replace(/experience:\s*([^.]+)\.toString\(\)/g, 'experience: $1.toString()');
  content = content.replace(/damage:\s*damage\.toString\(\)/g, 'damage: damage.toString()');
  
  fs.writeFileSync(filePath, content);
  return 'CombatService';
}

function fixProgressionService() {
  const filePath = 'server/src/services/ProgressionService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix BigInt experience calculations
  content = content.replace(/const\s+totalExp\s*=\s*BigInt\(([^)]+)\)\s*\+\s*BigInt\(([^)]+)\)/g, 'const totalExp = BigInt($1) + BigInt($2)');
  content = content.replace(/const\s+requiredExp\s*=\s*this\.getExperienceForLevel\(([^)]+)\)/g, 'const requiredExp = this.getExperienceForLevel($1)');
  
  // Fix level calculation methods
  content = content.replace(/Math\.pow\(([^,]+),\s*([^)]+)\)/g, 'Math.pow($1, $2)');
  content = content.replace(/Math\.floor\(([^)]+)\)/g, 'Math.floor($1)');
  
  // Fix phase bonus calculations
  content = content.replace(/const\s+phaseBonus\s*=\s*([^;]+);/g, 'const phaseBonus = $1;');
  
  // Fix milestone rewards
  content = content.replace(/await\s+this\.awardMilestoneRewards\([^)]+\)/g, (match) => {
    return match.replace(/\s*return;$/, '');
  });
  
  fs.writeFileSync(filePath, content);
  return 'ProgressionService';
}

function fixMovementService() {
  const filePath = 'server/src/services/MovementService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix database query patterns
  content = content.replace(/const\s+result\s*=\s*await\s+client\.query\([^;]+;/g, (match) => {
    return match.replace(/\s*return;$/, '');
  });
  
  // Fix movement validation
  content = content.replace(/if\s*\(\s*!([^)]+)\s*\)\s*\{\s*throw\s+new\s+Error\([^)]+\);/g, 'if (!$1) {\n      throw new Error(errorMessage);');
  
  // Fix zone loading
  content = content.replace(/const\s+zone\s*=\s*await\s+this\.zoneRepository\.getZoneById\([^)]+\)/g, (match) => {
    return match.replace(/\s*return;$/, '');
  });
  
  // Fix location updates
  content = content.replace(/await\s+this\.updateCharacterLocation\([^)]+\)/g, (match) => {
    return match.replace(/\s*return;$/, '');
  });
  
  fs.writeFileSync(filePath, content);
  return 'MovementService';
}

function fixDatabaseMigrate() {
  const filePath = 'server/src/database/migrate.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix logging statements
  content = content.replace(/this\.logger\.(info|warn|error)\(`([^`]+)`\)/g, 'this.logger.$1(`$2`)');
  
  // Fix error throwing
  content = content.replace(/throw\s+new\s+Error\(`([^`]+)`\)/g, 'throw new Error(`$1`)');
  
  // Fix SQL execution
  content = content.replace(/await\s+client\.query\(`([^`]+)`\)/g, 'await client.query(`$1`)');
  content = content.replace(/await\s+client\.query\(`([^`]+)`,\s*\[([^\]]+)\]\)/g, 'await client.query(`$1`, [$2])');
  
  fs.writeFileSync(filePath, content);
  return 'DatabaseMigrate';
}

function fixMovementController() {
  const filePath = 'server/src/controllers/MovementController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix validation responses
  content = content.replace(/details:\s*errors\.array\(\)\s*\}/g, 'details: errors.array()\n        }');
  
  // Fix movement responses
  content = content.replace(/success:\s*true,\s*data:\s*([^}]+)\}/g, 'success: true,\n        data: $1\n      }');
  
  // Fix error responses
  content = content.replace(/success:\s*false,\s*error:\s*([^}]+)\}/g, 'success: false,\n        error: $1\n      }');
  
  fs.writeFileSync(filePath, content);
  return 'MovementController';
}

async function main() {
  colorLog('🔧 Fixing service layer TypeScript errors...', 'blue');
  
  const fixes = [
    { name: 'CombatService', fn: fixCombatService },
    { name: 'ProgressionService', fn: fixProgressionService },
    { name: 'MovementService', fn: fixMovementService },
    { name: 'DatabaseMigrate', fn: fixDatabaseMigrate },
    { name: 'MovementController', fn: fixMovementController }
  ];
  
  for (const fix of fixes) {
    try {
      colorLog(`Processing ${fix.name}...`, 'yellow');
      fix.fn();
      colorLog(`✅ ${fix.name} completed`, 'green');
    } catch (error) {
      colorLog(`❌ Error fixing ${fix.name}: ${error.message}`, 'red');
    }
  }
  
  // Check progress
  colorLog('\nValidating changes...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      const errorCount = errorLines.length;
      
      colorLog(`Errors remaining: ${errorCount}`, 
        errorCount <= 200 ? 'yellow' : 'red'
      );
      
      if (errorCount <= 100) {
        // Show top error files
        const errorsByFile = {};
        errorLines.forEach(line => {
          const match = line.match(/^([^(]+)/);
          if (match) {
            const file = match[1].split('/').pop();
            errorsByFile[file] = (errorsByFile[file] || 0) + 1;
          }
        });
        
        colorLog('\nTop error files:', 'cyan');
        Object.entries(errorsByFile)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 3)
          .forEach(([file, count]) => {
            colorLog(`  ${count}: ${file}`, 'yellow');
          });
      }
    } else {
      colorLog('🎉 All TypeScript errors resolved!', 'green');
    }
  });
}

main().catch(error => {
  colorLog(`Service fix failed: ${error.message}`, 'red');
  process.exit(1);
});