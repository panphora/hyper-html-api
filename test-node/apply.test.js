import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import {
  ShapeMismatch,
  EmptyListInsert,
  MaxRuleDepthExceeded,
} from '../src/engine/errors.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// Silence the ID-strip warning in test output; a dedicated test re-enables it.
const originalWarn = console.warn
function muteWarn() {
  console.warn = () => {}
}
function restoreWarn() {
  console.warn = originalWarn
}

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return { adapter: cheerioAdapter, root: $.root(), $, serialize: () => $.html() }
}

function jsdomCtx(html) {
  const dom = new JSDOM(html)
  return {
    adapter: domAdapter,
    root: dom.window.document,
    serialize: () => dom.window.document.documentElement.outerHTML,
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

for (const env of envs) {
  test(`apply [${env.label}] — scalar set / null / omit, partial update`, () => {
    const { adapter, root } = env.make(
      '<div class="dashboard"><h1 class="title">Old</h1><p class="sub">Keep</p><span class="name">NA</span></div>',
    )
    const rules = { title: '.title', sub: '.sub', name: '.name' }

    muteWarn()
    apply(adapter, root, rules, { title: 'New', name: null })
    restoreWarn()

    const result = extract(adapter, root, rules)
    assert.equal(result.title, 'New')
    assert.equal(result.sub, 'Keep') // untouched (key omitted from input)
    // Plain text selector: blanked text reads back as "" (not null — that's
    // the attr/prop path). Legacy extractElementText returns element.text()
    // without || null coercion.
    assert.equal(result.name, '')
  })

  test(`apply [${env.label}] — object array: update + insert + remove + reorder round-trips`, () => {
    const { adapter, root } = env.make(
      '<ul class="list">' +
        '<li class="item"><span class="name">A</span><span class="price">1</span></li>' +
        '<li class="item"><span class="name">B</span><span class="price">2</span></li>' +
        '<li class="item"><span class="name">C</span><span class="price">3</span></li>' +
        '</ul>',
    )
    const rules = {
      items: ['.item', { name: '.name', price: '.price' }],
    }

    const newItems = [
      { name: 'B', price: '2' }, // reorder: was at index 1
      { name: 'D', price: '4' }, // insert
      { name: 'A', price: '1' }, // reorder: was at index 0
    ]

    muteWarn()
    apply(adapter, root, rules, { items: newItems })
    restoreWarn()

    const result = extract(adapter, root, rules)
    assert.deepEqual(result.items, newItems)
  })

  test(`apply [${env.label}] — scalar array: insert + remove + reorder`, () => {
    const { adapter, root } = env.make(
      '<div><span class="tag">red</span><span class="tag">green</span><span class="tag">blue</span></div>',
    )
    const rules = { tags: '.tag[]' }

    muteWarn()
    apply(adapter, root, rules, { tags: ['blue', 'yellow', 'red'] })
    restoreWarn()

    assert.deepEqual(extract(adapter, root, rules).tags, ['blue', 'yellow', 'red'])
  })

  test(`apply [${env.label}] — empty list + non-empty new throws EmptyListInsert`, () => {
    const { adapter, root } = env.make('<ul class="list"></ul>')
    const rules = { items: ['.item', { name: '.name' }] }
    assert.throws(
      () => apply(adapter, root, rules, { items: [{ name: 'X' }] }),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.match(err.message, /Seed/)
        return true
      },
    )
  })

  test(`apply [${env.label}] — non-empty list + empty new removes all`, () => {
    const { adapter, root } = env.make(
      '<ul><li class="item">x</li><li class="item">y</li></ul>',
    )
    const rules = { items: '.item[]' }
    apply(adapter, root, rules, { items: [] })
    assert.deepEqual(extract(adapter, root, rules).items, [])
  })

  test(`apply [${env.label}] — ShapeMismatch is thrown before any mutation`, () => {
    const { adapter, root, serialize } = env.make(
      '<div><h1 class="title">T</h1><p class="sub">S</p></div>',
    )
    const before = serialize()
    const rules = { title: '.title', sub: '.sub', items: ['.item', { x: '.x' }] }
    const bad = { title: { unexpected: 'obj' }, sub: ['array'], items: 'not array' }

    assert.throws(
      () => apply(adapter, root, rules, bad),
      (err) => {
        assert.ok(err instanceof ShapeMismatch)
        assert.equal(err.mismatches.length, 3)
        return true
      },
    )
    assert.equal(serialize(), before)
  })

  test(`apply [${env.label}] — @attr write: sets, blanks on null, blanks on ""`, () => {
    // data-link instead of href so DOM doesn't normalize (a.href → absolute
    // URL with trailing slash) — this tests the attr path, not the prop path.
    const { adapter, root } = env.make(
      '<div><a class="lnk" data-link="one">one</a></div>',
    )
    const rules = { link: '.lnk@data-link' }

    apply(adapter, root, rules, { link: 'two' })
    assert.equal(extract(adapter, root, rules).link, 'two')

    apply(adapter, root, rules, { link: null })
    assert.equal(extract(adapter, root, rules).link, null) // extract collapses "" → null

    apply(adapter, root, rules, { link: '' })
    assert.equal(extract(adapter, root, rules).link, null)
  })

  test(`apply [${env.label}] — deep apply (21 levels) throws MaxRuleDepthExceeded`, () => {
    const { adapter, root } = env.make('<div><h1>ok</h1></div>')
    // build a 21-level rule path to trip the depth guard
    let rule = 'h1'
    const keys = 'abcdefghijklmnopqrstu'.split('')
    let data = 'x'
    for (const k of keys) {
      rule = { [k]: rule }
      data = { [k]: data }
    }
    assert.throws(
      () => apply(adapter, root, rule, data),
      (err) => err instanceof MaxRuleDepthExceeded,
    )
  })
}

test('apply (jsdom) — boolean prop coercion: true/false/null', () => {
  const { adapter, root } = jsdomCtx(
    '<form><input id="agree" type="checkbox"><input id="other" type="checkbox" checked></form>',
  )
  const rules = { agree: '#agree@checked', other: '#other@checked' }

  apply(adapter, root, rules, { agree: true, other: false })
  // prop-level read (not through legacy String() coercion)
  const agreeEl = root.getElementById('agree')
  const otherEl = root.getElementById('other')
  assert.equal(agreeEl.checked, true)
  assert.equal(otherEl.checked, false)

  apply(adapter, root, rules, { agree: null })
  assert.equal(agreeEl.checked, false)
})

test('apply (jsdom) — @innerHTML write + round-trip', () => {
  const { adapter, root } = jsdomCtx('<div><div id="bio">old</div></div>')
  const rules = { bio: '#bio@innerHTML' }
  apply(adapter, root, rules, { bio: '<em>hi</em>' })
  const bioEl = root.getElementById('bio')
  assert.equal(bioEl.innerHTML, '<em>hi</em>')
})

test('apply (jsdom) — template captured before old[0] is detached', () => {
  // The first old item has a unique marker. We update a later item so oldNodes[0]
  // stays in place, AND we insert one new item. The inserted clone should carry
  // the marker because the template was cloned from the first item up-front.
  const { adapter, root } = jsdomCtx(
    '<ul>' +
      '<li class="item first-item" data-marker="yes"><span class="name">A</span></li>' +
      '<li class="item"><span class="name">B</span></li>' +
      '<li class="item"><span class="name">C</span></li>' +
      '</ul>',
  )
  const rules = { items: ['.item', { name: '.name' }] }
  muteWarn()
  apply(adapter, root, rules, {
    items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
  })
  restoreWarn()

  const items = root.querySelectorAll('.item')
  assert.equal(items.length, 4)
  // All inserts should have been stamped from the first-item template.
  assert.equal(items[3].classList.contains('first-item'), true)
  assert.equal(items[3].getAttribute('data-marker'), 'yes')
})

test('apply (jsdom) — inserted clones have IDs stripped; originals keep theirs', () => {
  const { adapter, root } = jsdomCtx(
    '<ul>' +
      '<li class="item" id="keep"><span id="inner" class="name">A</span></li>' +
      '</ul>',
  )
  const rules = { items: ['.item', { name: '.name' }] }
  let warned = null
  console.warn = (msg) => {
    warned = msg
  }
  apply(adapter, root, rules, { items: [{ name: 'A' }, { name: 'B' }] })
  restoreWarn()

  const items = root.querySelectorAll('.item')
  assert.equal(items.length, 2)
  assert.equal(items[0].id, 'keep') // original preserved
  assert.equal(items[0].querySelector('.name').id, 'inner')
  assert.equal(items[1].id, '') // stripped on the clone
  assert.equal(items[1].querySelector('.name').id, '')
  assert.ok(warned && /stripped/.test(warned))
})

test('apply (jsdom) — identical-item reorder preserves positions via tiebreak', () => {
  // Four identical items: similarity is 1.0 for every pair. Closest-index
  // tiebreak should keep each old node at its original position when the new
  // list has the same shape.
  const { adapter, root } = jsdomCtx(
    '<ul>' +
      '<li class="item"><span class="a">1</span><span class="b">2</span></li>' +
      '<li class="item"><span class="a">1</span><span class="b">2</span></li>' +
      '<li class="item"><span class="a">1</span><span class="b">2</span></li>' +
      '<li class="item"><span class="a">1</span><span class="b">2</span></li>' +
      '</ul>',
  )
  const rules = { items: ['.item', { a: '.a', b: '.b' }] }

  const identical = [
    { a: '1', b: '2' },
    { a: '1', b: '2' },
    { a: '1', b: '2' },
    { a: '1', b: '2' },
  ]

  // Tag each original node so we can verify identity preservation.
  const originals = Array.from(root.querySelectorAll('.item'))
  originals.forEach((el, i) => (el.dataset.origIdx = String(i)))

  muteWarn()
  apply(adapter, root, rules, { items: identical })
  restoreWarn()

  const after = Array.from(root.querySelectorAll('.item'))
  for (let i = 0; i < after.length; i++) {
    assert.equal(after[i].dataset.origIdx, String(i))
  }
})
