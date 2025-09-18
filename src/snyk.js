const { execSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs-extra');

const { extractRNZip } = require('./command.js');

// Function to handle Snyk authentication
const authenticateSnyk = () => {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Snyk API Token: ', (snykToken) => {
      try {
        execSync(`snyk auth ${snykToken}`, { stdio: 'inherit' });
        console.log('Snyk authenticated successfully.');
        resolve();
      } catch (err) {
        console.error('Authentication failed. Please check your token.');
        reject(err);
      } finally {
        rl.close();
      }
    });
  });
};

// Function to check if Snyk is installed
const isSnykInstalled = () => {
  try {
    execSync('snyk --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Main audit function
const snyk = async (args) => {
  let src = args.src;
  console.log(src);
  src = await extractRNZip(src);
  const projectPath = src;
  console.log("Audit function called for project path:", projectPath);

  const absolutePath = path.resolve(projectPath);
  console.log("Resolved project path:", absolutePath);

  const parentDir = path.resolve(absolutePath, '..');

  // Check Snyk authentication
  try {
    console.log("Checking Snyk authentication...");
    execSync('snyk config get api', { stdio: 'pipe' });
  } catch {
    console.log("Snyk is not authenticated.");
    try {
      await authenticateSnyk();
    } catch (error) {
      process.exit(1);
    }
  }

  if (!isSnykInstalled()) {
    console.log("Installing Snyk...");
    execSync('npm install -g snyk', { stdio: 'inherit' });
    console.log("Snyk installed.");
  } else {
    console.log("Snyk is already installed.");
  }

  // Install Node modules
  console.log("Installing node modules...");
  try {
    execSync('npm install', { cwd: parentDir, stdio: 'inherit' });
    execSync('npm update', { cwd: parentDir, stdio: 'inherit' });
    console.log("Node modules installed.");
  } catch (npmError) {
    console.warn(`Failed to install npm packages: ${npmError.message}`);
    console.log("Proceeding with Snyk test anyway...");
  }

  console.log("Running Snyk security test...");
  try {
    execSync('snyk test', { cwd: absolutePath, stdio: 'pipe' });
    console.log("Snyk test completed successfully. No vulnerabilities found.");
     const reportContent = 'No vulnerabilities found.';
     const reportPath = path.join(absolutePath, 'snyk-report.txt');
     fs.writeFileSync(reportPath, reportContent);
     console.log(`Snyk report saved to ${reportPath}`);
  } catch (error) {
    console.error("Vulnerabilities detected during Snyk test.");
     const auditReport = error.stdout.toString();
        const reportPath = path.join(absolutePath, 'snyk-report.txt');
        fs.writeFileSync(reportPath, auditReport);
    
        console.log(`Audit report saved to ${reportPath}`);
  }
};

module.exports = {
  snyk,
  extractRNZip
};