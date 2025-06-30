/**
 * Simple Auto-Organize Script for Implementation Reports
 * Can be added to package.json scripts or run directly
 */

const fs = require('fs');
const path = require('path');

function autoOrganizeReports() {
  console.log('🔄 Auto-organizing reports...');
  
  // Create REPORTS directory
  if (!fs.existsSync('REPORTS')) {
    fs.mkdirSync('REPORTS');
    console.log('✅ Created REPORTS directory');
  }
  
  // Find implementation reports
  const files = fs.readdirSync('.')
    .filter(file => 
      file.includes('Implementation Report.md') ||
      file.includes('_IMPLEMENTATION_REPORTS.md') ||
      file.includes('Validation Report.md') ||
      file.startsWith('_implementation_report_') ||
      /Step \d+\.\d+: .* - Implementation Report\.md/.test(file)
    );
  
  if (files.length === 0) {
    console.log('ℹ️  No reports found to organize');
    return;
  }
  
  console.log(`📊 Found ${files.length} reports to organize`);
  
  // Move files
  files.forEach(file => {
    const dest = path.join('REPORTS', file);
    
    // Handle existing files
    if (fs.existsSync(dest)) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const backup = dest.replace('.md', `_backup_${timestamp}.md`);
      fs.renameSync(dest, backup);
      console.log(`🔄 Backed up existing: ${path.basename(backup)}`);
    }
    
    fs.renameSync(file, dest);
    console.log(`✅ Moved: ${file}`);
  });
  
  console.log(`🎉 Organized ${files.length} reports into REPORTS folder`);
}

// Run if called directly
if (require.main === module) {
  try {
    autoOrganizeReports();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = autoOrganizeReports;