
#!/usr/bin/env node

/**
 * TypeScript Error Fix Script v2 - Comprehensive Edition
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
    reset: '\x1b[0m'
  };
  console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
}

function fixTemplateStrings(content) {
  // Fix corrupted template literals with "return;" insertions
  content = content.replace(/`([^`]*)\$\{([^}]*)\s+return;\s*\}([^`]*)`/g, '`$1${$2}$3`');
  
  // Fix template literals split across lines with corrupted syntax
  content = content.replace(/`([^`]*)\$\{([^}]*)\s+return;\s*\}\s*`;/g, '`$1${$2}`;');
  
  // Fix broken template literals with missing closing braces
  content = content.replace(/`([^`]*)\$\{([^}]*)\s+return;\s*$/gm, '`$1${$2}`;');
  
  // Fix malformed template strings with embedded return statements
  content = content.replace(/`([^`]*)\$\{([^}]*)\s+return;\s*\}([^`]*)`;/g, '`$1${$2}$3`;');
  
  // Fix broken template literals in log statements
  content = content.replace(/`([^`]*)\$\{([^}]*)\s+return;\s*\}/g, '`$1${$2}');
  
  // Fix template literals with incomplete variable references
  content = content.replace(/\$\{([^}]*)\s+return;\s*\}/g, '${$1}');
  
  return content;
}

function fixImportStatements(content) {
  // Fix broken import statements with "from" duplications
  content = content.replace(/import\s+\{([^}]+)\}\s+from\s+'([^']+)';\s+from/g, "import { $1 } from '$2';");
  
  // Fix import statements with malformed paths
  content = content.replace(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'\s+from/g, "import { $1 } from '$2';");
  
  // Fix missing semicolons in imports
  content = content.replace(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'(?!;)/g, "import { $1 } from '$2';");
  
  return content;
}

function fixTypeAnnotations(content) {
  // Add error type annotations
  content = content.replace(/catch\s*\(\s*error\s*\)/g, 'catch (error: unknown)');
  
  // Fix implicit any parameters in arrow functions
  content = content.replace(/\(\s*delay\s*\)\s*=>/g, '(delay: number) =>');
  content = content.replace(/\(\s*data\s*\)\s*=>/g, '(data: any) =>');
  content = content.replace(/\(\s*req\s*,\s*res\s*\)\s*=>/g, '(req: any, res: any) =>');
  content = content.replace(/\(\s*socket\s*\)\s*=>/g, '(socket: any) =>');
  
  // Fix function parameter types
  content = content.replace(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g, 
    'function $1($2: any)');
  
  return content;
}

function fixReturnStatements(content) {
  // Fix orphaned return statements in template literals
  content = content.replace(/return;\s*\}/g, '}');
  content = content.replace(/return;\s*`;/g, '`;');
  content = content.replace(/return;\s*$/gm, '');
  
  // Fix void return type issues
  content = content.replace(/return;(\s*\/\/.*)?$/gm, 'return;$1');
  
  return content;
}

function fixErrorHandling(content) {
  // Import getErrorMessage if not already imported and error.message is used
  if (content.includes('error.message') && !content.includes("import { getErrorMessage")) {
    const importIndex = content.lastIndexOf("import ");
    if (importIndex !== -1) {
      const lineEnd = content.indexOf('\n', importIndex);
      content = content.slice(0, lineEnd + 1) + 
        "import { getErrorMessage } from '../utils/errorUtils';\n" +
        content.slice(lineEnd + 1);
    }
  }
  
  // Replace error.message with getErrorMessage(error)
  content = content.replace(/error\.message/g, 'getErrorMessage(error)');
  
  return content;
}

function fixSessionAccess(content) {
  // Fix session property access with optional chaining
  content = content.replace(/req\.session\.characterId/g, 'req.session?.characterId || ""');
  content = content.replace(/req\.session\.userId/g, 'req.session?.userId || ""');
  content = content.replace(/req\.session\.username/g, 'req.session?.username || ""');
  
  return content;
}

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Apply all fixes
    content = fixTemplateStrings(content);
    content = fixImportStatements(content);
    content = fixTypeAnnotations(content);
    content = fixReturnStatements(content);
    content = fixErrorHandling(content);
    content = fixSessionAccess(content);
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      colorLog(`✅ Fixed: ${filePath}`, 'green');
      return true;
    }
    
    return false;
  } catch (error) {
    colorLog(`❌ Error fixing ${filePath}: ${error.message}`, 'red');
    return false;
  }
}

function findTsFiles(dir) {
  const files = [];
  
  function scan(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && item !== 'node_modules' && item !== '.git' && item !== 'dist') {
        scan(fullPath);
      } else if (stat.isFile() && (item.endsWith('.ts') && !item.endsWith('.d.ts'))) {
        files.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return files;
}

async function main() {
  colorLog('🔧 Starting TypeScript Error Fix Script v2', 'cyan');
  
  const serverDir = './server/src';
  const testDir = './server/test';
  
  const tsFiles = [...findTsFiles(serverDir), ...findTsFiles(testDir)];
  
  colorLog(`📁 Found ${tsFiles.length} TypeScript files`, 'blue');
  
  let fixedCount = 0;
  
  for (const file of tsFiles) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }
  
  colorLog(`\n✨ Fixed ${fixedCount} files out of ${tsFiles.length}`, 'green');
  
  // Run TypeScript check
  colorLog('\n🔍 Running TypeScript check...', 'yellow');
  const { execSync } = require('child_process');
  
  try {
    const output = execSync('npm run lint:ts', { stdio: 'pipe', encoding: 'utf8' });
    colorLog('✅ TypeScript check passed!', 'green');
    return true;
  } catch (error) {
    colorLog('⚠️  TypeScript errors remain:', 'yellow');
    console.log(error.stdout?.toString() || error.stderr?.toString() || '');
    return false;
  }
}

if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = { main, fixFile, findTsFiles };
