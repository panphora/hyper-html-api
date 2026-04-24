#!/usr/bin/env node

/**
 * Copies the built hyper-html-api.min.js to hyperclayjs vendor folder.
 *
 * Usage: npm run copy-to-hyperclayjs
 *
 * This script:
 * 1. Reads the built dist/hyper-html-api.min.js
 * 2. Finds hyperclayjs in the parent directory
 * 3. Updates hyper-html-api.vendor.js, preserving the wrapper code at the bottom
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const distFile = path.join(rootDir, 'dist', 'hyper-html-api.min.js');
const vendorFile = path.join(rootDir, '..', 'hyperclayjs', 'src', 'vendor', 'hyper-html-api.vendor.js');

// The wrapper code appended after the minified bundle
const WRAPPER_CODE = `
// Auto-export to window unless suppressed by loader
if (!window.__hyperclayNoAutoExport) {
  window.hyperclay = window.hyperclay || {};
  window.hyperclay.htmlApi = HyperHtmlApi;
  window.HyperHtmlApi = HyperHtmlApi;
  window.h = window.hyperclay;
}

export { HyperHtmlApi };
export default HyperHtmlApi;
`;

const isCheck = process.argv.includes('--check');

if (!fs.existsSync(distFile)) {
  if (isCheck) process.exit(1);
  console.error('Error: dist/hyper-html-api.min.js not found. Run "npm run build" first.');
  process.exit(1);
}

const minified = fs.readFileSync(distFile, 'utf8').trim();
const expected = minified + '\n' + WRAPPER_CODE;

if (isCheck) {
  if (!fs.existsSync(vendorFile)) process.exit(1);
  const actual = fs.readFileSync(vendorFile, 'utf8');
  process.exit(actual === expected ? 0 : 1);
}

if (!fs.existsSync(vendorFile)) {
  console.error(`Error: hyperclayjs vendor file not found at ${vendorFile}`);
  console.error('Make sure hyperclayjs is in the parent directory.');
  process.exit(1);
}

fs.writeFileSync(vendorFile, expected, 'utf8');

console.log('✓ Updated hyperclayjs/src/vendor/hyper-html-api.vendor.js');
