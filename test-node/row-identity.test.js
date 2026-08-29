import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// A list creates a node only when it grows and destroys one only when it
// shrinks. Editing a row is not a structural change, so the row's node has to
// survive the edit however few fields the row has: the field being typed into
// is the same field that used to have to prove who the row was.

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    all: (selector) => $(selector).toArray(),
    text: (el) => $(el).text(),
    attr: (el, name) => $(el).attr(name),
    same: (a, b) => a === b,
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
    same: (a, b) => a === b,
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

// One bound field per row, plus an image the rules say nothing about. The
// image is what proves the row was kept rather than rebuilt from row 0.
const ONE_FIELD_HTML =
  '<ul>' +
  '<li class="row" data-orig="0"><span class="n">Ann</span><img src="ann.png"></li>' +
  '<li class="row" data-orig="1"><span class="n">Bob</span><img src="bob.png"></li>' +
  '<li class="row" data-orig="2"><span class="n">Cal</span><img src="cal.png"></li>' +
  '</ul>'
const ONE_FIELD_RULES = { people: ['li.row', { name: '.n' }] }

const TWO_FIELD_HTML =
  '<ul>' +
  '<li class="row" data-orig="0"><span class="n">Ann</span><span class="q">1</span></li>' +
  '<li class="row" data-orig="1"><span class="n">Bob</span><span class="q">2</span></li>' +
  '</ul>'
const TWO_FIELD_RULES = { people: ['li.row', { name: '.n', qty: '.q' }] }

const SCALAR_HTML =
  '<ul>' +
  '<li class="t" data-orig="0">alpha</li>' +
  '<li class="t" data-orig="1">beta</li>' +
  '<li class="t" data-orig="2">gamma</li>' +
  '</ul>'
const SCALAR_RULES = { tags: '.t[]' }

