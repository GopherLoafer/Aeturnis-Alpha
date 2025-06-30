#!/usr/bin/env node

/**
 * Targeted TypeScript Fix Script - Manual Corrections for Complex Patterns
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

function fixMovementController() {
  const filePath = 'server/src/controllers/MovementController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix the corrupted import statement
  content = content.replace(
    /import \{ getErrorMessage \} from '\.\.\/utils\/errorUtils';\s*Direction,\s*MovementErrorCode,\s*ZoneQueryParams\s*\} from '\.\.\/types\/zone\.types';/,
    `import { getErrorMessage } from '../utils/errorUtils';
import {
  Direction, 
  MovementErrorCode,
  ZoneQueryParams 
} from '../types/zone.types';`
  );
  
  // Fix malformed response patterns
  content = content.replace(/\}\s*\}\);?\s*\n\s*return;/g, '});\n        return;');
  
  // Fix incomplete try-catch blocks
  content = content.replace(/\s*catch\s*\{\s*$/gm, ' catch (error) {');
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixProgressionController() {
  const filePath = 'server/src/controllers/ProgressionController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix BigInt serialization issues
  content = content.replace(
    /experience:\s*experience\.toString\(\),?\s*return;/g,
    'experience: experience.toString(),'
  );
  
  // Fix async/await patterns
  content = content.replace(/await\s+([^;\s]+)\s*return;/g, 'await $1;');
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixCharacterController() {
  const filePath = 'server/src/controllers/CharacterController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix validation response patterns
  content = content.replace(
    /details:\s*errors\.array\(\)\s*return;\s*\}\);/g,
    'details: errors.array()\n        });'
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixCombatController() {
  const filePath = 'server/src/controllers/CombatController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix Socket.io emit patterns
  content = content.replace(
    /io\.to\([^)]+\)\.emit\([^)]+\)\s*return;/g,
    (match) => match.replace(' return;', ';')
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixProgressionService() {
  const filePath = 'server/src/services/ProgressionService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix BigInt operations
  content = content.replace(/BigInt\([^)]+\)\s*return;/g, (match) => 
    match.replace(' return;', '')
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

function fixAffinityController() {
  const filePath = 'server/src/controllers/AffinityController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix specific JSON response patterns
  content = content.replace(
    /message:\s*'([^']+)'\s*\);\s*\}\);\s*return;/g,
    "message: '$1'\n        });\n        return;"
  );
  
  // Fix import statement corruption
  content = content.replace(
    /import \{ getErrorMessage \} from '\.\.\/utils\/errorUtils';\s*import \{/,
    "import { getErrorMessage } from '../utils/errorUtils';\nimport {"
  );
  
  fs.writeFileSync(filePath, content);
  return content;
}

async function main() {
  colorLog('🎯 Starting Targeted TypeScript Fixes...', 'blue');
  
  const fixes = [
    { name: 'MovementController', fn: fixMovementController },
    { name: 'ProgressionController', fn: fixProgressionController },
    { name: 'CharacterController', fn: fixCharacterController },
    { name: 'CombatController', fn: fixCombatController },
    { name: 'ProgressionService', fn: fixProgressionService },
    { name: 'AffinityController', fn: fixAffinityController }
  ];
  
  for (const fix of fixes) {
    try {
      colorLog(`🔧 Fixing ${fix.name}...`, 'yellow');
      fix.fn();
      colorLog(`✅ Fixed ${fix.name}`, 'green');
    } catch (error) {
      colorLog(`❌ Error fixing ${fix.name}: ${error.message}`, 'red');
    }
  }
  
  // Test the fixes
  colorLog('\n🔍 Testing TypeScript compilation...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      colorLog(`📊 Errors remaining: ${errorLines.length}`, errorLines.length > 100 ? 'red' : 'yellow');
      
      // Group errors by file
      const errorsByFile = {};
      errorLines.forEach(line => {
        const match = line.match(/^([^(]+)/);
        if (match) {
          const file = match[1];
          errorsByFile[file] = (errorsByFile[file] || 0) + 1;
        }
      });
      
      colorLog('\n📁 Top error files:', 'cyan');
      Object.entries(errorsByFile)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([file, count]) => {
          colorLog(`   ${count} errors: ${file}`, 'yellow');
        });
        
      if (errorLines.length <= 50) {
        colorLog('\n📝 Remaining errors:', 'yellow');
        errorLines.slice(0, 10).forEach(line => {
          colorLog(`   ${line}`, 'red');
        });
      }
    } else {
      colorLog('🎉 All TypeScript errors resolved!', 'green');
    }
  });
}

main().catch(error => {
  colorLog(`💥 Script failed: ${error.message}`, 'red');
  process.exit(1);
});