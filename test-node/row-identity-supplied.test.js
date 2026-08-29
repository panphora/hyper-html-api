import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { apply, extract } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// Content matching cannot tell two byte-identical rows apart, so a caller that
// holds a stable handle on each row can say which old node an item is.
// `identifyRows` supplies that before matching; `onRowsApplied` reports the
// pairing back after the list settles.
//
// The adapters disagree about what a node IS — cheerio hands the engine
// wrappers, the DOM adapter hands it elements — so `handles` produces whatever
// this adapter would accept back through the hook and `unwrap` returns to the
// raw element every identity assertion is made on.

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    all: (selector) => $(selector).toArray(),
    handles: (selector) => $(selector).toArray().map((el) => $(el)),
    unwrap: (node) => node[0],
    detached: () => $('<li class="t">detached</li>'),
    text: (el) => $(el).text(),
  }
}

function jsdomCtx(html) {
  const doc = new JSDOM(html).window.document
  return {
    adapter: domAdapter,
    root: doc,
    all: (selector) => [...doc.querySelectorAll(selector)],
    handles: (selector) => [...doc.querySelectorAll(selector)],
    unwrap: (node) => node,
    detached: () => doc.createElement('li'),
    text: (el) => el.textContent,
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

// Two rows reading 'x' with a 'y' between them. Removing either 'x' produces
// the same array, so the matcher has to guess and the caller does not.
const XYX_HTML =
  '<ul>' +
  '<li class="t" data-orig="0">x</li>' +
  '<li class="t" data-orig="1">y</li>' +
  '<li class="t" data-orig="2">x</li>' +
  '</ul>'

const AAB_HTML =
  '<ul>' +
  '<li class="t" data-orig="0">A</li>' +
  '<li class="t" data-orig="1">A</li>' +
  '<li class="t" data-orig="2">B</li>' +
  '</ul>'

const SCALAR_HTML =
  '<ul>' +
  '<li class="t" data-orig="0">alpha</li>' +
  '<li class="t" data-orig="1">beta</li>' +
  '<li class="t" data-orig="2">gamma</li>' +
  '</ul>'

const SCALAR_RULES = { tags: '.t[]' }

const NESTED_HTML =
  '<div class="catalog">' +
  '<div class="product"><span class="pname">P1</span>' +
  '<ul><li class="variant"><span class="size">S</span></li>' +
  '<li class="variant"><span class="size">M</span></li></ul></div>' +
  '<div class="product"><span class="pname">P2</span>' +
  '<ul><li class="variant"><span class="size">L</span></li></ul></div>' +
  '</div>'
const NESTED_RULES = {
  products: ['.product', { name: '.pname', variants: ['.variant', { size: '.size' }] }],
}
const NESTED_DATA = {
  products: [
    { name: 'P1', variants: [{ size: 'S' }, { size: 'M' }] },
    { name: 'P2', variants: [{ size: 'L' }] },
  ],
}

// Hand the engine a fixed array, ignoring the items it offers.
function supply(nodes) {
  return { identifyRows: () => nodes }
}

for (const env of envs) {
  test(`supplied identity [${env.label}] — removing the first of two identical rows keeps the caller's nodes`, () => {
    const { adapter, root, all, handles } = env.make(XYX_HTML)
    const before = all('.t')
    const rows = handles('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['y', 'x'] }, supply([rows[1], rows[2]]))

    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [1, 2])
  })

  test(`supplied identity [${env.label}] — the same removal without the hook keeps a different node`, () => {
    const { adapter, root, all } = env.make(XYX_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['y', 'x'] })

    // Node 2 is destroyed rather than node 0: identical content, and the
    // matcher settles the tie on position. This is the gap the hook closes.
    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [1, 0])
  })

  test(`supplied identity [${env.label}] — dropping the first of a duplicate pair keeps nodes 1 and 2`, () => {
    const { adapter, root, all, handles } = env.make(AAB_HTML)
    const before = all('.t')
    const rows = handles('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['A', 'B'] }, supply([rows[1], rows[2]]))

    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [1, 2])
  })

  test(`supplied identity [${env.label}] — a move the data cannot show is still applied`, () => {
    const { adapter, root, all, handles, text } = env.make(AAB_HTML)
    const before = all('.t')
    const rows = handles('.t')

    // Swapping the two 'A' rows leaves the array byte-identical, so only the
    // caller knows anything happened.
    apply(adapter, root, SCALAR_RULES, { tags: ['A', 'A', 'B'] }, supply([rows[1], rows[0], rows[2]]))

    const after = all('.t')
    assert.deepEqual(after.map((el) => before.indexOf(el)), [1, 0, 2])
    assert.deepEqual(after.map(text), ['A', 'A', 'B'])
  })

  test(`supplied identity [${env.label}] — a node that is not in the list is ignored`, () => {
    const { adapter, root, all, detached } = env.make(AAB_HTML)
    const before = all('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['A', 'B'] }, supply([detached(), null]))

    // A stale handle degrades to the matcher rather than corrupting the list:
    // node 0 survives, which is exactly what the no-hook run below produces.
    assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [0, 2])
  })

  test(`supplied identity [${env.label}] — no usable hook leaves today's behaviour untouched`, () => {
    const variants = [
      ['absent', {}],
      ['returns null', { identifyRows: () => null }],
      ['returns a non-array', { identifyRows: () => ({ 0: null }) }],
    ]
    for (const [label, opts] of variants) {
      const { adapter, root, all } = env.make(AAB_HTML)
      const before = all('.t')

      apply(adapter, root, SCALAR_RULES, { tags: ['A', 'B'] }, opts)

      assert.deepEqual(all('.t').map((el) => before.indexOf(el)), [0, 2], label)
    }
  })

  test(`supplied identity [${env.label}] — a node offered twice is used once`, () => {
    const { adapter, root, all, handles } = env.make(AAB_HTML)
    const before = all('.t')
    const rows = handles('.t')

    apply(adapter, root, SCALAR_RULES, { tags: ['A', 'B'] }, supply([rows[1], rows[1]]))

    const after = all('.t')
    // The first offer locks node 1; the second falls through to the matcher,
    // which pairs the 'B' item with node 2.
    assert.deepEqual(after.map((el) => before.indexOf(el)), [1, 2])
    assert.notEqual(after[0], after[1])
  })

  test(`supplied identity [${env.label}] — onRowsApplied reports the nodes the list ended with`, () => {
    const { adapter, root, all, unwrap } = env.make(SCALAR_HTML)
    const calls = []

    apply(adapter, root, SCALAR_RULES, { tags: ['alpha', 'NEW', 'beta', 'gamma'] }, {
      onRowsApplied: (path, nodes) => calls.push({ path, nodes }),
    })

    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].path, ['tags'])
    assert.equal(calls[0].nodes.length, 4)
    const after = all('.t')
    assert.deepEqual(calls[0].nodes.map((n) => after.indexOf(unwrap(n))), [0, 1, 2, 3])
  })

  test(`supplied identity [${env.label}] — onRowsApplied fires per list, with that list's own path`, () => {
    const { adapter, root, all, unwrap } = env.make(NESTED_HTML)
    const calls = []

    apply(adapter, root, NESTED_RULES, NESTED_DATA, {
      onRowsApplied: (path, nodes) => calls.push({ path, nodes }),
    })

    // Each item's nested list settles inside the outer list's write pass, so
    // the inner reports land before the outer one.
    assert.deepEqual(calls.map((c) => c.path), [
      ['products', 0, 'variants'],
      ['products', 1, 'variants'],
      ['products'],
    ])
    assert.deepEqual(calls.map((c) => c.nodes.length), [2, 1, 2])

    const products = all('.product')
    assert.deepEqual(calls[2].nodes.map((n) => products.indexOf(unwrap(n))), [0, 1])
    const variants = all('.variant')
    assert.deepEqual(calls[0].nodes.map((n) => variants.indexOf(unwrap(n))), [0, 1])
    assert.deepEqual(calls[1].nodes.map((n) => variants.indexOf(unwrap(n))), [2])
  })
}

