#!/usr/bin/env node

// Copies the lean engine bundle (dist/hyper-html-api.engine.min.js, built from
// the LEAN src/data.js entry — never the full bundle) into clayjs as the
// top-level classic script clayjs/clay-data.js. Unlike copy-to-hyperclayjs.js
// (which appends ESM `export` statements), this wrapper is CLASSIC-SAFE: clayjs
// loads clay-data.js as a plain <script>, so it must NOT contain export syntax,
// and the whole dist is wrapped in an outer IIFE so esbuild's
// `var hyperHtmlApiData` global never leaks to window. It always creates/merges
// window.clay and attaches clay.extractData / clay.applyData / clay.loaded.data,
// order-independent. `--check` exits non-zero when the copy is missing or stale.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

const distFile = path.join(rootDir, 'dist', 'hyper-html-api.engine.min.js')
const clayFile = path.join(rootDir, '..', 'clayjs', 'clay-data.js')

const HEADER = `// GENERATED — do not edit. Vendored from
// hyper-html-api/dist/hyper-html-api.engine.min.js via hyper-html-api
// \`npm run copy-to-clayjs\`. Edit the hyper-html-api source and re-run.
`

const WRAPPER_PREFIX = `(function () {
`

const WRAPPER_SUFFIX = `
window.clay = window.clay || {};
window.clay.extractData = hyperHtmlApiData.extractData;
// clayjs-level sugar: applyData(data) writes into the whole document, matching
// extractData's root sniff. Explicit-root applyData(el, data, source?) passes through.
window.clay.applyData = function (root, data, source) {
  if (root && typeof root.nodeType === "number") return hyperHtmlApiData.applyData(root, data, source);
  return hyperHtmlApiData.applyData(document, root, data);
};
window.clay.loaded = window.clay.loaded || {};
window.clay.loaded.data = Promise.resolve();
})();
`

function build(dist) {
  return HEADER + WRAPPER_PREFIX + dist + WRAPPER_SUFFIX
}

const isCheck = process.argv.includes('--check')

if (!fs.existsSync(distFile)) {
  if (isCheck) process.exit(1)
  console.error('Error: dist/hyper-html-api.engine.min.js not found. Run "npm run build:engine" first.')
  process.exit(1)
}

const minified = fs.readFileSync(distFile, 'utf8').trim()
const expected = build(minified)

if (isCheck) {
  if (!fs.existsSync(clayFile)) process.exit(1)
  const actual = fs.readFileSync(clayFile, 'utf8')
  process.exit(actual === expected ? 0 : 1)
}

const clayDir = path.dirname(clayFile)
if (!fs.existsSync(clayDir)) {
  console.error(`Error: clayjs folder not found at ${clayDir}`)
  console.error('Make sure clayjs is in the parent directory.')
  process.exit(1)
}

fs.writeFileSync(clayFile, expected, 'utf8')
console.log('✓ Updated clayjs/clay-data.js')
