#!/usr/bin/env node

/**
 * TypeScript Error Fix Script - Comprehensive Edition
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
  
  return content;
}

function fixImportPaths(content) {
  // Fix malformed import statements with proper escaping
  content = content.replace(/import { getErrorMessage } from '\.\.\/utils\/errorUtils';\s*from/g, "import { getErrorMessage } from '../utils/errorUtils';");
  
  // Fix path-mapping issues
  content = content.replace(/from '@\/([^']+)'/g, "from '../$1'");
  content = content.replace(/from '@shared\/([^']+)'/g, "from '../../shared/$1'");
  
  return content;
}

function fixOtherSyntaxIssues(content) {
  // Fix unterminated template literals at end of files
  content = content.replace(/`[^`]*$/g, '');
  
  // Fix missing semicolons after template literals
  content = content.replace(/`([^`]*)`(?=\s*$)/gm, '`$1`;');
  
  // Fix broken object syntax
  content = content.replace(/,\s*}/g, '}');
  
  return content;
}

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Apply fixes
    content = fixTemplateStrings(content);
    content = fixImportPaths(content);
    content = fixOtherSyntaxIssues(content);
    
    // Only write if changes were made
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
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
      
      if (stat.isDirectory() && item !== 'node_modules' && item !== '.git') {
        scan(fullPath);
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.js'))) {
        files.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return files;
}

async function main() {
  colorLog('🔧 Starting TypeScript Error Fix Script', 'cyan');
  
  const serverDir = './server/src';
  const tsFiles = findTsFiles(serverDir);
  
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
    execSync('cd server && npx tsc --noEmit', { stdio: 'pipe' });
    colorLog('✅ TypeScript check passed!', 'green');
  } catch (error) {
    colorLog('⚠️  TypeScript errors remain, manual fixes needed', 'yellow');
    console.log(error.stdout?.toString() || '');
  }
}

if (require.main === module) {
  main().catch(console.error);
}