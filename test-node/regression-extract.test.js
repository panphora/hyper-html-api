import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

import { extract } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures')

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8')
}

function readJsonFixture(name) {
  return JSON.parse(readFixture(name))
}

const cases = [
  { html: 'demo.html', rules: 'demo.rules.json', expected: 'demo.expected.json' },
  { html: 'nested.html', rules: 'nested.rules.json', expected: 'nested.expected.json' },
  {
    html: 'properties.html',
    rules: 'properties.rules.json',
    expected: 'properties.expected.json',
  },
  {
    html: 'empty-list.html',
    rules: 'empty-list.rules.json',
    expected: 'empty-list.expected.json',
  },
]

test('cheerio adapter matches legacy data-extractor snapshots', async (t) => {
  for (const c of cases) {
    await t.test(c.html, () => {
      const html = readFixture(c.html)
      const rules = readJsonFixture(c.rules)
      const expected = readJsonFixture(c.expected)
      const $ = cheerio.load(html)
      const result = extract(cheerioAdapter, $.root(), rules)
      assert.equal(JSON.stringify(result), JSON.stringify(expected))
    })
  }
})
