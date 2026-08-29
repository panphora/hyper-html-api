import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// A row's identity is its place in the list, not the content the user is
// editing. Editing a field must never destroy the node that field lives in.
// `all()` returns raw elements in both environments, so `===` is real node
// identity in both.

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    all: (s) => $(s).toArray(),
    text: (el) => $(el).text().trim(),
    mark: (el, v) => $(el).attr('data-mark', v),
  }
}
function jsdomCtx(html) {
  const doc = new JSDOM(html).window.document
  return {
    adapter: domAdapter,
    root: doc,
    all: (s) => [...doc.querySelectorAll(s)],
    text: (el) => el.textContent.trim(),
    mark: (el, v) => el.setAttribute('data-mark', v),
  }
}
const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

// assert.deepEqual on DOM nodes compares STRUCTURE, so two different but
// identical <li> elements pass it. Identity has to be ===.
function sameNodes(actual, expected, msg) {
  assert.equal(actual.length, expected.length, (msg || '') + ' (length)')
  for (let i = 0; i < expected.length; i++) {
    assert.ok(actual[i] === expected[i], `${msg || 'node identity'} at index ${i}`)
  }
}

const stack = []
function muteWarn() { stack.push(console.warn); console.warn = () => {} }
function restoreWarn() { console.warn = stack.pop() }

