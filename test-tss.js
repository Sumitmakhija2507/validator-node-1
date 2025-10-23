/**
 * Simple test runner for TSS integration
 * Run with: node test-tss.js
 */

require('dotenv').config();

// Use ts-node to run TypeScript test file
const { exec } = require('child_process');
const path = require('path');

console.log('Starting TSS Integration Test...\n');

// Run the TypeScript test file
const testFile = path.join(__dirname, 'src', 'tests', 'tss-integration.test.ts');

exec(`npx ts-node ${testFile}`, (error, stdout, stderr) => {
  console.log(stdout);

  if (stderr && !stderr.includes('ExperimentalWarning')) {
    console.error(stderr);
  }

  if (error) {
    console.error(`Test execution error: ${error.message}`);
    process.exit(1);
  }
});
