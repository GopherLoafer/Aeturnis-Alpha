#!/usr/bin/env node

/**
 * Automatic Report Organization Script
 * Moves implementation reports to REPORTS folder with backup and logging
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
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

// Helper function for colored output
function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Get current timestamp for backups
function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// Main function
async function organizeReports() {
  colorLog('🔍 Searching for implementation reports...', 'blue');
  
  const reportsDir = 'REPORTS';
  const currentDir = process.cwd();
  
  try {
    // Create REPORTS directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
      colorLog('✅ Created REPORTS directory', 'green');
    }
    
    // Define report file patterns
    const patterns = [
      /.*_IMPLEMENTATION_REPORTS?\.md$/i,
      /.*Implementation Report\.md$/i,
      /.*: .*Implementation Report\.md$/i,
      /Step \d+\.\d+: .* - Implementation Report\.md$/i,
      /.*Validation Report\.md$/i
    ];
    
    // Find all files in current directory
    const files = fs.readdirSync(currentDir).filter(file => {
      return patterns.some(pattern => pattern.test(file));
    });
    
    if (files.length === 0) {
      colorLog('⚠️  No implementation reports found matching patterns:', 'yellow');
      colorLog('   - *_IMPLEMENTATION_REPORTS.md', 'yellow');
      colorLog('   - *Implementation Report.md', 'yellow');
      colorLog('   - *: *Implementation Report.md', 'yellow');
      colorLog('   - Step X.X: * - Implementation Report.md', 'yellow');
      colorLog('   - *Validation Report.md', 'yellow');
      return;
    }
    
    colorLog(`📊 Found ${files.length} implementation report(s)`, 'green');
    
    let movedCount = 0;
    let skippedCount = 0;
    
    // Process each file
    for (const file of files) {
      const sourcePath = path.join(currentDir, file);
      const destPath = path.join(reportsDir, file);
      
      colorLog(`📄 Processing: ${file}`, 'blue');
      
      try {
        // Check if file already exists in REPORTS
        if (fs.existsSync(destPath)) {
          colorLog(`⚠️  File already exists in REPORTS, creating backup...`, 'yellow');
          const timestamp = getTimestamp();
          const nameWithoutExt = path.parse(file).name;
          const ext = path.parse(file).ext;
          const backupName = `${nameWithoutExt}_backup_${timestamp}${ext}`;
          const backupPath = path.join(reportsDir, backupName);
          
          fs.renameSync(destPath, backupPath);
          colorLog(`✅ Backup created: ${backupName}`, 'green');
        }
        
        // Move the file
        fs.renameSync(sourcePath, destPath);
        colorLog(`✅ Moved to REPORTS/${file}`, 'green');
        movedCount++;
        
      } catch (error) {
        colorLog(`❌ Failed to move ${file}: ${error.message}`, 'red');
        skippedCount++;
      }
    }
    
    // Summary
    console.log('');
    colorLog(`🎉 Summary: Moved ${movedCount} reports, ${skippedCount} errors`, 'green');
    
    // Show REPORTS directory contents
    console.log('');
    colorLog('📁 REPORTS directory contents:', 'blue');
    const reportsFiles = fs.readdirSync(reportsDir)
      .filter(f => f.endsWith('.md'))
      .sort();
    
    reportsFiles.forEach(file => {
      const filePath = path.join(reportsDir, file);
      const stats = fs.statSync(filePath);
      const size = (stats.size / 1024).toFixed(1);
      const date = stats.mtime.toLocaleDateString();
      colorLog(`   📄 ${file} (${size} KB) - ${date}`, 'cyan');
    });
    
    console.log('');
    colorLog('✅ Report organization complete!', 'green');
    
    // Create index file if there are reports
    if (reportsFiles.length > 0) {
      await createReportsIndex(reportsFiles);
    }
    
  } catch (error) {
    colorLog(`❌ Error organizing reports: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Create an index file for easy navigation
async function createReportsIndex(reports) {
  const indexPath = path.join('REPORTS', 'INDEX.md');
  
  let indexContent = `# Implementation Reports Index\n\n`;
  indexContent += `Generated on: ${new Date().toISOString()}\n\n`;
  indexContent += `## Available Reports (${reports.length})\n\n`;
  
  // Group reports by type
  const categories = {
    'Step Reports': reports.filter(f => f.startsWith('Step ')),
    'Validation Reports': reports.filter(f => f.includes('Validation Report')),
    'Implementation Reports': reports.filter(f => f.includes('Implementation Report') && !f.startsWith('Step ')),
    'Other Reports': reports.filter(f => 
      !f.startsWith('Step ') && 
      !f.includes('Validation Report') && 
      !f.includes('Implementation Report')
    )
  };
  
  for (const [category, files] of Object.entries(categories)) {
    if (files.length > 0) {
      indexContent += `### ${category}\n\n`;
      files.forEach(file => {
        const filePath = path.join('REPORTS', file);
        const stats = fs.statSync(filePath);
        const size = (stats.size / 1024).toFixed(1);
        const date = stats.mtime.toLocaleDateString();
        indexContent += `- [${file}](./${file}) (${size} KB, ${date})\n`;
      });
      indexContent += '\n';
    }
  }
  
  indexContent += `## Quick Access\n\n`;
  indexContent += `- **Latest Report**: ${reports[reports.length - 1]}\n`;
  indexContent += `- **Total Reports**: ${reports.length}\n`;
  indexContent += `- **Last Updated**: ${new Date().toLocaleString()}\n\n`;
  
  indexContent += `## Usage\n\n`;
  indexContent += `This index is automatically generated by the report organization script.\n`;
  indexContent += `Click on any report name above to view its contents.\n\n`;
  
  fs.writeFileSync(indexPath, indexContent);
  colorLog('📋 Created INDEX.md for easy navigation', 'cyan');
}

// Run the script
if (require.main === module) {
  organizeReports().catch(error => {
    colorLog(`❌ Script failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { organizeReports };