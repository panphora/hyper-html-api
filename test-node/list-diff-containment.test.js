import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// listDiff repositions a list only when its matched nodes are a contiguous run of
// siblings under one parent. A selector reaching into two containers, or skipping
// over a sibling it does not own, has no DOM order to restore: anchoring every
// node to parent(oldNodes[0]) reparented the strays into the first container and
// compacted past unowned siblings, destroying content on a write that changed
// nothing. Legitimate reordering and grow-from-zero must be unaffected.

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    all: (selector) => $(selector).toArray(),
    text: (el) => $(el).text(),
    attr: (el, name) => $(el).attr(name),
  }
}

function jsdomCtx(html) {
  const doc = new JSDOM(html).window.document
  return {
    adapter: domAdapter,
    root: doc,
    all: (selector) => [...doc.querySelectorAll(selector)],
    text: (el) => el.textContent,
    attr: (el, name) => el.getAttribute(name),
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

const CROSS_PARENT_HTML =
  '<div id="faq">' +
  '<div class="q"><h3>Q1</h3><p>A1</p></div>' +
  '<div class="q"><h3>Q2</h3><p>A2</p></div>' +
  '</div>' +
  '<div id="more">' +
  '<div class="q"><h3>Q3</h3><p>A3</p></div>' +
  '</div>'
const CROSS_PARENT_RULES = { faq: ['div.q', { q: 'h3', a: 'p' }] }

const INTERLEAVED_HTML =
  '<ul><li>a</li><li class="other">KEEP</li><li>b</li></ul>'
const INTERLEAVED_RULES = { items: 'li:not(.other)[]' }

const REORDER_HTML =
  '<ul>' +
  '<li class="t" data-orig="0">a</li>' +
  '<li class="t" data-orig="1">b</li>' +
  '<li class="t" data-orig="2">c</li>' +
  '</ul>'
const REORDER_RULES = { tags: '.t[]' }

const SEED_HTML =
  '<div class="list"><div class="row" cms-template><span class="n"></span></div></div>'
const SEED_RULES = { items: ['.row', { name: '.n' }] }

for (const env of envs) {
  test(`listDiff [${env.label}] — cross-parent list is not collapsed into the first container`, () => {
    const { adapter, root, all } = env.make(CROSS_PARENT_HTML)
    const data = extract(adapter, root, CROSS_PARENT_RULES)
    assert.equal(data.faq.length, 3)

    apply(adapter, root, CROSS_PARENT_RULES, data)

    assert.equal(all('#faq div.q').length, 2)
    assert.equal(all('#more div.q').length, 1)
  })

  test(`listDiff [${env.label}] — interleaved list does not compact past an unowned sibling`, () => {
    const { adapter, root, all, text } = env.make(INTERLEAVED_HTML)
    const data = extract(adapter, root, INTERLEAVED_RULES)
    assert.deepEqual(data.items, ['a', 'b'])

    apply(adapter, root, INTERLEAVED_RULES, data)

    const items = all('li')
    assert.equal(items.length, 3)
    assert.equal(text(items[1]), 'KEEP')
  })

  test(`listDiff [${env.label}] — a clean contiguous list still reorders in place`, () => {
    const { adapter, root, all, text, attr } = env.make(REORDER_HTML)

    apply(adapter, root, REORDER_RULES, { tags: ['c', 'b', 'a'] })

    const items = all('.t')
    assert.equal(items.length, 3)
    assert.deepEqual(items.map(text), ['c', 'b', 'a'])
    // The originals were moved, not recreated: the marker attribute rode along.
    assert.deepEqual(items.map((el) => attr(el, 'data-orig')), ['2', '1', '0'])
  })

  test(`listDiff [${env.label}] — grow-from-zero still fills the seed's container`, () => {
    const { adapter, root, all, text } = env.make(SEED_HTML)

    apply(
      adapter,
      root,
      SEED_RULES,
      { items: [{ name: 'One' }, { name: 'Two' }] },
      { templateAttr: 'cms-template' },
    )

    const real = all('.list > .row:not([cms-template])')
    assert.equal(real.length, 2)
    assert.deepEqual(real.map((el) => text(el)), ['One', 'Two'])
    assert.equal(all('.list > .row[cms-template]').length, 1)
  })
}
