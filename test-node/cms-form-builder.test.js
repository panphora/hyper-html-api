import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// form-builder uses bare `document.createElement` etc., so we install
// jsdom globals before importing it.
const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.DocumentFragment = dom.window.DocumentFragment
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node

const { buildForm, bindFormEvents } = await import('../src/cms/form-builder.js')
const { widgetHandles } = await import('../src/cms/widget-handles.js')

function mountInBody(frag) {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  host.id = 'host'
  host.appendChild(frag)
  document.body.appendChild(host)
  return host
}

function makeAppRoot(html) {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  return wrap
}

// ─ rendering ────────────────────────────────────────────────────────

test('scalar — renders single field-row with data-hha-path, label + input, no include checkbox', () => {
  const rules = { title: '.title' }
  const data = { title: 'Hi' }
  const appRoot = makeAppRoot('<h1 class="title">Hi</h1>')

  const host = mountInBody(buildForm({ rules, data, appRoot }))

  const rows = host.querySelectorAll('.field-row')
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.getAttribute('data-hha-path'), 'title')

  // No include-checkbox column (and no stray checkboxes inside the form).
  assert.equal(host.querySelectorAll('.field-toggle').length, 0)
  assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 0)

  const input = row.querySelector('input')
  assert.ok(input)
  assert.equal(input.value, 'Hi')

  const label = row.querySelector('label.field-label')
  assert.ok(label)
  assert.match(label.textContent, /Title/)

  // Outer object wrapper carries data-hha-path="" for root.
  const sections = host.querySelectorAll('.form-section')
  assert.equal(sections.length, 1)
  assert.equal(sections[0].getAttribute('data-hha-path'), '')
})

test('scalar-array — section, per-item rows with index paths, + add and × controls carry data-hha-action', () => {
  const rules = { tags: '.tag[]' }
  const data = { tags: ['a', 'b'] }
  const appRoot = makeAppRoot('<ul><li class="tag">a</li><li class="tag">b</li></ul>')

  const host = mountInBody(buildForm({ rules, data, appRoot }))

  const sections = host.querySelectorAll('.form-section[data-hha-path="tags"]')
  assert.equal(sections.length, 1)

  const rows = host.querySelectorAll('.scalar-array-row')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].getAttribute('data-hha-path'), 'tags.0')
  assert.equal(rows[1].getAttribute('data-hha-path'), 'tags.1')
  assert.equal(rows[0].querySelector('input').value, 'a')
  assert.equal(rows[1].querySelector('input').value, 'b')

  // × on each row, marked with data-hha-action="array-remove".
  const removes = host.querySelectorAll('.scalar-array-row .array-remove')
  assert.equal(removes.length, 2)
  for (const btn of removes) {
    assert.equal(btn.getAttribute('data-hha-action'), 'array-remove')
  }

  // + add at the section, marked scalar-array-add.
  const add = host.querySelector('.form-section[data-hha-path="tags"] > .array-add')
  assert.ok(add)
  assert.equal(add.getAttribute('data-hha-action'), 'scalar-array-add')
  assert.equal(add.getAttribute('data-hha-path'), 'tags')
})

test('object — nested section, two field-rows with nested paths', () => {
  const rules = { author: { name: '.name', bio: '.bio' } }
  const data = { author: { name: 'X', bio: 'Y' } }
  const appRoot = makeAppRoot('<div class="name">X</div><div class="bio">Y</div>')

  const host = mountInBody(buildForm({ rules, data, appRoot }))

  const authorSection = host.querySelector('.form-section[data-hha-path="author"]')
  assert.ok(authorSection)
  const rows = authorSection.querySelectorAll('.field-row')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].getAttribute('data-hha-path'), 'author.name')
  assert.equal(rows[1].getAttribute('data-hha-path'), 'author.bio')
})

test('object-array — section with cards per item; nested paths and add marked object-array-add', () => {
  const rules = { products: ['.product', { name: '.name' }] }
  const data = { products: [{ name: 'A' }, { name: 'B' }] }
  const appRoot = makeAppRoot(
    '<div class="product"><span class="name">A</span></div>' +
      '<div class="product"><span class="name">B</span></div>',
  )

  const host = mountInBody(buildForm({ rules, data, appRoot }))

  const section = host.querySelector('.form-section[data-hha-path="products"]')
  assert.ok(section)
  const cards = section.querySelectorAll('.array-card')
  assert.equal(cards.length, 2)
  assert.equal(cards[0].getAttribute('data-hha-path'), 'products.0')
  assert.equal(cards[1].getAttribute('data-hha-path'), 'products.1')

  // Inner field paths nest.
  const nameRows = host.querySelectorAll(
    '.array-card .field-row[data-hha-path^="products."]',
  )
  assert.equal(nameRows.length, 2)
  assert.equal(nameRows[0].getAttribute('data-hha-path'), 'products.0.name')
  assert.equal(nameRows[1].getAttribute('data-hha-path'), 'products.1.name')

  const add = section.querySelector('.array-add')
  assert.equal(add.getAttribute('data-hha-action'), 'object-array-add')
  assert.equal(add.getAttribute('data-hha-path'), 'products')
})

