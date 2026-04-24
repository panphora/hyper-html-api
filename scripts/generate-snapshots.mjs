#!/usr/bin/env node
/**
 * One-shot utility: reads fixtures, runs them through the EXISTING
 * hyperclay/server-lib/data-extractor.js, and writes <fixture>.expected.json.
 *
 * Used once during the engine port to lock behavior. Re-run only if the legacy
 * extractor is updated before the rewire.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures')
const legacyExtractor = path.join(__dirname, '..', '..', 'hyperclay', 'server-lib', 'data-extractor.js')

const { extractData } = await import(`file://${legacyExtractor}`)

const fixtures = [
  { html: 'demo.html', rules: 'demo.rules.json' },
  { html: 'nested.html', rules: 'nested.rules.json' },
  { html: 'properties.html', rules: 'properties.rules.json' },
  { html: 'empty-list.html', rules: 'empty-list.rules.json' },
]

for (const { html: htmlName, rules: rulesName } of fixtures) {
  const html = fs.readFileSync(path.join(fixturesDir, htmlName), 'utf8')
  const rules = JSON.parse(fs.readFileSync(path.join(fixturesDir, rulesName), 'utf8'))
  const result = extractData(html, rules)
  const expectedPath = path.join(fixturesDir, htmlName.replace('.html', '.expected.json'))
  fs.writeFileSync(expectedPath, JSON.stringify(result, null, 2) + '\n', 'utf8')
  console.log(`✓ ${path.relative(process.cwd(), expectedPath)}`)
}
