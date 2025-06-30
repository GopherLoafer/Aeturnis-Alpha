#!/usr/bin/env node

/**
 * Implementation Report Generator
 * Automatically creates comprehensive implementation reports after task completion
 * Designed for step-by-step development workflows
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  watchFiles: ['.', 'server', 'client', 'shared'],
  excludePatterns: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '*.log',
    '.env',
    'package-lock.json'
  ],
  reportTemplate: 'IMPLEMENTATION_REPORT_TEMPLATE.md'
};

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getTimestamp() {
  return new Date().toISOString();
}

function formatDuration(startTime, endTime) {
  const duration = Math.round((endTime - startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

class ImplementationReportGenerator {
  constructor() {
    this.startTime = Date.now();
    this.initialState = this.captureProjectState();
    this.taskTitle = '';
    this.taskDescription = '';
    this.requirements = [];
  }

  // Parse step title from prompt or context
  parseStepTitle(input) {
    const stepMatch = input.match(/### (Step \d+\.\d+: [^#\n]+)/);
    if (stepMatch) {
      this.taskTitle = stepMatch[1].trim();
      return true;
    }
    
    // Alternative patterns
    const altMatch = input.match(/^(Step \d+\.\d+: [^\n]+)/m);
    if (altMatch) {
      this.taskTitle = altMatch[1].trim();
      return true;
    }
    
    return false;
  }

  // Extract requirements from prompt
  parseRequirements(input) {
    const lines = input.split('\n');
    let inRequirements = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Start capturing after title
      if (trimmed.startsWith('###') || trimmed.startsWith('Step')) {
        inRequirements = true;
        continue;
      }
      
      // Stop at next section or code block
      if (trimmed.startsWith('###') || trimmed.startsWith('```')) {
        break;
      }
      
      // Capture bullet points
      if (inRequirements && (trimmed.startsWith('-') || trimmed.startsWith('*'))) {
        this.requirements.push(trimmed.substring(1).trim());
      }
    }
  }

  // Capture current project state
  captureProjectState() {
    const state = {
      timestamp: getTimestamp(),
      files: new Map(),
      packages: this.getPackageInfo(),
      environment: this.getEnvironmentInfo(),
      database: this.getDatabaseInfo()
    };

    // Scan for files
    this.scanDirectory('.', state.files);
    
    return state;
  }

  scanDirectory(dir, fileMap, depth = 0) {
    if (depth > 3) return; // Limit recursion depth
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        // Skip excluded patterns
        if (CONFIG.excludePatterns.some(pattern => {
          if (pattern.includes('*')) {
            return item.match(new RegExp(pattern.replace('*', '.*')));
          }
          return item === pattern;
        })) {
          continue;
        }
        
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          this.scanDirectory(fullPath, fileMap, depth + 1);
        } else {
          fileMap.set(fullPath, {
            size: stat.size,
            modified: stat.mtime,
            created: stat.birthtime || stat.mtime
          });
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  getPackageInfo() {
    try {
      if (fs.existsSync('package.json')) {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        return {
          name: pkg.name || 'Unknown',
          version: pkg.version || '1.0.0',
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {}),
          scripts: Object.keys(pkg.scripts || {})
        };
      }
    } catch (error) {
      // Package.json not found or invalid
    }
    return null;
  }

  getEnvironmentInfo() {
    const envVars = [];
    const commonEnvVars = [
      'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'PORT',
      'NODE_ENV', 'API_KEY', 'SECRET_KEY'
    ];
    
    for (const envVar of commonEnvVars) {
      if (process.env[envVar]) {
        envVars.push(envVar);
      }
    }
    
    return envVars;
  }

  getDatabaseInfo() {
    const info = {
      postgresql: false,
      redis: false,
      tables: []
    };
    
    // Check for database connections
    if (process.env.DATABASE_URL) {
      info.postgresql = true;
    }
    
    if (process.env.REDIS_URL) {
      info.redis = true;
    }
    
    return info;
  }

  // Compare states to identify changes
  compareStates(initial, final) {
    const changes = {
      filesCreated: [],
      filesModified: [],
      filesDeleted: [],
      packagesAdded: [],
      packagesRemoved: [],
      environmentAdded: []
    };

    // Compare files
    for (const [filepath, info] of final.files) {
      if (!initial.files.has(filepath)) {
        changes.filesCreated.push({ path: filepath, ...info });
      } else {
        const initialInfo = initial.files.get(filepath);
        if (info.modified > initialInfo.modified) {
          changes.filesModified.push({ path: filepath, ...info });
        }
      }
    }

    // Find deleted files
    for (const filepath of initial.files.keys()) {
      if (!final.files.has(filepath)) {
        changes.filesDeleted.push(filepath);
      }
    }

    // Compare packages
    if (initial.packages && final.packages) {
      const initialDeps = new Set([
        ...initial.packages.dependencies,
        ...initial.packages.devDependencies
      ]);
      const finalDeps = new Set([
        ...final.packages.dependencies,
        ...final.packages.devDependencies
      ]);

      for (const dep of finalDeps) {
        if (!initialDeps.has(dep)) {
          changes.packagesAdded.push(dep);
        }
      }

      for (const dep of initialDeps) {
        if (!finalDeps.has(dep)) {
          changes.packagesRemoved.push(dep);
        }
      }
    }

    // Compare environment variables
    const initialEnv = new Set(initial.environment);
    const finalEnv = new Set(final.environment);
    
    for (const envVar of finalEnv) {
      if (!initialEnv.has(envVar)) {
        changes.environmentAdded.push(envVar);
      }
    }

    return changes;
  }

  // Generate the implementation report
  generateReport(prompt = '') {
    const endTime = Date.now();
    const finalState = this.captureProjectState();
    const changes = this.compareStates(this.initialState, finalState);
    
    // Parse prompt if provided
    if (prompt) {
      this.parseStepTitle(prompt);
      this.parseRequirements(prompt);
    }

    // Generate report content
    const report = this.buildReportContent(changes, endTime);
    
    // Save report
    const filename = this.generateFilename();
    fs.writeFileSync(filename, report);
    
    colorLog(`✅ Implementation report generated: ${filename}`, 'green');
    return filename;
  }

  buildReportContent(changes, endTime) {
    const duration = formatDuration(this.startTime, endTime);
    const timestamp = new Date().toLocaleString();
    
    let report = `# ${this.taskTitle || 'Implementation Report'}\n\n`;
    
    // Header information
    report += `**Generated:** ${timestamp}\n`;
    report += `**Duration:** ${duration}\n`;
    report += `**Status:** Completed\n\n`;
    
    // Task overview
    if (this.requirements.length > 0) {
      report += `## Task Requirements\n\n`;
      this.requirements.forEach(req => {
        report += `- ✅ ${req}\n`;
      });
      report += `\n`;
    }
    
    // Files section
    if (changes.filesCreated.length > 0) {
      report += `## Files Created (${changes.filesCreated.length})\n\n`;
      changes.filesCreated.forEach(file => {
        const size = (file.size / 1024).toFixed(1);
        report += `- \`${file.path}\` (${size} KB)\n`;
      });
      report += `\n`;
    }
    
    if (changes.filesModified.length > 0) {
      report += `## Files Modified (${changes.filesModified.length})\n\n`;
      changes.filesModified.forEach(file => {
        const size = (file.size / 1024).toFixed(1);
        report += `- \`${file.path}\` (${size} KB)\n`;
      });
      report += `\n`;
    }
    
    // Dependencies section
    if (changes.packagesAdded.length > 0) {
      report += `## Dependencies Added (${changes.packagesAdded.length})\n\n`;
      changes.packagesAdded.forEach(pkg => {
        report += `- ${pkg}\n`;
      });
      report += `\n`;
    }
    
    // Environment section
    if (changes.environmentAdded.length > 0) {
      report += `## Environment Variables Configured\n\n`;
      changes.environmentAdded.forEach(env => {
        report += `- ${env}\n`;
      });
      report += `\n`;
    }
    
    // Project structure
    report += `## Project Structure\n\n`;
    report += this.generateProjectTree();
    report += `\n`;
    
    // Summary
    report += `## Implementation Summary\n\n`;
    report += `- **Files Created:** ${changes.filesCreated.length}\n`;
    report += `- **Files Modified:** ${changes.filesModified.length}\n`;
    report += `- **Dependencies Added:** ${changes.packagesAdded.length}\n`;
    report += `- **Environment Variables:** ${changes.environmentAdded.length}\n`;
    report += `- **Implementation Time:** ${duration}\n\n`;
    
    // Validation
    report += `## Validation Results\n\n`;
    report += this.generateValidationSection();
    
    return report;
  }

  generateProjectTree() {
    const tree = [];
    const processedDirs = new Set();
    
    // Get all file paths and sort them
    const files = Array.from(this.captureProjectState().files.keys())
      .filter(f => !f.includes('node_modules'))
      .sort();
    
    for (const file of files) {
      const parts = file.split(path.sep);
      let currentPath = '';
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const indent = '  '.repeat(i);
        
        currentPath = i === 0 ? part : path.join(currentPath, part);
        
        if (isLast) {
          // It's a file
          tree.push(`${indent}├── ${part}`);
        } else if (!processedDirs.has(currentPath)) {
          // It's a directory we haven't seen yet
          tree.push(`${indent}├── ${part}/`);
          processedDirs.add(currentPath);
        }
      }
    }
    
    return tree.slice(0, 50).join('\n') + (tree.length > 50 ? '\n... (truncated)' : '');
  }

  generateValidationSection() {
    let validation = '';
    
    // Check basic project structure
    const hasPackageJson = fs.existsSync('package.json');
    const hasServerDir = fs.existsSync('server');
    const hasClientDir = fs.existsSync('client');
    const hasSharedDir = fs.existsSync('shared');
    
    validation += `- **Package.json:** ${hasPackageJson ? '✅ Present' : '❌ Missing'}\n`;
    validation += `- **Server Directory:** ${hasServerDir ? '✅ Present' : '❌ Missing'}\n`;
    validation += `- **Client Directory:** ${hasClientDir ? '✅ Present' : '❌ Missing'}\n`;
    validation += `- **Shared Directory:** ${hasSharedDir ? '✅ Present' : '❌ Missing'}\n`;
    
    // Check environment variables
    const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
    validation += `- **Environment Variables:**\n`;
    requiredEnvVars.forEach(envVar => {
      const exists = process.env[envVar] ? '✅' : '❌';
      validation += `  - ${envVar}: ${exists}\n`;
    });
    
    return validation;
  }

  generateFilename() {
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-');
    const title = this.taskTitle
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase();
    
    return `${title}_implementation_report_${timestamp}.md`;
  }
}

// CLI Interface
function main() {
  const args = process.argv.slice(2);
  const generator = new ImplementationReportGenerator();
  
  colorLog('🚀 Starting implementation report generation...', 'blue');
  
  // Check for prompt file or stdin
  let prompt = '';
  
  if (args.length > 0) {
    // Read from file
    const promptFile = args[0];
    if (fs.existsSync(promptFile)) {
      prompt = fs.readFileSync(promptFile, 'utf8');
      colorLog(`📄 Reading prompt from: ${promptFile}`, 'cyan');
    }
  } else {
    // Try to read from stdin if available
    try {
      prompt = fs.readFileSync(0, 'utf8'); // stdin
    } catch (error) {
      // No stdin input
    }
  }
  
  // Generate report
  const reportFile = generator.generateReport(prompt);
  
  colorLog('📊 Report generation completed!', 'green');
  colorLog(`📁 Report saved as: ${reportFile}`, 'cyan');
  
  // Auto-organize reports
  try {
    const autoOrganize = require('./auto-organize.js');
    autoOrganize();
  } catch (error) {
    // Auto-organize not available
    colorLog('💡 Tip: Run auto-organize.js to organize reports into REPORTS folder', 'yellow');
  }
}

// Export for use as module
module.exports = ImplementationReportGenerator;

// Run if called directly
if (require.main === module) {
  main();
}