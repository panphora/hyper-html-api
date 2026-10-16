import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import domAdapter, { createDomAdapter } from '../src/adapters/dom.js'
import { apply, extract } from '../src/engine/index.js'

const envs = [
  { label: 'dom', adapter: () => domAdapter },
  {
    label: 'dom (projected)',
    adapter: (root) => createDomAdapter(root, { templateAttr: 'cms-template', _write: true }),
  },
]

const writeOpts = { templateAttr: 'cms-template' }

function jsdomRoot(html) {
  const dom = new JSDOM(html)
  return dom.window.document
}

const values = (root, selector) => [...root.querySelectorAll(selector)].map((n) => n.value)

for (const env of envs) {
  test(`${env.label}: a grown textarea row shows its written body, not the typed source`, () => {
    const root = jsdomRoot(
      '<div id="entries">' +
        '<article class="entry"><textarea class="body">alpha</textarea></article>' +
        '<article class="entry"><textarea class="body">beta</textarea></article>' +
        '</div>',
    )
    const rules = { entries: ['#entries > article.entry', { body: 'textarea.body' }] }
    const first = root.querySelector('textarea')
    first.value = 'typed'
    assert.equal(first.value, 'typed', 'the first row carries the user\u2019s edit')

    apply(
      env.adapter(root),
      root,
      rules,
      { entries: [{ body: 'one' }, { body: 'two' }, { body: 'three' }] },
      writeOpts,
    )

    assert.equal(root.querySelectorAll('#entries > article.entry').length, 3)
    assert.deepEqual(values(root, '#entries > article.entry textarea'), ['one', 'two', 'three'])
    assert.deepEqual(
      extract(env.adapter(root), root, rules, writeOpts).entries.map((e) => e.body),
      ['one', 'two', 'three'],
    )
  })

  test(`${env.label}: a dirty textarea the write names shows the written value`, () => {
    const root = jsdomRoot('<textarea id="b">old</textarea>')
    const textarea = root.getElementById('b')
    textarea.value = 'typed'
    assert.equal(textarea.defaultValue, 'old', 'the control is dirty')

    apply(env.adapter(root), root, { body: '#b' }, { body: 'written' }, writeOpts)

    assert.equal(textarea.textContent, 'written')
    assert.equal(textarea.value, 'written')
  })

  test(`${env.label}: a cloned row\u2019s unnamed input shows its default, not the source row\u2019s typed value`, () => {
    const root = jsdomRoot(
      '<div id="rows">' +
        '<div class="row"><textarea class="body">alpha</textarea><input class="note"></div>' +
        '</div>',
    )
    const rules = { rows: ['#rows > .row', { body: 'textarea.body' }] }
    const source = root.querySelector('.row')
    source.querySelector('input').value = 'typed'
    assert.equal(source.querySelector('input').value, 'typed')

    apply(env.adapter(root), root, rules, { rows: [{ body: 'one' }, { body: 'two' }] }, writeOpts)

    assert.equal(root.querySelectorAll('#rows > .row').length, 2)
    assert.deepEqual(values(root, '#rows > .row textarea'), ['one', 'two'])
    assert.deepEqual(values(root, '#rows > .row input'), ['typed', ''])
    assert.deepEqual(
      extract(env.adapter(root), root, rules, writeOpts).rows.map((r) => r.body),
      ['one', 'two'],
    )
  })

  test(`${env.label}: input@value, input@checked and option@selected writes reach dirty controls`, () => {
    const root = jsdomRoot(
      '<input id="i" value="seed">' +
        '<input id="c" type="checkbox">' +
        '<select id="s"><option id="a" value="a">A</option><option id="b" value="b">B</option></select>',
    )
    const input = root.getElementById('i')
    const checkbox = root.getElementById('c')
    const option = root.getElementById('b')
    input.value = 'typed'
    checkbox.checked = true
    option.selected = true

    const rules = { v: '#i@value', c: '#c@checked', s: '#b@selected' }
    apply(env.adapter(root), root, rules, { v: 'written', c: false, s: true }, writeOpts)

    assert.equal(input.value, 'written', 'input@value shows the written value')
    assert.equal(checkbox.checked, false, 'input@checked shows the written state')
    assert.equal(option.selected, true, 'option@selected shows the written state')

    apply(env.adapter(root), root, rules, { v: null, c: null, s: null }, writeOpts)

    assert.equal(input.value, '', 'null clears the live value')
    assert.equal(checkbox.checked, false)
    assert.equal(option.selected, false, 'null clears the selection')
    assert.equal(root.getElementById('a').selected, true, 'the select falls back to its default option')
  })
}

test('dom: value, checked and selected attribute writes reach dirty controls and null clears them', () => {
  const root = jsdomRoot(
    '<input id="i" value="seed">' +
      '<input id="c" type="checkbox" checked>' +
      '<select id="s"><option id="a" value="a">A</option><option id="b" value="b">B</option></select>',
  )
  const input = root.getElementById('i')
  const checkbox = root.getElementById('c')
  const option = root.getElementById('b')
  input.value = 'typed'
  checkbox.checked = false
  option.selected = true

  domAdapter.attr(input, 'value', 'written')
  domAdapter.attr(checkbox, 'checked', '')
  domAdapter.attr(option, 'selected', '')

  assert.equal(input.value, 'written', 'writing the value attribute shows the written value')
  assert.equal(checkbox.checked, true, 'writing the checked attribute checks the box')
  assert.equal(option.selected, true, 'writing the selected attribute selects the option')

  domAdapter.removeAttr(input, 'value')
  domAdapter.removeAttr(checkbox, 'checked')
  domAdapter.removeAttr(option, 'selected')

  assert.equal(input.hasAttribute('value'), false)
  assert.equal(input.value, '', 'removing the value attribute clears the live value')
  assert.equal(checkbox.checked, false, 'removing the checked attribute unchecks the box')
  assert.equal(option.selected, false, 'removing the selected attribute deselects the option')
})
