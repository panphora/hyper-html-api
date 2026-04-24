import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '..', 'test', 'fixtures')

function read(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8')
}

function readJson(name) {
  return JSON.parse(read(name))
}

function extractViaCheerio(html, rules) {
  const $ = cheerio.load(html)
  return extract(cheerioAdapter, $.root(), rules)
}

function extractViaJsdom(html, rules) {
  const dom = new JSDOM(html)
  return extract(domAdapter, dom.window.document, rules)
}

const cases = [
  { html: 'demo.html', rules: 'demo.rules.json' },
  { html: 'nested.html', rules: 'nested.rules.json' },
  { html: 'empty-list.html', rules: 'empty-list.rules.json' },
]

test('DOM and cheerio adapters produce identical extract output', async (t) => {
  for (const c of cases) {
    await t.test(c.html, () => {
      const html = read(c.html)
      const rules = readJson(c.rules)
      const domResult = extractViaJsdom(html, rules)
      const cheerioResult = extractViaCheerio(html, rules)
      assert.equal(JSON.stringify(domResult), JSON.stringify(cheerioResult))
    })
  }
})

test('both adapters exclude the rules tag from self-targeting selectors', async (t) => {
  const html = read('self-targeting.html')
  const rules = readJson('self-targeting.rules.json')
  const domResult = extractViaJsdom(html, rules)
  const cheerioResult = extractViaCheerio(html, rules)

  // Rules tag body must NOT be in the scripts array. The two unrelated script
  // tags are both empty-bodied comment/json so the trimmed text is '' or the
  // JSON body respectively — what matters here is the rules tag is filtered.
  assert.equal(domResult.scripts.length, 2)
  assert.equal(cheerioResult.scripts.length, 2)
  assert.equal(JSON.stringify(domResult), JSON.stringify(cheerioResult))
})