// Everything below covers a path that had no test anywhere: reverting any of
// them left both suites green.

const ABAB_HTML =
  '<ul>' +
  '<li class="t" data-orig="0">A</li>' +
  '<li class="t" data-orig="1">B</li>' +
  '<li class="t" data-orig="2">A</li>' +
  '<li class="t" data-orig="3">B</li>' +
  '</ul>'

for (const env of envs) {
  // The whole point of counting anchor uniqueness over the UNLOCKED rows only.
  // Locking one of the two A rows leaves the other unambiguous, so it can anchor
  // to where it moved. Counting the locked row too left it looking duplicated,
  // and since the alignment pass only produces order-preserving pairs, losing
  // that anchor loses any way to express the crossing move at all.
  test(`supplied identity [${env.label}] — a lock lets the remaining duplicate anchor across a crossing move`, () => {
    const { adapter, root, all, handles, text } = env.make(ABAB_HTML)
    const before = all('.t')
    apply(adapter, root, { tags: '.t[]' }, { tags: ['A', 'B', 'B', 'A'] }, {
      // only the first row is named; the other three are left to the matcher
      identifyRows: () => [handles('.t')[0], null, null, null],
    })
    const after = all('.t')
    assert.deepEqual(after.map((n) => text(n)), ['A', 'B', 'B', 'A'])
    assert.deepEqual(
      after.map((n) => before.indexOf(n)),
      [0, 1, 3, 2],
      'every node moved to where its content went; none was rewritten to carry another row',
    )
  })

  test(`supplied identity [${env.label}] — a list that settles empty still reports once`, () => {
    const { adapter, root } = env.make('<ul><li class="t">a</li><li class="t">b</li></ul>')
    const calls = []
    apply(adapter, root, { tags: '.t[]' }, { tags: [] }, {
      onRowsApplied: (path, nodes) => calls.push({ path: path.join('.'), n: nodes.length }),
    })
    assert.deepEqual(calls, [{ path: 'tags', n: 0 }])
  })

  test(`supplied identity [${env.label}] — onRowsRead reports both list syntaxes, under full paths`, () => {
    const { adapter, root } = env.make(
      '<div class="p"><span class="n">P1</span><i class="tag">x</i></div>' +
        '<div class="p"><span class="n">P2</span><i class="tag">y</i><i class="tag">z</i></div>',
    )
    const seen = []
    extract(adapter, root, { ps: ['.p', { n: '.n', tags: '.tag[]' }] }, {
      onRowsRead: (path, nodes) => seen.push([path.join('.'), nodes.length]),
    })
    assert.deepEqual(seen, [['ps', 2], ['ps.0.tags', 1], ['ps.1.tags', 2]])
  })

  test(`supplied identity [${env.label}] — onRowsRead never fires from inside apply`, () => {
    const { adapter, root } = env.make(
      '<div class="p"><span class="n">P1</span><i class="tag">x</i></div>' +
        '<div class="p"><span class="n">P2</span><i class="tag">y</i></div>',
    )
    const seen = []
    apply(adapter, root, { ps: ['.p', { n: '.n', tags: '.tag[]' }] },
      { ps: [{ n: 'P1', tags: ['x'] }, { n: 'P2', tags: ['y'] }] },
      { onRowsRead: (path) => seen.push(path.join('.')) })
    assert.deepEqual(seen, [], 'listDiff re-reads each row under a restarted path, so it must not report')
  })

  test(`supplied identity [${env.label}] — applying unchanged text writes nothing`, () => {
    const { adapter, root } = env.make(
      '<h1 class="ti">T</h1><ul><li class="t"><span class="n">a</span></li>' +
        '<li class="t"><span class="n">b</span></li></ul>',
    )
    const rules = { ti: '.ti', rows: ['.t', { n: '.n' }] }
    const data = { ti: 'T', rows: [{ n: 'a' }, { n: 'b' }] }
    let writes = 0
    const counting = {
      ...adapter,
      text: (node, value) => (value === undefined ? adapter.text(node) : (writes++, adapter.text(node, value))),
    }
    apply(counting, root, rules, data)
    assert.equal(writes, 0, 'an apply of identical data touched no text node')
    apply(counting, root, rules, { ti: 'T', rows: [{ n: 'a' }, { n: 'CHANGED' }] })
    assert.equal(writes, 1, 'a real edit still writes, exactly once')
  })
}
