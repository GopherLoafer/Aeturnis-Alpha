#!/usr/bin/env node

/**
 * Remaining TypeScript Fix Script - Final cleanup patterns
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

function fixValidationResponses(content) {
  // Fix the specific pattern: errors: errors.array() }
  content = content.replace(
    /errors:\s*errors\.array\(\)\s*\}\s*\}\);/g,
    'errors: errors.array()\n          }\n        });'
  );
  
  // Fix malformed validation error responses
  content = content.replace(
    /message:\s*'([^']+)',\s*errors:\s*errors\.array\(\)\s*\}\s*\}\);/g,
    `message: '$1',
          errors: errors.array()
        });`
  );
  
  return content;
}

function fixJSONResponses(content) {
  // Fix malformed success responses
  content = content.replace(
    /success:\s*true,\s*message:\s*'([^']+)'\s*\}\s*\);/g,
    `success: true,
        message: '$1'
      });`
  );
  
  // Fix error responses with missing structure
  content = content.replace(
    /success:\s*false,\s*message:\s*'([^']+)'\s*\}\s*\);/g,
    `success: false,
        message: '$1'
      });`
  );
  
  return content;
}

function fixAsyncPatterns(content) {
  // Fix broken async/await patterns
  content = content.replace(
    /await\s+([^;]+)\s*return;/g,
    'await $1;'
  );
  
  // Fix incomplete try-catch blocks
  content = content.replace(
    /\}\s*catch\s*\{/g,
    '    } catch (error) {'
  );
  
  return content;
}

function fixImportStatements(content) {
  // Fix any remaining corrupted imports
  content = content.replace(
    /import\s*\{\s*import\s*\{/g,
    'import {'
  );
  
  // Fix incomplete import statements
  content = content.replace(
    /\}\s*from\s*'([^']+)';\s*return;/g,
    "} from '$1';"
  );
  
  return content;
}

function fixTemplateStrings(content) {
  // Fix unterminated template literals
  content = content.replace(
    /`([^`]*)\s*return;$/gm,
    '`$1`'
  );
  
  // Fix corrupted template literal expressions
  content = content.replace(
    /\$\{([^}]*)\s*return;\s*\}/g,
    '${$1}'
  );
  
  return content;
}

function fixUniversalPatterns(content) {
  content = fixValidationResponses(content);
  content = fixJSONResponses(content);
  content = fixAsyncPatterns(content);
  content = fixImportStatements(content);
  content = fixTemplateStrings(content);
  
  // Fix any remaining `return;` artifacts
  content = content.replace(/\s*return;\s*$/gm, '');
  
  return content;
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    content = fixUniversalPatterns(content);
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      return true;
    }
    return false;
  } catch (error) {
    colorLog(`Error processing ${filePath}: ${error.message}`, 'red');
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
            entry.name !== 'node_modules') {
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
  colorLog('🔄 Processing remaining TypeScript patterns...', 'blue');
  
  const serverDir = path.join(process.cwd(), 'server');
  const tsFiles = findTsFiles(serverDir);
  
  let processedFiles = 0;
  
  for (const file of tsFiles) {
    if (processFile(file)) {
      processedFiles++;
      colorLog(`✅ ${path.relative(process.cwd(), file)}`, 'green');
    }
  }
  
  colorLog(`\n📊 Processed ${processedFiles} files`, 'cyan');
  
  // Final validation
  colorLog('\n🔍 Final TypeScript check...', 'blue');
  const { exec } = require('child_process');
  
  exec('cd server && npm run lint:ts 2>&1', (error, stdout) => {
    if (error) {
      const errorLines = stdout.split('\n').filter(line => line.includes('error TS'));
      const errorCount = errorLines.length;
      
      colorLog(`📊 Final error count: ${errorCount}`, 
        errorCount === 0 ? 'green' : 
        errorCount <= 50 ? 'yellow' : 'red'
      );
      
      if (errorCount <= 50 && errorCount > 0) {
        colorLog('\n📝 Remaining errors:', 'yellow');
        errorLines.slice(0, 10).forEach(line => {
          colorLog(`   ${line}`, 'red');
        });
      }
      
      if (errorCount <= 100) {
        // Show error types
        const errorTypes = {};
        errorLines.forEach(line => {
          const match = line.match(/error TS(\d+):/);
          if (match) {
            const code = match[1];
            errorTypes[code] = (errorTypes[code] || 0) + 1;
          }
        });
        
        if (Object.keys(errorTypes).length > 0) {
          colorLog('\n📋 Error types:', 'cyan');
          Object.entries(errorTypes)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .forEach(([code, count]) => {
              colorLog(`   TS${code}: ${count}x`, 'yellow');
            });
        }
      }
    } else {
      colorLog('🏆 All TypeScript errors resolved!', 'green');
    }
  });
}

main().catch(error => {
  colorLog(`💥 Processing failed: ${error.message}`, 'red');
  process.exit(1);
});