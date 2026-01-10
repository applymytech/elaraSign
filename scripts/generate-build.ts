#!/usr/bin/env npx tsx
/**
 * Generate Build Info
 * ====================
 * 
 * Run this during build/deploy to generate a unique build fingerprint.
 * This prevents impersonation - only builds from this repo will have valid fingerprints.
 * 
 * Usage:
 *   npx tsx scripts/generate-build.ts [environment]
 * 
 * Environments:
 *   production  - Production deployment (default)
 *   development - Local development
 *   test        - Test builds
 */

import { generateBuildInfo, saveBuildInfo } from '../src/core/build-fingerprint.js';

const environment = (process.argv[2] || 'production') as 'production' | 'development' | 'test';

console.log('');
console.log('Generating elaraSign Build Info...');
console.log('');

const info = generateBuildInfo(environment);
saveBuildInfo(info);

console.log(`  Fingerprint: ${info.fingerprint}`);
console.log(`  Short ID:    ${info.fingerprint.substring(0, 8).toUpperCase()}`);
console.log(`  Version:     ${info.version}`);
console.log(`  Environment: ${info.environment}`);
console.log(`  Build Time:  ${info.buildTime}`);
if (info.gitCommit) {
  console.log(`  Git Commit:  ${info.gitCommit}`);
}
console.log('');
console.log('Build info saved to build-info.json');
console.log('');
