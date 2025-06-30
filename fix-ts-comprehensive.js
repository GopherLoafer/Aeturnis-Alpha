#!/usr/bin/env node

/**
 * Comprehensive TypeScript Error Fix Script
 * Systematically resolves template literal corruption and other TS issues
 */

const fs = require('fs');
const path = require('path');

function colorLog(message, color = 'reset') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Pattern fixes for corrupted code
const fixes = [
  // Fix corrupted template literals
  {
    pattern: /\$\{([^}]*?)\s+return;\s*\n?\s*\}/g,
    replacement: '${$1}',
    description: 'Fix corrupted template literals with return statement'
  },
  
  // Fix JSON object syntax with corrupted return statements
  {
    pattern: /(\s+details:\s+errors\.array\(\))\s+return;\s*\n\s*\}\);/g,
    replacement: '$1\n        });',
    description: 'Fix validation error JSON syntax'
  },
  
  // Fix corrupted if conditions
  {
    pattern: /\|\|\s*""\s*!==\s*/g,
    replacement: '!== ',
    description: 'Fix corrupted comparison operators'
  },
  
  // Fix broken imports
  {
    pattern: /import\s*\{\s*import\s*\{/g,
    replacement: 'import {',
    description: 'Fix corrupted import statements'
  },
  
  // Fix template literal expressions
  {
    pattern: /\$\{([^}]*?)\s+return;\s*$/gm,
    replacement: '${$1}',
    description: 'Fix template literal expressions at end of line'
  },
  
  // Fix malformed backticks in template literals
  {
    pattern: /`([^`]*?)\s+return;\s*$/gm,
    replacement: '`$1`',
    description: 'Fix incomplete template literals'
  },
  
  // Fix logging statements
  {
    pattern: /this\.logger\.(info|warn|error)\(\s*`([^`]*?)\s+return;\s*$/gm,
    replacement: 'this.logger.$1(`$2`);',
    description: 'Fix corrupted logging statements'
  },
  
  // Fix error messages
  {
    pattern: /throw new Error\(\s*`([^`]*?)\s+return;\s*$/gm,
    replacement: 'throw new Error(`$1`);',
    description: 'Fix corrupted error messages'
  }
];

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let changesMade = 0;

    // Apply all fixes
    fixes.forEach(fix => {
      const matches = content.match(fix.pattern);
      if (matches) {
        content = content.replace(fix.pattern, fix.replacement);
        changesMade += matches.length;
        colorLog(`  ✓ ${fix.description}: ${matches.length} fixes`, 'green');
      }
    });

    // Additional manual fixes for specific patterns
    
    // Fix broken method calls with missing closing
    content = content.replace(/(\w+\([^)]*)\s+return;\s*$/gm, '$1);');
    
    // Fix broken object destructuring
    content = content.replace(/\{\s*([^}]*?)\s+return;\s*$/gm, '{ $1 }');
    
    // Fix broken array access
    content = content.replace(/\[[^\]]*?\s+return;\s*$/gm, ']');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      colorLog(`✅ Fixed ${filePath} (${changesMade} changes)`, 'green');
      return true;
    } else {
      colorLog(`ℹ️  No changes needed for ${filePath}`, 'cyan');
      return false;
    }
  } catch (error) {
    colorLog(`❌ Error fixing ${filePath}: ${error.message}`, 'red');
    return false;
  }
}

function findTsFiles(dir) {
  const tsFiles = [];
  
  function scan(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory() && 
            !entry.name.startsWith('.') && 
            entry.name !== 'node_modules' &&
            entry.name !== 'dist' &&
            entry.name !== 'build') {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          tsFiles.push(fullPath);
        }
      }
    } catch (error) {
      colorLog(`Warning: Cannot read directory ${currentDir}: ${error.message}`, 'yellow');
    }
  }
  
  scan(dir);
  return tsFiles;
}

async function main() {
  colorLog('🔧 Starting Comprehensive TypeScript Fix...', 'blue');
  
  const serverDir = path.join(process.cwd(), 'server');
  const tsFiles = findTsFiles(serverDir);
  
  colorLog(`📁 Found ${tsFiles.length} TypeScript files`, 'cyan');
  
  let fixedFiles = 0;
  let totalErrors = 0;
  
  for (const file of tsFiles) {
    colorLog(`\n🔍 Processing: ${path.relative(process.cwd(), file)}`, 'yellow');
    if (fixFile(file)) {
      fixedFiles++;
    }
  }
  
  colorLog('\n📋 Summary:', 'blue');
  colorLog(`✅ Files processed: ${tsFiles.length}`, 'green');
  colorLog(`🔧 Files fixed: ${fixedFiles}`, 'green');
  
  // Run TypeScript check
  colorLog('\n🔍 Running TypeScript validation...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout, stderr) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      colorLog(`❌ TypeScript errors remaining: ${errorLines.length}`, 'red');
      
      if (errorLines.length > 0) {
        colorLog('\n📝 Top remaining errors:', 'yellow');
        errorLines.slice(0, 10).forEach(line => {
          colorLog(`   ${line}`, 'red');
        });
      }
    } else {
      colorLog('✅ All TypeScript errors resolved!', 'green');
    }
  });
}

main().catch(error => {
  colorLog(`❌ Script failed: ${error.message}`, 'red');
  process.exit(1);
});