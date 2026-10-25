#!/usr/bin/env node

// Copies the lean engine bundle (dist/hyper-html-api.engine.min.js, built from
// the LEAN src/data.js entry — never the full bundle) into clayjs as the
// top-level classic script clayjs/clay-data.js. Unlike copy-to-hyperclayjs.js
// (which appends ESM `export` statements), this wrapper is CLASSIC-SAFE: clayjs
// loads clay-data.js as a plain <script>, so it must NOT contain export syntax,
// and the whole dist is wrapped in an outer IIFE so esbuild's
// `var hyperHtmlApiData` global never leaks to window. It always creates/merges
// window.clay and attaches clay.extractData / clay.applyData / clay.loaded.data,
// order-independent. It also writes the ES module build of the same entry as
// clayjs/src/vendor/hyper-html-api-data.vendor.js, which the visitor-drafts
// plugin imports, and the ES module build of the upgrade entry (src/upgrade.js)
// as clayjs/src/vendor/hyper-html-api-upgrade.vendor.js, which the upgrade
// plugin imports.
//
// Every bundle is built from source on every run, so a copy can never ship a
// stale dist file. `--check` compares the ClayJS copies against a build it makes
// into a temp directory (never against the committed dist) and exits non-zero
// when any copy is missing or differs.

import esbuild from 'esbuild'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

const srcFile = path.join(rootDir, 'src', 'data.js')
const distDir = path.join(rootDir, 'dist')
const clayFile = path.join(rootDir, '..', 'clayjs', 'entries', 'clay-data.js')
const vendorFile = path.join(rootDir, '..', 'clayjs', 'src', 'vendor', 'hyper-html-api-data.vendor.js')
const upgradeVendorFile = path.join(rootDir, '..', 'clayjs', 'src', 'vendor', 'hyper-html-api-upgrade.vendor.js')

const HEADER = `// GENERATED — do not edit. Vendored from
// hyper-html-api/dist/hyper-html-api.engine.min.js via hyper-html-api
// \`npm run copy-to-clayjs\`. Edit the hyper-html-api source and re-run.
`

const ESM_HEADER = `// GENERATED — do not edit. Vendored from
// hyper-html-api/dist/hyper-html-api.engine.esm.js via hyper-html-api
// \`npm run copy-to-clayjs\`. Edit the hyper-html-api source and re-run.
`

const UPGRADE_ESM_HEADER = `// GENERATED — do not edit. Vendored from
// hyper-html-api/src/upgrade.js via hyper-html-api
// \`npm run copy-to-clayjs\`. Edit the hyper-html-api source and re-run.
`

// The upgrade entry exports the engine and the upgrade flow; ClayJS's upgrade
// plugin also compares versions, so the vendor re-exports the helpers from
// src/upgrade/check.js beside it.
const UPGRADE_ENTRY = `export { default } from './src/upgrade.js'
export * from './src/upgrade.js'
export { readMeta, parseVersion, isNewerVersion } from './src/upgrade/check.js'
`

const WRAPPER_PREFIX = `(function () {
`

const WRAPPER_SUFFIX = `
window.clay = window.clay || {};
window.clay.extractData = hyperHtmlApiData.extractData;
window.clay.applyData = function (values, optionsOrSource, source) {
  if (values && typeof values.nodeType === "number") return hyperHtmlApiData.applyData(values, optionsOrSource, source);
  var isObject = optionsOrSource !== null && typeof optionsOrSource === "object";
  var proto = isObject ? Object.getPrototypeOf(optionsOrSource) : null;
  var isOptions = isObject && (proto === Object.prototype || proto === null) && Object.prototype.hasOwnProperty.call(optionsOrSource, "rules");
  var rules = isOptions ? optionsOrSource.rules : optionsOrSource;
  return hyperHtmlApiData.applyData(document, values, rules == null ? undefined : rules);
};
window.clay.loaded = window.clay.loaded || {};
window.clay.loaded.data = Promise.resolve();
})();
`

function build(dist) {
  return HEADER + WRAPPER_PREFIX + dist + WRAPPER_SUFFIX
}

function buildEsm(dist) {
  return ESM_HEADER + dist
}

function buildUpgradeEsm(dist) {
  return UPGRADE_ESM_HEADER + dist
}

// The same two esbuild invocations `npm run build:engine` and
// `npm run build:engine:esm` make, so the copies match the scripts exactly.
function buildEngine(outDir) {
  const iife = path.join(outDir, 'hyper-html-api.engine.min.js')
  const esm = path.join(outDir, 'hyper-html-api.engine.esm.js')
  esbuild.buildSync({
    entryPoints: [srcFile],
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'hyperHtmlApiData',
    outfile: iife,
  })
  esbuild.buildSync({
    entryPoints: [srcFile],
    bundle: true,
    minify: true,
    format: 'esm',
    outfile: esm,
  })
  return { iife, esm }
}

function expectedFrom(built) {
  return {
    clay: build(fs.readFileSync(built.iife, 'utf8').trim()),
    vendor: buildEsm(fs.readFileSync(built.esm, 'utf8').trim()),
  }
}

// The same esbuild invocation `npm run build:engine:esm` makes, with the
// upgrade entry standing in for src/data.js.
function buildUpgradeModule(outDir) {
  const esm = path.join(outDir, 'hyper-html-api.upgrade.esm.js')
  esbuild.buildSync({
    stdin: {
      contents: UPGRADE_ENTRY,
      resolveDir: rootDir,
      sourcefile: 'hyper-html-api-upgrade-entry.js',
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    outfile: esm,
  })
  return esm
}

function expectedUpgrade() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-html-api-upgrade-'))
  try {
    return buildUpgradeEsm(fs.readFileSync(buildUpgradeModule(tempDir), 'utf8').trim())
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

if (process.argv.includes('--check')) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-html-api-engine-'))
  const expected = expectedFrom(buildEngine(tempDir))
  fs.rmSync(tempDir, { recursive: true, force: true })
  const expectedUpgradeEsm = expectedUpgrade()
  if (!fs.existsSync(clayFile) || !fs.existsSync(vendorFile) || !fs.existsSync(upgradeVendorFile)) process.exit(1)
  const actual = fs.readFileSync(clayFile, 'utf8')
  const actualEsm = fs.readFileSync(vendorFile, 'utf8')
  const actualUpgradeEsm = fs.readFileSync(upgradeVendorFile, 'utf8')
  process.exit(
    actual === expected.clay && actualEsm === expected.vendor && actualUpgradeEsm === expectedUpgradeEsm ? 0 : 1
  )
}

const clayDir = path.dirname(clayFile)
if (!fs.existsSync(clayDir)) {
  console.error(`Error: clayjs folder not found at ${clayDir}`)
  console.error('Make sure clayjs is in the parent directory.')
  process.exit(1)
}

const expected = expectedFrom(buildEngine(distDir))

fs.writeFileSync(clayFile, expected.clay, 'utf8')
console.log('✓ Updated clayjs/entries/clay-data.js')

fs.writeFileSync(vendorFile, expected.vendor, 'utf8')
console.log('✓ Updated clayjs/src/vendor/hyper-html-api-data.vendor.js')

fs.writeFileSync(upgradeVendorFile, expectedUpgrade(), 'utf8')
console.log('✓ Updated clayjs/src/vendor/hyper-html-api-upgrade.vendor.js')
