#!/usr/bin/env node

/**
 * Git Integration Demo Script
 * Demonstrates the integration between implementation tracking and Git automation
 */

const GitAutomation = require('./git-automation.js');

async function demonstrateGitIntegration() {
  console.log('🔧 Git Integration Demonstration for Aeturnis Online\n');
  
  const gitAuto = new GitAutomation();
  
  try {
    // Initialize Git repository
    console.log('1. Initializing Git repository...');
    await gitAuto.initializeGit();
    
    // Create .gitignore
    console.log('2. Creating .gitignore file...');
    gitAuto.createGitIgnore();
    
    // Show current status
    console.log('3. Checking Git status...');
    if (gitAuto.hasChanges()) {
      const changes = gitAuto.getGitStatus();
      console.log(`   Found ${changes.length} changes to commit`);
    } else {
      console.log('   Working directory is clean');
    }
    
    console.log('\n✅ Git integration is ready for use!');
    console.log('\n📋 Available Commands:');
    console.log('   node git-automation.js auto --push    # Auto-commit with report data');
    console.log('   node git-automation.js status         # Check Git status');
    console.log('   node git-automation.js dry-run        # Preview changes');
    console.log('   node track-implementation.js complete "message" --git  # Track + Git');
    
  } catch (error) {
    console.error('❌ Git integration demo failed:', error.message);
  }
}

if (require.main === module) {
  demonstrateGitIntegration();
}