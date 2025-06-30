#!/usr/bin/env node

/**
 * Git Automation Script for Aeturnis Online
 * Integrates with implementation tracking system for automatic version control
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorLog(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

class GitAutomation {
  constructor() {
    this.projectRoot = process.cwd();
    this.gitIgnoreFile = path.join(this.projectRoot, '.gitignore');
    this.reportsDir = path.join(this.projectRoot, 'REPORTS');
  }

  // Initialize Git repository if not exists
  async initializeGit() {
    try {
      // Check if Git is already initialized
      execSync('git status', { stdio: 'ignore' });
      colorLog('✓ Git repository already initialized', 'green');
      return true;
    } catch (error) {
      try {
        colorLog('🔧 Initializing Git repository...', 'blue');
        execSync('git init', { stdio: 'inherit' });
        colorLog('✓ Git repository initialized', 'green');
        return true;
      } catch (initError) {
        colorLog('❌ Failed to initialize Git repository:', 'red');
        console.error(initError.message);
        return false;
      }
    }
  }

  // Create or update .gitignore file
  createGitIgnore() {
    const gitIgnoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# TypeScript compilation output
dist/
build/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Temporary files
.tmp/
temp/

# Database
*.sqlite
*.sqlite3

# Cache
.cache/
.npm/
.eslintcache

# Implementation session tracking
.implementation-session.json

# Backup files
*.backup
*.bak

# Archive files
*.zip
*.tar.gz
*.rar
`;

    try {
      fs.writeFileSync(this.gitIgnoreFile, gitIgnoreContent);
      colorLog('✓ .gitignore file created/updated', 'green');
    } catch (error) {
      colorLog('⚠️  Warning: Could not create .gitignore file', 'yellow');
    }
  }

  // Get Git status
  getGitStatus() {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      return status.trim().split('\n').filter(line => line.trim() !== '');
    } catch (error) {
      return [];
    }
  }

  // Check if there are changes to commit
  hasChanges() {
    const status = this.getGitStatus();
    return status.length > 0;
  }

  // Generate commit message from implementation report
  generateCommitMessage(reportFile = null) {
    let commitMessage = '';
    
    if (reportFile && fs.existsSync(reportFile)) {
      try {
        const reportContent = fs.readFileSync(reportFile, 'utf8');
        
        // Extract title from markdown
        const titleMatch = reportContent.match(/^# (.+)$/m);
        if (titleMatch) {
          commitMessage = `feat: ${titleMatch[1].toLowerCase()}`;
        }
        
        // Extract implementation summary from Additional Notes
        const notesMatch = reportContent.match(/## Additional Notes\n\n([\s\S]+?)(?:\n##|$)/);
        if (notesMatch) {
          const notes = notesMatch[1].trim();
          // Take first few lines as commit body
          const lines = notes.split('\n').slice(0, 10);
          const body = lines.join('\n').replace(/^[✅❌⏳]\s*/gm, '- ');
          commitMessage += `\n\n${body}`;
        }
      } catch (error) {
        colorLog('⚠️  Could not parse implementation report for commit message', 'yellow');
      }
    }
    
    if (!commitMessage) {
      commitMessage = `feat: implementation update - ${new Date().toISOString().split('T')[0]}`;
    }
    
    return commitMessage;
  }

  // Find latest implementation report
  findLatestReport() {
    if (!fs.existsSync(this.reportsDir)) {
      return null;
    }
    
    const reports = fs.readdirSync(this.reportsDir)
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        name: file,
        path: path.join(this.reportsDir, file),
        mtime: fs.statSync(path.join(this.reportsDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);
    
    return reports.length > 0 ? reports[0].path : null;
  }

  // Add all changes to Git
  addChanges() {
    try {
      execSync('git add .', { stdio: 'inherit' });
      colorLog('✓ Changes staged for commit', 'green');
      return true;
    } catch (error) {
      colorLog('❌ Failed to stage changes:', 'red');
      console.error(error.message);
      return false;
    }
  }

  // Create Git commit
  createCommit(message) {
    try {
      const escapedMessage = message.replace(/"/g, '\\"');
      execSync(`git commit -m "${escapedMessage}"`, { stdio: 'inherit' });
      colorLog('✓ Commit created successfully', 'green');
      return true;
    } catch (error) {
      colorLog('❌ Failed to create commit:', 'red');
      console.error(error.message);
      return false;
    }
  }

  // Get current branch name
  getCurrentBranch() {
    try {
      const branch = execSync('git branch --show-current', { encoding: 'utf8' });
      return branch.trim();
    } catch (error) {
      return 'main';
    }
  }

  // Check if remote repository is configured
  hasRemote() {
    try {
      const remotes = execSync('git remote', { encoding: 'utf8' });
      return remotes.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  // Push to remote repository
  pushToRemote() {
    if (!this.hasRemote()) {
      colorLog('⚠️  No remote repository configured. Skipping push.', 'yellow');
      colorLog('💡 To add remote: git remote add origin <repository-url>', 'gray');
      return false;
    }
    
    try {
      const branch = this.getCurrentBranch();
      colorLog(`🚀 Pushing to remote repository (${branch})...`, 'blue');
      execSync(`git push -u origin ${branch}`, { stdio: 'inherit' });
      colorLog('✓ Successfully pushed to remote repository', 'green');
      return true;
    } catch (error) {
      colorLog('❌ Failed to push to remote repository:', 'red');
      console.error(error.message);
      return false;
    }
  }

  // Show Git log
  showRecentCommits(count = 5) {
    try {
      colorLog(`\n📜 Recent commits (last ${count}):`, 'cyan');
      execSync(`git log --oneline -${count}`, { stdio: 'inherit' });
    } catch (error) {
      colorLog('⚠️  Could not retrieve commit history', 'yellow');
    }
  }

  // Main automation workflow
  async autoCommit(options = {}) {
    const {
      message = null,
      push = false,
      reportFile = null,
      dryRun = false
    } = options;

    colorLog('\n🔄 Git Automation - Aeturnis Online', 'cyan');
    colorLog('=====================================', 'gray');

    // Initialize Git if needed
    if (!(await this.initializeGit())) {
      return false;
    }

    // Create .gitignore
    this.createGitIgnore();

    // Check for changes
    if (!this.hasChanges()) {
      colorLog('ℹ️  No changes to commit', 'yellow');
      return true;
    }

    // Show status
    colorLog('\n📊 Git Status:', 'blue');
    const changes = this.getGitStatus();
    changes.forEach(change => {
      const status = change.substring(0, 2);
      const file = change.substring(3);
      const statusColor = status.includes('M') ? 'yellow' : 
                         status.includes('A') ? 'green' : 
                         status.includes('D') ? 'red' : 'gray';
      colorLog(`  ${status} ${file}`, statusColor);
    });

    if (dryRun) {
      colorLog('\n🧪 Dry run mode - no changes will be committed', 'yellow');
      return true;
    }

    // Generate commit message
    const commitMessage = message || this.generateCommitMessage(reportFile || this.findLatestReport());
    
    colorLog('\n📝 Commit Message:', 'blue');
    colorLog(`"${commitMessage}"`, 'gray');

    // Stage changes
    if (!this.addChanges()) {
      return false;
    }

    // Create commit
    if (!this.createCommit(commitMessage)) {
      return false;
    }

    // Push if requested
    if (push) {
      this.pushToRemote();
    }

    // Show recent commits
    this.showRecentCommits();

    colorLog('\n✅ Git automation completed successfully!', 'green');
    return true;
  }

  // Integration with implementation tracking
  async commitImplementation(implementationData) {
    const { title, notes, reportFile } = implementationData;
    
    let commitMessage = `feat: ${title}`;
    if (notes) {
      commitMessage += `\n\n${notes}`;
    }

    return this.autoCommit({
      message: commitMessage,
      reportFile: reportFile,
      push: true
    });
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const gitAuto = new GitAutomation();

  try {
    switch (command) {
      case 'init':
        await gitAuto.initializeGit();
        gitAuto.createGitIgnore();
        break;

      case 'commit':
        const message = process.argv[3];
        await gitAuto.autoCommit({ 
          message: message,
          push: process.argv.includes('--push')
        });
        break;

      case 'auto':
        await gitAuto.autoCommit({ 
          push: process.argv.includes('--push')
        });
        break;

      case 'status':
        await gitAuto.initializeGit();
        if (gitAuto.hasChanges()) {
          const changes = gitAuto.getGitStatus();
          colorLog(`📊 ${changes.length} file(s) changed:`, 'blue');
          changes.forEach(change => colorLog(`  ${change}`, 'gray'));
        } else {
          colorLog('✨ Working directory clean', 'green');
        }
        break;

      case 'push':
        gitAuto.pushToRemote();
        break;

      case 'log':
        gitAuto.showRecentCommits(parseInt(process.argv[3]) || 10);
        break;

      case 'dry-run':
        await gitAuto.autoCommit({ dryRun: true });
        break;

      default:
        console.log(`
🔧 Git Automation for Aeturnis Online

Usage: node git-automation.js [command] [options]

Commands:
  init              Initialize Git repository and create .gitignore
  commit [message]  Create commit with optional custom message
  auto              Auto-commit with generated message from latest report
  status            Show current Git status
  push              Push to remote repository
  log [count]       Show recent commits (default: 10)
  dry-run           Preview what would be committed without making changes

Options:
  --push            Push to remote after committing

Examples:
  node git-automation.js init
  node git-automation.js auto --push
  node git-automation.js commit "feat: add user authentication" --push
  node git-automation.js dry-run
        `);
    }
  } catch (error) {
    colorLog('❌ Git automation failed:', 'red');
    console.error(error.message);
    process.exit(1);
  }
}

// Export for integration with tracking system
module.exports = GitAutomation;

// Run CLI if called directly
if (require.main === module) {
  main();
}