test('widgetHandles WeakMap — every scalar field-row registers a handle with destroy/focus/validate', () => {
  const rules = { title: '.title', body: '.body' }
  const data = { title: 'X', body: 'Y' }
  const appRoot = makeAppRoot('<h1 class="title">X</h1><div class="body">Y</div>')

  const host = mountInBody(buildForm({ rules, data, appRoot }))

  const rows = host.querySelectorAll('.field-row')
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.ok(widgetHandles.has(row), `WeakMap missing handle for row ${row.getAttribute('data-hha-path')}`)
    const handle = widgetHandles.get(row)
    assert.equal(typeof handle.destroy, 'function')
    assert.equal(typeof handle.focus, 'function')
    assert.equal(typeof handle.validate, 'function')
    assert.ok(handle.el)
  }
})

// ─ event delegation ─────────────────────────────────────────────────

function buildAndBind({ rules, data, appRoot }) {
  let state = data
  const captured = []
  const host = mountInBody(buildForm({ rules, data: state, appRoot }))
  bindFormEvents(host, {
    rules,
    getData: () => state,
    onChange: (next, opts) => {
      state = next
      captured.push({ next, opts })
    },
  })
  return { host, captured, getState: () => state }
}

test('delegated input — typing in a scalar field dispatches onChange {structural: false}', () => {
  const rules = { title: '.title' }
  const appRoot = makeAppRoot('<h1 class="title">old</h1>')
  const { host, captured } = buildAndBind({ rules, data: { title: 'old' }, appRoot })

  const input = host.querySelector('input')
  input.value = 'new'
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))

  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0].next, { title: 'new' })
  assert.equal(captured[0].opts.structural, false)
})

test('delegated click — scalar-array + add dispatches onChange {structural: true} with empty string appended', () => {
  const rules = { tags: '.tag[]' }
  const appRoot = makeAppRoot('<ul><li class="tag">a</li></ul>')
  const { host, captured } = buildAndBind({ rules, data: { tags: ['a'] }, appRoot })

  const add = host.querySelector(
    '.form-section[data-hha-path="tags"] > .array-add',
  )
  add.dispatchEvent(new dom.window.Event('click', { bubbles: true }))

  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0].next, { tags: ['a', ''] })
  assert.equal(captured[0].opts.structural, true)
})

test('delegated click — object-array + add appends a scaffold of the shape', () => {
  const rules = { products: ['.product', { name: '.name', price: '.price' }] }
  const appRoot = makeAppRoot('<div class="product"><span class="name">A</span><span class="price">$1</span></div>')
  const { host, captured } = buildAndBind({
    rules,
    data: { products: [{ name: 'A', price: '$1' }] },
    appRoot,
  })

  const add = host.querySelector('.form-section[data-hha-path="products"] > .array-add')
  add.dispatchEvent(new dom.window.Event('click', { bubbles: true }))

  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0].next, {
    products: [{ name: 'A', price: '$1' }, { name: '', price: '' }],
  })
  assert.equal(captured[0].opts.structural, true)
})

test('delegated click — array-remove on a scalar-array row removes only that index', () => {
  const rules = { tags: '.tag[]' }
  const appRoot = makeAppRoot('<ul><li class="tag">a</li><li class="tag">b</li><li class="tag">c</li></ul>')
  const { host, captured } = buildAndBind({
    rules,
    data: { tags: ['a', 'b', 'c'] },
    appRoot,
  })

  const removeMiddle = host.querySelector(
    '.scalar-array-row[data-hha-path="tags.1"] .array-remove',
  )
  removeMiddle.dispatchEvent(new dom.window.Event('click', { bubbles: true }))

  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0].next, { tags: ['a', 'c'] })
  assert.equal(captured[0].opts.structural, true)
})

test('delegated click — array-remove on an object-array card removes only that index', () => {
  const rules = { products: ['.product', { name: '.name' }] }
  const appRoot = makeAppRoot(
    '<div class="product"><span class="name">A</span></div>' +
      '<div class="product"><span class="name">B</span></div>',
  )
  const { host, captured } = buildAndBind({
    rules,
    data: { products: [{ name: 'A' }, { name: 'B' }] },
    appRoot,
  })

  // The first card has multiple [data-hha-action="array-remove"] descendants
  // (the card's × button plus none on inner field rows). Pick the card's
  // direct × by querying for the card-level remove.
  const removeFirst = host.querySelector(
    '.array-card[data-hha-path="products.0"] > .array-remove',
  )
  removeFirst.dispatchEvent(new dom.window.Event('click', { bubbles: true }))

  assert.equal(captured.length, 1)
  assert.deepEqual(captured[0].next, { products: [{ name: 'B' }] })
  assert.equal(captured[0].opts.structural, true)
})

test('delegated handler reads live data, not snapshot — works across multiple edits', () => {
  const rules = { tags: '.tag[]' }
  const appRoot = makeAppRoot('<ul><li class="tag">a</li></ul>')
  const { host, captured } = buildAndBind({ rules, data: { tags: ['a'] }, appRoot })

  // First + add: ['a'] → ['a', '']
  const add = host.querySelector('.form-section[data-hha-path="tags"] > .array-add')
  add.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
  // Second + add: ['a', ''] → ['a', '', '']  (must read latest state, not the initial snapshot)
  add.dispatchEvent(new dom.window.Event('click', { bubbles: true }))

  assert.equal(captured.length, 2)
  assert.deepEqual(captured[0].next.tags, ['a', ''])
  assert.deepEqual(captured[1].next.tags, ['a', '', ''])
})
