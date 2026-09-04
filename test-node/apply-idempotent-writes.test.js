import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// Applying unchanged data must not touch the DOM. writeText has compared before
// writing for a while; writePropOrAttr did not, and the difference was not
// cosmetic. Assigning innerHTML destroys and rebuilds every child even when the
// string is identical, and setting an attribute to the value it already has
// still emits a mutation record. The CMS re-applies the whole page on every
// keystroke, so a page with one rich-text rule tore that region down per
// keystroke: the caret jumped out of it, an embedded video or iframe inside it
// restarted, and undo plus live sync got a record each time.

function jsdomRoot(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`)
  return { win: dom.window, doc: dom.window.document, root: dom.window.document.body }
}

function recordsWhile(win, root, fn) {
  const records = []
  const mo = new win.MutationObserver((list) => records.push(...list))
  mo.observe(root, { childList: true, subtree: true, attributes: true, characterData: true })
  fn()
  mo.takeRecords().forEach((r) => records.push(r))
  mo.disconnect()
  return records.map((r) => `${r.type}:${r.attributeName || ''}`)
}

test('re-applying unchanged data leaves an @innerHTML region untouched', () => {
  const { win, root } = jsdomRoot('<div class="rich"><p>One</p><p>Two</p></div>')
  const rules = { body: '.rich@innerHTML' }
  const data = extract(domAdapter, root, rules)
  assert.equal(data.body, '<p>One</p><p>Two</p>', 'guard: the rule really matched')
  const before = [...root.querySelector('.rich').children]

  const records = recordsWhile(win, root, () => apply(domAdapter, root, rules, data))

  const after = [...root.querySelector('.rich').children]
  assert.deepEqual(
    after.map((n, i) => n === before[i]),
    [true, true],
    'the original child nodes must survive; assigning innerHTML replaces them'
  )
  assert.deepEqual(records, [], 'and nothing may reach the mutation observer')
})

test('re-applying unchanged data does not rewrite an attribute rule', () => {
  const { win, root } = jsdomRoot('<span class="b" data-icon="star"></span>')
  const rules = { icon: '.b@data-icon' }
  const data = extract(domAdapter, root, rules)
  assert.equal(data.icon, 'star', 'guard: the rule really matched')

  const records = recordsWhile(win, root, () => apply(domAdapter, root, rules, data))

  assert.deepEqual(records, [], 'setting an attribute to its current value still emits a record')
  assert.equal(root.querySelector('.b').getAttribute('data-icon'), 'star')
})

test('a CHANGED @innerHTML value is still written', () => {
  const { root } = jsdomRoot('<div class="rich"><p>One</p></div>')
  apply(domAdapter, root, { body: '.rich@innerHTML' }, { body: '<p>Two</p>' })
  assert.equal(root.querySelector('.rich').innerHTML, '<p>Two</p>')
})

test('a CHANGED attribute value is still written', () => {
  const { root } = jsdomRoot('<span class="b" data-icon="star"></span>')
  apply(domAdapter, root, { icon: '.b@data-icon' }, { icon: 'heart' })
  assert.equal(root.querySelector('.b').getAttribute('data-icon'), 'heart')
})

test('an attribute that does not exist yet is still created', () => {
  const { root } = jsdomRoot('<span class="b"></span>')
  // The guard reads null for a missing attribute, and null !== '', so '' writes.
  apply(domAdapter, root, { icon: '.b@data-icon' }, { icon: '' })
  assert.ok(root.querySelector('.b').hasAttribute('data-icon'), 'absent is not the same as empty')
  assert.equal(root.querySelector('.b').getAttribute('data-icon'), '')
})

test('a boolean property still toggles in both directions', () => {
  const { root } = jsdomRoot('<input class="c" type="checkbox">')
  const rules = { on: '.c@checked' }
  apply(domAdapter, root, rules, { on: true })
  assert.equal(root.querySelector('.c').checked, true)
  apply(domAdapter, root, rules, { on: false })
  assert.equal(root.querySelector('.c').checked, false, 'false must clear it, not be skipped as unchanged')
})

// Cheerio has no live DOM, so serialized output is identical whether or not the
// write happened: an assertion on $.html() passes on the broken engine and
// catches nothing. Count the writes the adapter is actually asked to perform.
function countingAdapter(inner) {
  const writes = []
  return {
    spy: writes,
    adapter: {
      ...inner,
      prop(node, name, value) {
        if (value !== undefined) writes.push(`prop:${name}`)
        return inner.prop(node, name, value)
      },
      attr(node, name, value) {
        if (value !== undefined) writes.push(`attr:${name}`)
        return inner.attr(node, name, value)
      },
    },
  }
}

for (const env of [
  { label: 'cheerio', make: () => {
      const $ = cheerio.load('<body><div class="rich"><p>One</p></div><span class="b" data-icon="star"></span></body>')
      return { base: cheerioAdapter, root: $.root() }
    } },
  { label: 'jsdom', make: () => {
      const { root } = jsdomRoot('<div class="rich"><p>One</p></div><span class="b" data-icon="star"></span>')
      return { base: domAdapter, root }
    } },
]) {
  test(`${env.label}: re-applying unchanged data performs no write at all`, () => {
    const { base, root } = env.make()
    const rules = { body: '.rich@innerHTML', icon: '.b@data-icon' }
    const data = extract(base, root, rules)
    assert.equal(data.icon, 'star', 'guard: the rules really matched')
    assert.equal(data.body, '<p>One</p>', 'guard: the rich rule really matched')

    const { adapter, spy } = countingAdapter(base)
    apply(adapter, root, rules, data)

    assert.deepEqual(spy, [], 'unchanged data must reach neither prop() nor attr()')
  })

  test(`${env.label}: a changed value still performs exactly one write`, () => {
    const { base, root } = env.make()
    const { adapter, spy } = countingAdapter(base)
    apply(adapter, root, { body: '.rich@innerHTML', icon: '.b@data-icon' }, { body: '<p>Two</p>', icon: 'star' })
    assert.deepEqual(spy, ['prop:innerHTML'], 'the changed rule writes, the unchanged one does not')
  })
}