for (const env of envs) {
  test(`row identity [${env.label}] — 1-field row survives an edit to its only field`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="c"><span class="t">alpha</span></li>' +
        '<li class="c"><span class="t">beta</span></li>' +
        '<li class="c"><span class="t">gamma</span></li></ul>',
    )
    const rules = { caps: ['.c', { t: '.t' }] }
    const before = all('.c')
    muteWarn()
    apply(adapter, root, rules, { caps: [{ t: 'alpha' }, { t: 'bet' }, { t: 'gamma' }] })
    restoreWarn()

    const after = all('.c')
    assert.equal(after.length, 3)
    assert.deepEqual(after.map(text), ['alpha', 'bet', 'gamma'])
    sameNodes(after, before, 'every node is the same node instance')
  })

  test(`row identity [${env.label}] — scalar 1-field list survives an edit`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="t">alpha</li><li class="t">beta</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['alpha', 'bet'] })
    restoreWarn()
    const after = all('.t')
    assert.deepEqual(after.map(text), ['alpha', 'bet'])
    sameNodes(after, before, 'row identity')
  })

  test(`row identity [${env.label}] — 2-field row survives BOTH fields changing`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="i"><span class="n">A</span><span class="p">1</span></li>' +
        '<li class="i"><span class="n">B</span><span class="p">2</span></li></ul>',
    )
    const rules = { items: ['.i', { n: '.n', p: '.p' }] }
    const before = all('.i')
    muteWarn()
    apply(adapter, root, rules, { items: [{ n: 'A', p: '1' }, { n: 'Z', p: '9' }] })
    restoreWarn()
    sameNodes(all('.i'), before, 'row identity')
    assert.deepEqual(extract(adapter, root, rules).items, [{ n: 'A', p: '1' }, { n: 'Z', p: '9' }])
  })

  test(`row identity [${env.label}] — every row's fields changing at once still reuses every row`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="i"><span class="n">A</span></li>' +
        '<li class="i"><span class="n">B</span></li>' +
        '<li class="i"><span class="n">C</span></li></ul>',
    )
    const rules = { items: ['.i', { n: '.n' }] }
    const before = all('.i')
    muteWarn()
    apply(adapter, root, rules, { items: [{ n: 'X' }, { n: 'Y' }, { n: 'Z' }] })
    restoreWarn()
    sameNodes(all('.i'), before, 'row identity')
  })

  test(`row identity [${env.label}] — typing every character of a 1-field row keeps one node`, () => {
    const { adapter, root, all } = env.make('<ul><li class="t">x</li></ul>')
    const before = all('.t')
    muteWarn()
    for (const v of ['xh', 'xhe', 'xhel', 'xhell', 'xhello']) {
      apply(adapter, root, { tags: '.t[]' }, { tags: [v] })
    }
    restoreWarn()
    sameNodes(all('.t'), before, 'node survived every keystroke')
  })

  test(`row identity [${env.label}] — append then type keeps the appended row's node`, () => {
    const { adapter, root, all } = env.make('<ul><li class="t">a</li></ul>')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', ''] })
    restoreWarn()
    const afterAppend = all('.t')
    assert.equal(afterAppend.length, 2)

    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'h'] })
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'hi'] })
    restoreWarn()

    sameNodes(all('.t'), afterAppend, 'appended node survived typing')
  })

  test(`row identity [${env.label}] — editing a row in a duplicate-content list keeps that row`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="t">a</li><li class="t">a</li><li class="t">a</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'ab', 'a'] })
    restoreWarn()
    const after = all('.t')
    assert.deepEqual(after.map(text), ['a', 'ab', 'a'])
    sameNodes(after, before, 'the edited row is still the middle node')
  })

  test(`row identity [${env.label}] — an edit never clones the template`, () => {
    const { adapter, root, all } = env.make('<ul><li class="t" id="only">alpha</li></ul>')
    let warned = 0
    const saved = console.warn
    console.warn = () => warned++
    apply(adapter, root, { tags: '.t[]' }, { tags: ['zzz'] })
    console.warn = saved
    assert.equal(warned, 0, 'a same-length apply must not clone (no stripIds warning)')
    assert.equal(all('.t').length, 1)
  })

  test(`row identity [${env.label}] — deleting the middle row removes THAT node`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">c</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'c'] })
    restoreWarn()
    sameNodes(all('.t'), [before[0], before[2]], 'the deleted node is the middle one')
  })

  test(`row identity [${env.label}] — inserting in the middle keeps both neighbours`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="t">a</li><li class="t">c</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'b', 'c'] })
    restoreWarn()
    const after = all('.t')
    assert.deepEqual(after.map(text), ['a', 'b', 'c'])
    assert.equal(after[0], before[0])
    assert.equal(after[2], before[1])
    assert.notEqual(after[1], before[0])
  })

  test(`row identity [${env.label}] — reorder still moves the nodes, it does not rewrite them`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">c</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['c', 'b', 'a'] })
    restoreWarn()
    const after = all('.t')
    assert.deepEqual(after.map(text), ['c', 'b', 'a'])
    sameNodes(after, [before[2], before[1], before[0]], 'reorder moved the original nodes')
  })

  test(`row identity [${env.label}] — a shrinking list never clones`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">c</li></ul>',
    )
    const before = all('.t')
    // Counting clone calls, not just checking the survivor. Asserting only that
    // the survivor is an original node passes whether or not a template was
    // cloned, because a shrinking list pairs every item and never USES the
    // clone. This is what makes the needsTemplate gate observable.
    let clones = 0
    const counting = { ...adapter, clone: (n) => { clones++; return adapter.clone(n) } }
    muteWarn()
    apply(counting, root, { tags: '.t[]' }, { tags: ['q'] })
    restoreWarn()
    const after = all('.t')
    assert.equal(after.length, 1)
    assert.ok(before.includes(after[0]), 'the surviving row is an original node')
    assert.equal(clones, 0, 'a list that only shrank cloned nothing')
  })
}

