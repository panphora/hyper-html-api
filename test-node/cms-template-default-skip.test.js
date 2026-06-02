import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import { EmptyListInsert } from '../src/engine/errors.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// Regression guard for B5-1: a [cms-template] grow-from-zero SEED must be treated
// as "not data" by EVERY consumer (default), not just when a caller opts in via
// templateAttr. Previously only hypercms (which passes templateAttr) skipped it,
// so plain extractData / the server /_/api extractor emitted a phantom empty
// record for the seed.

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return { adapter: cheerioAdapter, root: $.root() }
}
function jsdomCtx(html) {
  const dom = new JSDOM(html)
  return { adapter: domAdapter, root: dom.window.document }
}

const HTML =
  '<div class="list">' +
  '<div class="row"><span class="n">Alpha</span></div>' +
  '<div class="row"><span class="n">Beta</span></div>' +
  '<div class="row" cms-template><span class="n"></span></div>' +
  '</div>'
const RULES = { items: ['.row', { name: '.n' }] }

for (const env of [{ label: 'cheerio', make: cheerioCtx }, { label: 'jsdom', make: jsdomCtx }]) {
  test(`extract [${env.label}] — cms-template seed skipped by DEFAULT (no phantom record)`, () => {
    const { adapter, root } = env.make(HTML)
    const out = extract(adapter, root, RULES) // no opts
    assert.deepEqual(out.items, [{ name: 'Alpha' }, { name: 'Beta' }])
  })

  test(`extract [${env.label}] — templateAttr:null opts back IN (includes the seed)`, () => {
    const { adapter, root } = env.make(HTML)
    const out = extract(adapter, root, RULES, { templateAttr: null })
    assert.equal(out.items.length, 3)
    assert.deepEqual(out.items[2], { name: '' })
  })

  test(`extract [${env.label}] — explicit templateAttr:'cms-template' still skips (unchanged)`, () => {
    const { adapter, root } = env.make(HTML)
    const out = extract(adapter, root, RULES, { templateAttr: 'cms-template' })
    assert.deepEqual(out.items, [{ name: 'Alpha' }, { name: 'Beta' }])
  })
}

// The new default must NOT break grow-from-zero: the diff fallback lookup opts
// out (templateAttr:null) so it can still SEE the seed to clone it.
test('apply (jsdom) — grow-from-zero from a cms-template seed still works', () => {
  const dom = new JSDOM('<div class="list"><div class="row" cms-template><span class="n"></span></div></div>')
  const root = dom.window.document
  apply(domAdapter, root, { items: ['.row', { name: '.n' }] }, { items: [{ name: 'X' }] }, { templateAttr: 'cms-template' })
  const rows = [...root.querySelectorAll('.row')]
  const real = rows.filter((r) => !r.hasAttribute('cms-template'))
  const seed = rows.find((r) => r.hasAttribute('cms-template'))
  assert.equal(real.length, 1, 'one real row cloned from the seed')
  assert.equal(real[0].querySelector('.n').textContent, 'X')
  assert.ok(seed, 'seed stays in the DOM')
  assert.equal(seed.querySelector('.n').textContent, '', 'seed stays pristine')
})

test('apply (jsdom) — empty list with NO seed still throws EmptyListInsert', () => {
  const dom = new JSDOM('<ul></ul>')
  const root = dom.window.document
  assert.throws(
    () => apply(domAdapter, root, { items: ['li', { name: '.n' }] }, { items: [{ name: 'X' }] }, { templateAttr: 'cms-template' }),
    (e) => e instanceof EmptyListInsert,
  )
})