for (const env of envs) {
  test(`row identity [${env.label}] — a one-field row survives an edit to its only field`, () => {
    const { adapter, root, all, attr } = env.make(ONE_FIELD_HTML)
    const data = extract(adapter, root, ONE_FIELD_RULES)
    data.people[1].name = 'Bo'

    apply(adapter, root, ONE_FIELD_RULES, data)

    const rows = all('li.row')
    assert.equal(rows.length, 3)
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['0', '1', '2'])
    assert.deepEqual(all('img').map((el) => attr(el, 'src')), ['ann.png', 'bob.png', 'cal.png'])
  })

  test(`row identity [${env.label}] — typing a one-field row to empty and back keeps the node`, () => {
    const { adapter, root, all, attr } = env.make(ONE_FIELD_HTML)
    const data = extract(adapter, root, ONE_FIELD_RULES)

    for (const value of ['Bo', 'B', '', 'D', 'Da', 'Dan']) {
      data.people[1].name = value
      apply(adapter, root, ONE_FIELD_RULES, data)
    }

    const rows = all('li.row')
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['0', '1', '2'])
    assert.deepEqual(all('img').map((el) => attr(el, 'src')), ['ann.png', 'bob.png', 'cal.png'])
  })

  test(`row identity [${env.label}] — a two-field row survives both fields changing`, () => {
    const { adapter, root, all, attr } = env.make(TWO_FIELD_HTML)
    const data = extract(adapter, root, TWO_FIELD_RULES)
    data.people[1] = { name: 'Zed', qty: '9' }

    apply(adapter, root, TWO_FIELD_RULES, data)

    const rows = all('li.row')
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['0', '1'])
  })

  test(`row identity [${env.label}] — a scalar list row survives an edit`, () => {
    const { adapter, root, all, attr, text } = env.make(SCALAR_HTML)

    apply(adapter, root, SCALAR_RULES, { tags: ['alpha', 'bet', 'gamma'] })

    const rows = all('.t')
    assert.deepEqual(rows.map(text), ['alpha', 'bet', 'gamma'])
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['0', '1', '2'])
  })

  test(`row identity [${env.label}] — every row edited at once still reuses every node`, () => {
    const { adapter, root, all, attr } = env.make(SCALAR_HTML)

    apply(adapter, root, SCALAR_RULES, { tags: ['x', 'y', 'z'] })

    assert.deepEqual(all('.t').map((el) => attr(el, 'data-orig')), ['0', '1', '2'])
  })

  test(`row identity [${env.label}] — an edited row keeps its node across a reorder`, () => {
    const { adapter, root, all, attr, text } = env.make(SCALAR_HTML)

    apply(adapter, root, SCALAR_RULES, { tags: ['gamma', 'BETA', 'alpha'] })

    const rows = all('.t')
    assert.deepEqual(rows.map(text), ['gamma', 'BETA', 'alpha'])
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['2', '1', '0'])
  })

  test(`row identity [${env.label}] — insert in the middle builds exactly one node`, () => {
    const { adapter, root, all, text } = env.make(SCALAR_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['alpha', 'NEW', 'beta', 'gamma'] })

    const rows = all('.t')
    assert.deepEqual(rows.map(text), ['alpha', 'NEW', 'beta', 'gamma'])
    assert.deepEqual(rows.map((el) => before.indexOf(el)), [0, -1, 1, 2])
  })

  test(`row identity [${env.label}] — remove in the middle destroys exactly one node`, () => {
    const { adapter, root, all, attr, text } = env.make(SCALAR_HTML)

    apply(adapter, root, SCALAR_RULES, { tags: ['alpha', 'gamma'] })

    const rows = all('.t')
    assert.deepEqual(rows.map(text), ['alpha', 'gamma'])
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['0', '2'])
  })

  test(`row identity [${env.label}] — an all-identical list keeps every row in place on an edit`, () => {
    const html =
      '<ul>' +
      '<li class="t" data-orig="0"></li>' +
      '<li class="t" data-orig="1"></li>' +
      '<li class="t" data-orig="2"></li>' +
      '</ul>'
    const { adapter, root, all, attr, text } = env.make(html)

    apply(adapter, root, SCALAR_RULES, { tags: ['', 'x', ''] })

    const rows = all('.t')
    assert.deepEqual(rows.map(text), ['', 'x', ''])
    assert.deepEqual(rows.map((el) => attr(el, 'data-orig')), ['0', '1', '2'])
  })

  test(`row identity [${env.label}] — a new row at the front of a duplicate list is the new node`, () => {
    const html = '<ul><li class="t">same</li><li class="t">same</li></ul>'
    const { adapter, root, all } = env.make(html)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['NEW', 'same', 'same'] })

    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [-1, 0, 1])
  })

  // The shipped CMS reorders: move-up / move-down (hypercms/src/events.js
  // onMove) and drag-to-sort (hypercms/src/form-builder.js wireSortable) both
  // commit a same-length array in which every position moved. Content anchors
  // are what carry these, and they must keep working.
  test(`row identity [${env.label}] — move-up keeps both nodes`, () => {
    const { adapter, root, all } = env.make(SCALAR_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['beta', 'alpha', 'gamma'] })

    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [1, 0, 2])
  })

  test(`row identity [${env.label}] — drag to the front keeps every node`, () => {
    const { adapter, root, all } = env.make(SCALAR_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['gamma', 'alpha', 'beta'] })

    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [2, 0, 1])
  })

  test(`row identity [${env.label}] — a full reversal keeps every node`, () => {
    const { adapter, root, all } = env.make(SCALAR_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['gamma', 'beta', 'alpha'] })

    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [2, 1, 0])
  })

  test(`row identity [${env.label}] — a reorder that also edits a row keeps every node`, () => {
    const { adapter, root, all, text } = env.make(SCALAR_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['gamma', 'BETA', 'alpha'] })

    const rows = all('.t')
    assert.deepEqual(rows.map(text), ['gamma', 'BETA', 'alpha'])
    assert.deepEqual(rows.map((el) => before.indexOf(el)), [2, 1, 0])
  })

  test(`row identity [${env.label}] — an object row keeps its node across a reorder plus an edit`, () => {
    const { adapter, root, all } = env.make(TWO_FIELD_HTML)
    const before = all('li.row')

    apply(adapter, root, TWO_FIELD_RULES, {
      people: [{ name: 'Bob', qty: '9' }, { name: 'Ann', qty: '1' }],
    })

    assert.deepEqual(all('li.row').map((el) => before.indexOf(el)), [1, 0])
  })
}