// The shipped CMS reorders: move-up / move-down (hypercms/src/events.js onMove)
// and drag-to-sort (wireSortable -> hyperclayjs [sortable] -> hypercmsCommit).
// Both hand apply() a same-length array in which every position moved, so a
// position-only matcher would rewrite N rows instead of moving them. Pass 2 is
// what keeps a move a move.
for (const env of envs) {
  test(`reorder [${env.label}] — move-up swaps two adjacent object rows, node and all`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="i"><span class="n">A</span><span class="p">1</span><span class="d">da</span></li>' +
        '<li class="i"><span class="n">B</span><span class="p">2</span><span class="d">db</span></li>' +
        '<li class="i"><span class="n">C</span><span class="p">3</span><span class="d">dc</span></li></ul>',
    )
    const rules = { items: ['.i', { n: '.n', p: '.p', d: '.d' }] }
    const before = all('.i')
    const data = extract(adapter, root, rules).items
    // move-up on index 2
    const moved = [data[0], data[2], data[1]]
    muteWarn()
    apply(adapter, root, rules, { items: moved })
    restoreWarn()
    const after = all('.i')
    assert.deepEqual(extract(adapter, root, rules).items, moved)
    sameNodes(after, [before[0], before[2], before[1]], 'move-up moved the node')
  })

  test(`reorder [${env.label}] — drag reorder of a 1-field object list moves every node`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="i"><span class="n">A</span></li>' +
        '<li class="i"><span class="n">B</span></li>' +
        '<li class="i"><span class="n">C</span></li>' +
        '<li class="i"><span class="n">D</span></li></ul>',
    )
    const rules = { items: ['.i', { n: '.n' }] }
    const before = all('.i')
    const moved = [{ n: 'D' }, { n: 'A' }, { n: 'C' }, { n: 'B' }]
    muteWarn()
    apply(adapter, root, rules, { items: moved })
    restoreWarn()
    assert.deepEqual(extract(adapter, root, rules).items, moved)
    sameNodes(all('.i'), [before[3], before[0], before[2], before[1]], 'drag reorder')
  })

  test(`reorder [${env.label}] — reorder never clones and never removes`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="t" id="a">a</li><li class="t" id="b">b</li><li class="t" id="c">c</li></ul>',
    )
    const before = all('.t')
    let warned = 0
    const saved = console.warn
    console.warn = () => warned++
    apply(adapter, root, { tags: '.t[]' }, { tags: ['b', 'c', 'a'] })
    console.warn = saved
    assert.equal(warned, 0, 'a reorder must not clone the template')
    sameNodes(all('.t'), [before[1], before[2], before[0]], 'reorder')
  })

  test(`reorder [${env.label}] — reorder of an edited row keeps that row's node`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">c</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'bZ', 'c'] })   // edit row 1
    apply(adapter, root, { tags: '.t[]' }, { tags: ['bZ', 'a', 'c'] })   // then move it up
    restoreWarn()
    sameNodes(all('.t'), [before[1], before[0], before[2]], 'edit then reorder')
  })

  test(`reorder [${env.label}] — a row that only MOVES past unchanged rows still moves`, () => {
    const { adapter, root, all } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">c</li>' +
        '<li class="t">d</li><li class="t">e</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'b', 'd', 'c', 'e'] })
    restoreWarn()
    sameNodes(all('.t'), [before[0], before[1], before[3], before[2], before[4]], 'local swap')
  })

  test(`reorder [${env.label}] — move-up in a list with two identical rows`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">a</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    apply(adapter, root, { tags: '.t[]' }, { tags: ['a', 'a', 'b'] })
    restoreWarn()
    const after = all('.t')
    assert.deepEqual(after.map(text), ['a', 'a', 'b'])
    sameNodes(after, [before[0], before[2], before[1]], 'duplicate-row reorder')
  })
}

// A multi-row delta (clay.data or an undo that restores a whole earlier array)
// can leave unmatched rows at both ends. Pairing the leftovers in list order
// would reuse the wrong node; pairInOrder picks the non-crossing pairing whose
// indices sit closest together.
for (const env of envs) {
  test(`row identity [${env.label}] — leftovers pair with the nearest row, not the first`, () => {
    const { adapter, root, all, text } = env.make(
      '<ul><li class="t">a</li><li class="t">b</li><li class="t">c</li>' +
        '<li class="t">d</li><li class="t">e</li><li class="t">f</li></ul>',
    )
    const before = all('.t')
    muteWarn()
    // 'a' deleted from the head, 'f' edited to 'X'. Leftover old = [0, 5],
    // leftover new = [4]. The surviving leftover must be node 'f', not node 'a'.
    apply(adapter, root, { tags: '.t[]' }, { tags: ['b', 'c', 'd', 'e', 'X'] })
    restoreWarn()
    const after = all('.t')
    assert.deepEqual(after.map(text), ['b', 'c', 'd', 'e', 'X'])
    sameNodes(after, [before[1], before[2], before[3], before[4], before[5]], 'nearest leftover')
  })
}
