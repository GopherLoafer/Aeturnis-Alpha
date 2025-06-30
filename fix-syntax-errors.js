#!/usr/bin/env node

/**
 * Comprehensive Syntax Error Fix - Targets TS1005, TS1434, TS1128 errors
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

function fixSyntaxErrors(content, filePath) {
  let fixed = content;
  let changes = 0;
  
  // Fix TS1005: ';' expected errors
  
  // Fix missing semicolons after method calls
  fixed = fixed.replace(/(\w+\([^)]*\))\s*$/gm, '$1;');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix missing semicolons after assignments
  fixed = fixed.replace(/^(\s*const\s+\w+\s*=\s*[^;]+)$/gm, '$1;');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix missing semicolons after variable declarations
  fixed = fixed.replace(/^(\s*let\s+\w+\s*=\s*[^;]+)$/gm, '$1;');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix TS1434: Unexpected keyword or identifier
  
  // Fix malformed async function declarations
  fixed = fixed.replace(/async\s+(\w+)\s*\(/g, 'async $1(');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix broken method signatures
  fixed = fixed.replace(/(\w+)\s*:\s*Promise<void>\s*\{\s*try\s*\{/g, '$1(): Promise<void> {\n    try {');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix TS1128: Declaration or statement expected
  
  // Fix malformed imports
  fixed = fixed.replace(/import\s*\{\s*import\s*\{([^}]+)\}\s*from/g, 'import { $1 } from');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix incomplete class methods
  fixed = fixed.replace(/(\s+)(async\s+)?(\w+)\s*\([^)]*\)\s*:\s*Promise<[^>]+>\s*\{$/gm, '$1$2$3(req: Request, res: Response): Promise<void> {');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix TS1109: Expression expected
  
  // Fix incomplete expressions in template literals
  fixed = fixed.replace(/\$\{\s*\}/g, '${undefined}');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix broken object properties
  fixed = fixed.replace(/(\w+):\s*,/g, '$1: undefined,');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix TS1003: Identifier expected
  
  // Fix reserved word usage
  fixed = fixed.replace(/(\s+)true:\s*/g, '$1\'true\': ');
  fixed = fixed.replace(/(\s+)false:\s*/g, '$1\'false\': ');
  if (fixed !== content) { changes++; content = fixed; }
  
  // General structural fixes
  
  // Fix broken JSON responses (common pattern causing many errors)
  fixed = fixed.replace(/(\s+)(success|error):\s*([^,}\s]+)\s*([,}])/g, '$1$2: $3$4');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix incomplete try-catch blocks
  fixed = fixed.replace(/\}\s*catch\s*\{/g, '    } catch (error) {');
  if (fixed !== content) { changes++; content = fixed; }
  
  // Fix malformed function parameters
  fixed = fixed.replace(/\(\s*req:\s*AuthenticatedRequest\s*,\s*res:\s*Response\s*\):\s*Promise<void>\s*\{/g, '(req: AuthenticatedRequest, res: Response): Promise<void> {');
  if (fixed !== content) { changes++; content = fixed; }
  
  return { content: fixed, changes };
}

function processFile(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, 'utf-8');
    const result = fixSyntaxErrors(originalContent, filePath);
    
    if (result.changes > 0) {
      fs.writeFileSync(filePath, result.content);
      return result.changes;
    }
    return 0;
  } catch (error) {
    colorLog(`Error processing ${filePath}: ${error.message}`, 'red');
    return 0;
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
            entry.name !== 'dist') {
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          tsFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }
  }
  
  scan(dir);
  return tsFiles;
}

async function main() {
  colorLog('⚡ Fixing syntax errors (TS1005, TS1434, TS1128)...', 'blue');
  
  const serverDir = path.join(process.cwd(), 'server');
  const tsFiles = findTsFiles(serverDir);
  
  let totalChanges = 0;
  let processedFiles = 0;
  
  for (const file of tsFiles) {
    const changes = processFile(file);
    if (changes > 0) {
      processedFiles++;
      totalChanges += changes;
      colorLog(`✅ ${path.relative(process.cwd(), file)} (${changes} fixes)`, 'green');
    }
  }
  
  colorLog(`\n📊 Fixed ${processedFiles} files with ${totalChanges} changes`, 'cyan');
  
  // Validate results
  colorLog('\n🔍 Validating syntax fixes...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      const currentErrors = errorLines.length;
      
      // Count specific error types
      const ts1005 = errorLines.filter(line => line.includes('TS1005')).length;
      const ts1434 = errorLines.filter(line => line.includes('TS1434')).length;
      const ts1128 = errorLines.filter(line => line.includes('TS1128')).length;
      
      colorLog(`Errors remaining: ${currentErrors}`, currentErrors <= 500 ? 'yellow' : 'red');
      colorLog(`  TS1005 (';' expected): ${ts1005}`, ts1005 <= 100 ? 'green' : 'yellow');
      colorLog(`  TS1434 (Unexpected keyword): ${ts1434}`, ts1434 <= 50 ? 'green' : 'yellow');
      colorLog(`  TS1128 (Declaration expected): ${ts1128}`, ts1128 <= 30 ? 'green' : 'yellow');
      
    } else {
      colorLog('🎉 All TypeScript errors resolved!', 'green');
    }
  });
}

main().catch(error => {
  colorLog(`Syntax fix failed: ${error.message}`, 'red');
  process.exit(1);
});