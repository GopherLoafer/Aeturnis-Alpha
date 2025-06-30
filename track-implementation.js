#!/usr/bin/env node

/**
 * Implementation Tracking Wrapper
 * Simplifies the process of tracking and reporting implementation progress
 * Designed specifically for prompt-driven development workflows
 */

const fs = require('fs');
const ImplementationReportGenerator = require('./generate-implementation-report.js');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

class ImplementationTracker {
  constructor() {
    this.generator = null;
    this.sessionFile = '.implementation-session.json';
  }

  // Start tracking a new implementation
  start(prompt = '') {
    colorLog('🎯 Starting implementation tracking...', 'blue');
    
    this.generator = new ImplementationReportGenerator();
    
    // Parse and store prompt information
    if (prompt) {
      this.generator.parseStepTitle(prompt);
      this.generator.parseRequirements(prompt);
      
      if (this.generator.taskTitle) {
        colorLog(`📋 Tracking: ${this.generator.taskTitle}`, 'cyan');
      }
    }
    
    // Save session info
    this.saveSession();
    
    colorLog('✅ Implementation tracking started', 'green');
    return this;
  }

  // Complete tracking and generate report
  complete(additionalNotes = '', options = {}) {
    if (!this.generator) {
      colorLog('❌ No active tracking session found', 'yellow');
      return;
    }

    colorLog('📊 Generating implementation report...', 'blue');
    
    const reportFile = this.generator.generateReport();
    
    // Add additional notes if provided
    if (additionalNotes) {
      this.appendNotes(reportFile, additionalNotes);
    }
    
    // Git integration option
    if (options.autoCommit || process.argv.includes('--git')) {
      this.handleGitIntegration(reportFile, additionalNotes);
    }
    
    // Clean up session
    this.clearSession();
    
    colorLog('🎉 Implementation tracking completed!', 'green');
    return reportFile;
  }

  // Handle Git integration
  async handleGitIntegration(reportFilename, notes) {
    try {
      const GitAutomation = require('./git-automation.js');
      const gitAuto = new GitAutomation();
      
      colorLog('🔄 Integrating with Git...', 'blue');
      
      const implementationData = {
        title: this.generator.taskTitle || 'Implementation update',
        notes: notes,
        reportFile: reportFilename
      };
      
      const success = await gitAuto.commitImplementation(implementationData);
      
      if (success) {
        colorLog('✅ Changes committed to Git successfully', 'green');
      } else {
        colorLog('⚠️  Git integration completed with warnings', 'yellow');
      }
      
    } catch (error) {
      colorLog('⚠️  Git integration failed (optional):', 'yellow');
      colorLog(`   ${error.message}`, 'yellow');
    }
  }

  // Save current session
  saveSession() {
    const sessionData = {
      startTime: this.generator.startTime,
      taskTitle: this.generator.taskTitle,
      requirements: this.generator.requirements,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2));
  }

  // Load existing session
  loadSession() {
    if (!fs.existsSync(this.sessionFile)) {
      return false;
    }
    
    try {
      const sessionData = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
      
      this.generator = new ImplementationReportGenerator();
      this.generator.startTime = sessionData.startTime;
      this.generator.taskTitle = sessionData.taskTitle;
      this.generator.requirements = sessionData.requirements;
      
      return true;
    } catch (error) {
      return false;
    }
  }

  // Clear session
  clearSession() {
    if (fs.existsSync(this.sessionFile)) {
      fs.unlinkSync(this.sessionFile);
    }
  }

  // Append additional notes to report
  appendNotes(reportFile, notes) {
    const additionalSection = `\n## Additional Notes\n\n${notes}\n`;
    fs.appendFileSync(reportFile, additionalSection);
  }

  // Check if there's an active session
  hasActiveSession() {
    return fs.existsSync(this.sessionFile);
  }
}

// CLI Interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const tracker = new ImplementationTracker();

  switch (command) {
    case 'start':
    case 'begin':
      const promptFile = args[1];
      let prompt = '';
      
      if (promptFile && fs.existsSync(promptFile)) {
        prompt = fs.readFileSync(promptFile, 'utf8');
      } else if (promptFile) {
        // Treat as direct prompt text
        prompt = promptFile;
      }
      
      tracker.start(prompt);
      break;

    case 'complete':
    case 'finish':
    case 'done':
      if (tracker.loadSession()) {
        const notes = args[1] || '';
        tracker.complete(notes);
      } else {
        colorLog('❌ No active implementation session found', 'yellow');
        colorLog('💡 Use "track-implementation start" to begin tracking', 'cyan');
      }
      break;

    case 'status':
      if (tracker.hasActiveSession()) {
        tracker.loadSession();
        colorLog(`📋 Active session: ${tracker.generator.taskTitle || 'Untitled'}`, 'green');
        const duration = Math.round((Date.now() - tracker.generator.startTime) / 1000);
        colorLog(`⏱️  Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`, 'cyan');
      } else {
        colorLog('ℹ️  No active implementation session', 'yellow');
      }
      break;

    case 'quick':
      // Quick mode: start, wait for enter, then complete
      colorLog('🚀 Quick implementation mode', 'blue');
      colorLog('📝 Enter your step title/prompt:', 'cyan');
      
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', (input) => {
        const prompt = input.toString().trim();
        tracker.start(prompt);
        
        colorLog('⏳ Implement your changes, then press Enter to generate report...', 'yellow');
        process.stdin.once('data', () => {
          tracker.complete();
          process.exit(0);
        });
      });
      break;

    default:
      console.log(`
Implementation Tracker - Usage:

Commands:
  start [prompt]     Start tracking implementation (prompt can be text or file)
  complete [notes]   Complete tracking and generate report
  status            Show current tracking status
  quick             Interactive quick mode

Examples:
  track-implementation start "Step 1.1: Initial Project Setup"
  track-implementation start prompt.txt
  track-implementation complete "Added extra validation"
  track-implementation quick

Workflow:
  1. Run 'start' before beginning implementation
  2. Make your changes
  3. Run 'complete' to generate the report
      `);
      break;
  }
}

// Export for use as module
module.exports = ImplementationTracker;

// Run if called directly
if (require.main === module) {
  main();
}