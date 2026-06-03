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

// --- Nested / array-scoped seed skip ----------------------------------------
// The flat top-level case above is covered. This is the scope where the real
// B5-1 bug materialized: a [cms-template] seed sitting INSIDE an inner,
// array-scoped list (variants[] within each products[] item). The default skip
// must reach down into the nested extract so the inner list gets NO phantom
// empty record.
const NESTED_HTML =
  '<div class="products">' +
  '<div class="product"><span class="pname">Shirt</span>' +
  '<div class="variants">' +
  '<div class="variant"><span class="vname">Red</span></div>' +
  '<div class="variant"><span class="vname">Blue</span></div>' +
  '<div class="variant" cms-template><span class="vname"></span></div>' +
  '</div></div>' +
  '<div class="product"><span class="pname">Hat</span>' +
  '<div class="variants">' +
  '<div class="variant"><span class="vname">Green</span></div>' +
  '</div></div>' +
  '</div>'
const NESTED_RULES = {
  products: ['.product', { name: '.pname', variants: ['.variant', { name: '.vname' }] }],
}

for (const env of [{ label: 'cheerio', make: cheerioCtx }, { label: 'jsdom', make: jsdomCtx }]) {
  test(`extract [${env.label}] — nested array-scoped cms-template seed skipped by DEFAULT (no phantom inner record)`, () => {
    const { adapter, root } = env.make(NESTED_HTML)
    const out = extract(adapter, root, NESTED_RULES) // no opts
    assert.deepEqual(out.products, [
      { name: 'Shirt', variants: [{ name: 'Red' }, { name: 'Blue' }] },
      { name: 'Hat', variants: [{ name: 'Green' }] },
    ])
  })
}

// Cross-adapter equality on the nested-seed fixture (mirrors adapter-parity).
// A single strong lock against the two adapters diverging on seed handling
// inside an array-scoped list.
test('extract — DOM and cheerio agree on the nested cms-template seed fixture', () => {
  const cheerioOut = extract(cheerioAdapter, cheerio.load(NESTED_HTML).root(), NESTED_RULES)
  const jsdomOut = extract(domAdapter, new JSDOM(NESTED_HTML).window.document, NESTED_RULES)
  assert.equal(JSON.stringify(jsdomOut), JSON.stringify(cheerioOut))
})

// --- APPLY must not write INTO a seed (default, both adapters) ---------------
// The default skip is symmetric: a write target list must leave the
// [cms-template] seed's fields PRISTINE, even with no templateAttr passed.
// (Confirmed against src: listDiff's oldNodes come from adapter.find(...opts)
// with no templateAttr, so the adapter default skips the seed as a write
// target; the grow fallback only consults the seed when templateAttr is set.)
const SEED_SENTINEL_HTML =
  '<div class="list">' +
  '<div class="row"><span class="n">Alpha</span></div>' +
  '<div class="row"><span class="n">Beta</span></div>' +
  '<div class="row" cms-template><span class="n">DO_NOT_CHANGE</span></div>' +
  '</div>'
const SEED_RULES = { items: ['.row', { name: '.n' }] }

test('apply (jsdom) — does NOT write into the cms-template seed by DEFAULT (seed stays pristine)', () => {
  const dom = new JSDOM(SEED_SENTINEL_HTML)
  const root = dom.window.document
  apply(domAdapter, root, SEED_RULES, { items: [{ name: 'One' }, { name: 'Two' }] }) // no opts
  const rows = [...root.querySelectorAll('.row')]
  const seed = rows.find((r) => r.hasAttribute('cms-template'))
  const real = rows.filter((r) => !r.hasAttribute('cms-template'))
  assert.deepEqual(real.map((r) => r.querySelector('.n').textContent), ['One', 'Two'])
  assert.ok(seed, 'seed stays in the DOM')
  assert.equal(seed.querySelector('.n').textContent, 'DO_NOT_CHANGE', 'seed field untouched')
})

test('apply (cheerio) — does NOT write into the cms-template seed by DEFAULT (seed stays pristine)', () => {
  const $ = cheerio.load(SEED_SENTINEL_HTML)
  apply(cheerioAdapter, $.root(), SEED_RULES, { items: [{ name: 'One' }, { name: 'Two' }] }) // no opts
  const rows = $('.row').toArray().map((el) => $(el))
  const seed = rows.find((r) => r.attr('cms-template') !== undefined)
  const real = rows.filter((r) => r.attr('cms-template') === undefined)
  assert.deepEqual(real.map((r) => r.find('.n').text()), ['One', 'Two'])
  assert.ok(seed, 'seed stays in the DOM')
  assert.equal(seed.find('.n').text(), 'DO_NOT_CHANGE', 'seed field untouched')
})
