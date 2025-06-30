#!/usr/bin/env node

/**
 * Template Literal Fix Script
 * Repairs broken template literals caused by regex replacement
 */

const fs = require('fs');
const path = require('path');

function fixTemplateLiterals(content) {
  // Fix common template literal syntax errors
  return content
    // Fix template literals with " return;" appended
    .replace(/`([^`]*)\$\{([^}]*)\s+return;\s*\}([^`]*)`/g, '`$1${$2}$3`')
    
    // Fix broken template literals in general
    .replace(/`([^`]*)\$\{([^}]*)\s+return;\s*/g, '`$1${$2}`')
    
    // Fix incomplete template literals
    .replace(/`([^`]*)\$\{([^}]*)\s*\n\s*\}`/g, '`$1${$2}`')
    
    // Fix malformed imports with "from" errors
    .replace(/import { getErrorMessage } from '\.\./utils/errorUtils';\s*from/g, "import { getErrorMessage } from '../utils/errorUtils';")
    
    // Fix broken import statements
    .replace(/import {\s*([^}]+)\s*}\s*from\s*['"]\.\./g, "import { $1 } from '../")
    
    // Fix incomplete function signatures
    .replace(/\(\s*error:\s*unknown\s*\)\s*=>/g, '(error: unknown) =>')
    
    // Fix broken class method definitions
    .replace(/(\w+)\s*\(\s*([^)]*)\)\s*:\s*([^{]+)\s*{\s*try\s*{\s*}/g, '$1($2): $3 {\n    try {')
    
    // Fix broken string interpolation
    .replace(/\$\{\s*(\w+)\s+return;\s*\}/g, '${$1}');
}

function fixFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fixed = fixTemplateLiterals(content);
    
    if (fixed !== content) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`Fixed template literals in: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error.message);
  }
}

function findTsFiles(dir) {
  const files = [];
  
  function scan(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !['node_modules', 'dist', '.git'].includes(item)) {
          scan(fullPath);
        } else if (stat.isFile() && fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      });
    } catch (error) {
      console.error(`Error scanning ${currentDir}:`, error.message);
    }
  }
  
  scan(dir);
  return files;
}

// Main execution
const serverDir = path.join(__dirname, 'server', 'src');
const testDir = path.join(__dirname, 'server', 'test');

console.log('Finding TypeScript files with template literal issues...');
const tsFiles = [...findTsFiles(serverDir), ...findTsFiles(testDir)];

console.log(`Processing ${tsFiles.length} TypeScript files...`);
tsFiles.forEach(fixFile);

console.log('Template literal fixes completed!');