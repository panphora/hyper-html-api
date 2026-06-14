#!/usr/bin/env node

// Copies the lean bundles into hyperclayjs as vendor files, appending the
// window-export + ES-export wrapper so the public API attaches to
// window.hyperclay during evaluation. Mirrors
// hyper-undo/scripts/copy-to-hyperclayjs.js. Run via `npm run copy-to-hyperclayjs`
// (which builds the lean bundles first). `--check` exits non-zero when any
// vendor file is missing or stale, so CI can assert the copies are in sync.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
const vendorDir = path.join(rootDir, '..', 'hyperclayjs', 'src', 'vendor')

const TARGETS = [
  {
    dist: path.join(rootDir, 'dist', 'hyper-html-api.engine.min.js'),
    vendor: path.join(vendorDir, 'hyper-html-api.vendor.js'),
    buildCmd: 'npm run build:engine',
    wrapper: `
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
`,
  },
  {
    dist: path.join(rootDir, 'dist', 'hyper-html-api.upgrade.min.js'),
    vendor: path.join(vendorDir, 'hyper-html-api-upgrade.vendor.js'),
    buildCmd: 'npm run build:upgrade',
    wrapper: `
// Auto-export to window unless suppressed by loader.
if (!window.__hyperclayNoAutoExport) {
  window.hyperclay = window.hyperclay || {};
  window.hyperclay.upgrade = hyperHtmlApiUpgrade.upgrade;
  window.h = window.hyperclay;
}

export const engine = hyperHtmlApiUpgrade.engine;
export const upgrade = hyperHtmlApiUpgrade.upgrade;
export default hyperHtmlApiUpgrade;
`,
  },
]

const isCheck = process.argv.includes('--check')

if (!isCheck && !fs.existsSync(vendorDir)) {
  console.error(`Error: hyperclayjs vendor folder not found at ${vendorDir}`)
  console.error('Make sure hyperclayjs is in the parent directory.')
  process.exit(1)
}

for (const target of TARGETS) {
  if (!fs.existsSync(target.dist)) {
    if (isCheck) process.exit(1)
    console.error(`Error: ${path.relative(rootDir, target.dist)} not found. Run "${target.buildCmd}" first.`)
    process.exit(1)
  }

  const minified = fs.readFileSync(target.dist, 'utf8').trim()
  const expected = minified + '\n' + target.wrapper

  if (isCheck) {
    if (!fs.existsSync(target.vendor)) process.exit(1)
    const actual = fs.readFileSync(target.vendor, 'utf8')
    if (actual !== expected) process.exit(1)
    continue
  }

  fs.writeFileSync(target.vendor, expected, 'utf8')
  console.log(`✓ Updated hyperclayjs/src/vendor/${path.basename(target.vendor)}`)
}
