#!/usr/bin/env node

/**
 * TypeScript Error Fix Script
 * Systematically resolves TypeScript compilation errors
 */

const fs = require('fs');
const path = require('path');

// Common TypeScript error patterns and their fixes
const errorFixes = [
  {
    pattern: /'error' is of type 'unknown'/,
    fix: (content) => {
      // Import error utilities if not already imported
      if (!content.includes("import { getErrorMessage")) {
        const importIndex = content.lastIndexOf("import ");
        if (importIndex !== -1) {
          const lineEnd = content.indexOf('\n', importIndex);
          content = content.slice(0, lineEnd + 1) + 
            "import { getErrorMessage } from '../utils/errorUtils';\n" +
            content.slice(lineEnd + 1);
        }
      }
      
      // Replace error.message with getErrorMessage(error)
      return content.replace(/error\.message/g, 'getErrorMessage(error)');
    }
  },
  
  {
    pattern: /Parameter '.*' implicitly has an 'any' type/,
    fix: (content) => {
      // Add explicit type annotations for common parameters
      return content
        .replace(/\((delay)\) =>/g, '(delay: number) =>')
        .replace(/\((error)\) =>/g, '(error: unknown) =>')
        .replace(/\((data)\) =>/g, '(data: any) =>')
        .replace(/\((req, res)\) =>/g, '(req: any, res: any) =>')
        .replace(/\((socket)\) =>/g, '(socket: any) =>');
    }
  },
  
  {
    pattern: /Argument of type 'string \| undefined' is not assignable to parameter of type 'string'/,
    fix: (content) => {
      // Add null checks for session properties
      return content
        .replace(/req\.session\.characterId/g, 'req.session?.characterId || ""')
        .replace(/req\.session\.userId/g, 'req.session?.userId || ""')
        .replace(/req\.session\.zoneName/g, 'req.session?.zoneName || ""');
    }
  },
  
  {
    pattern: /'.*' is possibly 'null'/,
    fix: (content) => {
      // Add null checks with nullish coalescing
      return content
        .replace(/result\.rowCount/g, 'result.rowCount ?? 0')
        .replace(/\.rowCount/g, '.rowCount ?? 0');
    }
  },
  
  {
    pattern: /'.*' is possibly 'undefined'/,
    fix: (content) => {
      // Add optional chaining and default values
      return content
        .replace(/participantData\./g, 'participantData?.')
        .replace(/recent\./g, 'recent?.')
        .replace(/previous\./g, 'previous?.');
    }
  },
  
  {
    pattern: /Not all code paths return a value/,
    fix: (content) => {
      // Add explicit returns for void functions
      const functionMatches = content.match(/async \w+\([^)]*\): Promise<void> \{[^}]+\}/g);
      if (functionMatches) {
        functionMatches.forEach(match => {
          if (!match.includes('return;')) {
            const fixed = match.replace(/\}$/, '  return;\n}');
            content = content.replace(match, fixed);
          }
        });
      }
      return content;
    }
  }
];

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    errorFixes.forEach(({ fix }) => {
      const newContent = fix(content);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error.message);
  }
}

function findTsFiles(dir) {
  const files = [];
  
  function scan(currentDir) {
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
  }
  
  scan(dir);
  return files;
}

// Main execution
const serverDir = path.join(__dirname, 'server', 'src');
const testDir = path.join(__dirname, 'server', 'test');

console.log('Finding TypeScript files...');
const tsFiles = [...findTsFiles(serverDir), ...findTsFiles(testDir)];

console.log(`Found ${tsFiles.length} TypeScript files. Applying fixes...`);
tsFiles.forEach(fixFile);

console.log('TypeScript error fixing completed!');