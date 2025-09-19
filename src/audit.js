const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const  {extractRNZip}  = require('./command.js');

const audit = async (args) => {

let src = args.src;
console.log(src);
src = await extractRNZip(src);
const projectPath = src;
console.log("Audit function called for project path:", projectPath);

try {
  const absolutePath = path.resolve(projectPath);
  console.log("Resolved project path:", absolutePath);
 const parentDir = path.resolve(absolutePath, '..');

execSync('npm cache clean --force', { cwd: parentDir, stdio: 'inherit' });
execSync('npm config set registry=https://repository.wavemaker.com/repository/wavemaker-npm-repo/', { cwd: parentDir, stdio: 'inherit' });
 
console.log("Installing node modules...");
execSync('npm install', { cwd: absolutePath, stdio: 'inherit' });
  execSync('npm update', { cwd: absolutePath, stdio: 'inherit' });
  console.log("Node modules installed.");
  execSync('npm config set registry https://registry.npmjs.org/', { cwd: parentDir, stdio: 'inherit' });
  

  try {
    execSync('npm audit ', { cwd: absolutePath, stdio: 'pipe' });
    console.log("Audit completed. No vulnerabilities found.");

    const reportContent = 'No vulnerabilities found.';
    const reportPath = path.join(absolutePath, 'audit-report.txt');
    fs.writeFileSync(reportPath, reportContent);
    console.log(`Audit report saved to ${reportPath}`);
  } catch (error) {
    console.log("Vulnerabilities detected. Capturing results...");

    const auditReport = error.stdout.toString();
    const reportPath = path.join(absolutePath, 'audit-report.txt');
    fs.writeFileSync(reportPath, auditReport);

    console.log(`Audit report saved to ${reportPath}`);
  }

} catch (error) {
  console.error("An error occurred:", error.message);
}
};

module.exports = {
audit,
extractRNZip: extractRNZip
}; 