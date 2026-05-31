#!/usr/bin/env node

// Copies the lean data bundle (dist/hyper-html-api.engine.min.js) into
// hyperclayjs as a vendor file, appending the window-export + ES-export wrapper
// so window.hyperclay.extractData / applyData attach during evaluation. Mirrors
// hyper-undo/scripts/copy-to-hyperclayjs.js. Run via `npm run copy-to-hyperclayjs`
// (which builds the lean bundle first). `--check` exits non-zero when the vendor
// file is missing or stale, so CI can assert the copy is in sync.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

const distFile = path.join(rootDir, 'dist', 'hyper-html-api.engine.min.js')
const vendorFile = path.join(rootDir, '..', 'hyperclayjs', 'src', 'vendor', 'hyper-html-api.vendor.js')

const WRAPPER_CODE = `
// Auto-export to window unless suppressed by loader.
if (!window.__hyperclayNoAutoExport) {
  window.hyperclay = window.hyperclay || {};
  window.hyperclay.extractData = hyperHtmlApiData.extractData;
  window.hyperclay.applyData = hyperHtmlApiData.applyData;
  window.h = window.hyperclay;
}

export const engine = hyperHtmlApiData.engine;
export const extractData = hyperHtmlApiData.extractData;
export const applyData = hyperHtmlApiData.applyData;
export default hyperHtmlApiData;
`

const isCheck = process.argv.includes('--check')

if (!fs.existsSync(distFile)) {
  if (isCheck) process.exit(1)
  console.error('Error: dist/hyper-html-api.engine.min.js not found. Run "npm run build:engine" first.')
  process.exit(1)
}

const minified = fs.readFileSync(distFile, 'utf8').trim()
const expected = minified + '\n' + WRAPPER_CODE

if (isCheck) {
  if (!fs.existsSync(vendorFile)) process.exit(1)
  const actual = fs.readFileSync(vendorFile, 'utf8')
  process.exit(actual === expected ? 0 : 1)
}

const vendorDir = path.dirname(vendorFile)
if (!fs.existsSync(vendorDir)) {
  console.error(`Error: hyperclayjs vendor folder not found at ${vendorDir}`)
  console.error('Make sure hyperclayjs is in the parent directory.')
  process.exit(1)
}

fs.writeFileSync(vendorFile, expected, 'utf8')
console.log('✓ Updated hyperclayjs/src/vendor/hyper-html-api.vendor.js')
