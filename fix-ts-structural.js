#!/usr/bin/env node

/**
 * Structural TypeScript Fix Script - Addresses fundamental syntax corruption
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

function fixStructuralIssues(content) {
  let fixed = content;
  
  // Fix malformed method signatures with corrupted try blocks
  fixed = fixed.replace(
    /async\s+(\w+)\([^)]*\):\s*Promise<[^>]+>\s*\{\s*try\s*\{/g,
    'async $1(req: Request, res: Response): Promise<void> {\n    try {'
  );
  
  // Fix incomplete JSON responses with missing closing braces
  fixed = fixed.replace(
    /details:\s*errors\.array\(\)\s*\}\s*\}\s*\}\);/g,
    'details: errors.array()\n          }\n        });'
  );
  
  // Fix standalone closing braces after incomplete JSON
  fixed = fixed.replace(
    /details:\s*errors\.array\(\)\s*\}\s*\n\s*\}\s*\n\s*\}\);/g,
    'details: errors.array()\n          }\n        });'
  );
  
  // Fix method signatures that got corrupted
  fixed = fixed.replace(
    /async\s+(\w+)\([^)]*\):\s*Promise<[^>]+>\s*\{\s*try\s*\{/g,
    'async $1(req: AuthenticatedRequest, res: Response): Promise<void> {\n    try {'
  );
  
  // Fix corrupted catch blocks
  fixed = fixed.replace(/\}\s*catch\s*\{/g, '    } catch (error) {');
  fixed = fixed.replace(/catch\s*\(\s*\)\s*\{/g, 'catch (error) {');
  
  // Fix JSON responses with missing structure
  fixed = fixed.replace(
    /res\.status\((\d+)\)\.json\(\{\s*error:\s*\{\s*code:\s*'([^']+)',\s*message:\s*'([^']+)'\s*\}\s*\}\);/g,
    `res.status($1).json({
        success: false,
        error: {
          code: '$2',
          message: '$3'
        }
      });`
  );
  
  return fixed;
}

function fixProgressionController() {
  const filePath = 'server/src/controllers/ProgressionController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix specific malformed validation response
  content = content.replace(
    /message:\s*'Invalid input data',\s*details:\s*errors\.array\(\)\s*\}\s*\}\s*\}\);/,
    `message: 'Invalid input data',
            details: errors.array()
          }
        });`
  );
  
  // Fix the malformed getCharacterProgression method
  content = content.replace(
    /async getCharacterProgression\(req: Request, res: Response\): Promise<void> \{ try \{/,
    `async getCharacterProgression(req: Request, res: Response): Promise<void> {
    try {`
  );
  
  // Fix broken character ID validation response
  content = content.replace(
    /message:\s*'Invalid character ID',\s*details:\s*errors\.array\(\)\s*\}\s*\}\s*\}\);/,
    `message: 'Invalid character ID',
            details: errors.array()
          }
        });`
  );
  
  content = fixStructuralIssues(content);
  fs.writeFileSync(filePath, content);
  return 'ProgressionController fixed';
}

function fixCharacterController() {
  const filePath = 'server/src/controllers/CharacterController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  content = fixStructuralIssues(content);
  
  // Fix specific character controller patterns
  content = content.replace(
    /validation middleware for character creation/g,
    'Validation middleware for character creation'
  );
  
  fs.writeFileSync(filePath, content);
  return 'CharacterController fixed';
}

function fixCombatController() {
  const filePath = 'server/src/controllers/CombatController.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  content = fixStructuralIssues(content);
  
  // Fix Socket.io emit calls that got corrupted
  content = content.replace(
    /io\.to\(`combat_(\$\{sessionId\})`\)\.emit\('([^']+)',\s*\{[^}]*\}\);/g,
    (match, event) => {
      return `io.to(\`combat_\${sessionId}\`).emit('${event}', {
        success: true,
        data: result
      });`;
    }
  );
  
  fs.writeFileSync(filePath, content);
  return 'CombatController fixed';
}

function fixProgressionService() {
  const filePath = 'server/src/services/ProgressionService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Fix BigInt operations that got corrupted
  content = content.replace(/BigInt\(([^)]+)\)\s*return;/g, 'BigInt($1)');
  content = content.replace(/experience:\s*([^,\s]+)\.toString\(\)\s*return;/g, 'experience: $1.toString(),');
  
  content = fixStructuralIssues(content);
  fs.writeFileSync(filePath, content);
  return 'ProgressionService fixed';
}

function fixCombatService() {
  const filePath = 'server/src/services/CombatService.ts';
  let content = fs.readFileSync(filePath, 'utf-8');
  
  content = fixStructuralIssues(content);
  
  // Fix combat calculation methods
  content = content.replace(
    /Math\.max\(1,\s*\([^)]+\)\s*\*\s*([^)]+)\)\s*return;/g,
    'Math.max(1, ($1) * $2)'
  );
  
  fs.writeFileSync(filePath, content);
  return 'CombatService fixed';
}

async function main() {
  colorLog('🏗️  Starting Structural TypeScript Fixes...', 'blue');
  
  const fixes = [
    { name: 'ProgressionController', fn: fixProgressionController },
    { name: 'CharacterController', fn: fixCharacterController },
    { name: 'CombatController', fn: fixCombatController },
    { name: 'ProgressionService', fn: fixProgressionService },
    { name: 'CombatService', fn: fixCombatService }
  ];
  
  for (const fix of fixes) {
    try {
      colorLog(`🔧 ${fix.name}...`, 'yellow');
      const result = fix.fn();
      colorLog(`✅ ${result}`, 'green');
    } catch (error) {
      colorLog(`❌ Error fixing ${fix.name}: ${error.message}`, 'red');
    }
  }
  
  // Test compilation
  colorLog('\n🔍 Testing TypeScript compilation...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      colorLog(`📊 Errors remaining: ${errorLines.length}`, 'cyan');
      
      if (errorLines.length <= 200) {
        // Group by error type
        const errorTypes = {};
        errorLines.forEach(line => {
          const match = line.match(/error TS(\d+):/);
          if (match) {
            const code = match[1];
            errorTypes[code] = (errorTypes[code] || 0) + 1;
          }
        });
        
        colorLog('\n📋 Error types:', 'cyan');
        Object.entries(errorTypes)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .forEach(([code, count]) => {
            colorLog(`   TS${code}: ${count} occurrences`, 'yellow');
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