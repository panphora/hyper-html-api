import assert from 'node:assert/strict'
import test from 'node:test'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'
import { apply, extract, guardAdapter } from '../src/engine/index.js'
import { WriteRefused } from '../src/engine/errors.js'
import { writeDocument } from '../src/write.js'

const load = cheerio.load

const envs = [
  {
    label: 'cheerio',
    make(html) {
      const $ = cheerio.load(html)
      return { adapter: cheerioAdapter, root: $.root(), has: (sel, name) => $(sel).attr(name) !== undefined, value: (sel, name) => $(sel).attr(name) }
    },
  },
  {
    label: 'jsdom',
    make(html) {
      const dom = new JSDOM(html)
      const root = dom.window.document
      return {
        adapter: domAdapter,
        root,
        has: (sel, name) => root.querySelector(sel).hasAttribute(name),
        value: (sel, name) => root.querySelector(sel).getAttribute(name),
      }
    },
  },
]

for (const env of envs) {
  test(`${env.label}: an absent attribute reads null and an empty attribute reads ""`, () => {
    const { adapter, root } = env.make('<p class="a">A</p><p class="b" data-done="">B</p>')
    assert.deepEqual(extract(adapter, root, { absent: '.a@data-done', empty: '.b@data-done' }), {
      absent: null,
      empty: '',
    })
  })

  test(`${env.label}: writing "" sets an empty attribute and a string sets its value`, () => {
    const { adapter, root, has, value } = env.make('<p class="a">A</p>')
    apply(adapter, root, { done: '.a@data-done' }, { done: '' })
    assert.ok(has('.a', 'data-done'), 'the attribute must exist after writing ""')
    assert.equal(value('.a', 'data-done'), '')
    apply(adapter, root, { done: '.a@data-done' }, { done: 'yes' })
    assert.equal(value('.a', 'data-done'), 'yes')
  })

  test(`${env.label}: an empty attribute survives a read/write round trip`, () => {
    const { adapter, root, value } = env.make('<p class="a" data-done="">A</p>')
    const data = extract(adapter, root, { done: '.a@data-done' })
    assert.equal(data.done, '', 'the Kanban card is complete')
    apply(adapter, root, { done: '.a@data-done' }, data)
    assert.equal(value('.a', 'data-done'), '')
    assert.equal(extract(adapter, root, { done: '.a@data-done' }).done, '')
  })

  test(`${env.label}: writing null removes the attribute and is a no-op when absent`, () => {
    const { adapter, root, has } = env.make('<p class="a" data-done="yes">A</p><p class="b">B</p>')
    apply(adapter, root, { a: '.a@data-done', b: '.b@data-done' }, { a: null, b: null })
    assert.equal(has('.a', 'data-done'), false, 'null removes the attribute')
    assert.equal(has('.b', 'data-done'), false, 'removing an absent attribute stays absent')
    assert.equal(extract(adapter, root, { a: '.a@data-done' }).a, null)
  })

  test(`${env.label}: an omitted key is not a removal`, () => {
    const { adapter, root, value } = env.make('<p class="a" data-done="yes">A</p>')
    const rules = { done: '.a@data-done', note: '.a@data-note' }
    apply(adapter, root, rules, { note: 'x' })
    assert.equal(value('.a', 'data-done'), 'yes', 'the omitted attribute is untouched')
    assert.equal(value('.a', 'data-note'), 'x')
  })

  test(`${env.label}: a boolean property rule keeps its coercion`, () => {
    const { adapter, root } = env.make('<input class="c" type="checkbox">')
    const rules = { done: '.c@checked' }
    apply(adapter, root, rules, { done: true })
    assert.equal(extract(adapter, root, rules).done, 'true')
    apply(adapter, root, rules, { done: false })
    assert.equal(extract(adapter, root, rules).done, 'false')
    apply(adapter, root, rules, { done: null })
    assert.equal(extract(adapter, root, rules).done, 'false', 'null still clears a boolean property')
  })
}

const SRC = '<!doctype html>\n<html><head><title>T</title>' +
  '<script data-rules-name="api" data-rules-version="1">{"done":"#c@data-done","note":"#c@data-note"}</script>' +
  '</head><body><p id="c" data-done="">x</p></body></html>'
const SRC_SET = SRC.replace('data-done=""', 'data-done="yes"')

test('writeDocument: an empty attribute is a no-op against an empty attribute', () => {
  const result = writeDocument(load, SRC, { done: '' })
  assert.equal(result.changed, false)
  assert.equal(result.html, SRC)
})

test('writeDocument: an empty attribute is written when absent and reads back ""', () => {
  const result = writeDocument(load, SRC.replace(' data-done=""', ''), { done: '' })
  assert.equal(result.changed, true)
  assert.ok(result.html.includes('data-done=""'), 'the attribute is present and empty in the source')
  assert.equal(writeDocument(load, result.html, { done: '' }).changed, false)
})

test('writeDocument: null removes the attribute from the source', () => {
  const result = writeDocument(load, SRC_SET, { done: null })
  assert.equal(result.changed, true)
  assert.equal(cheerio.load(result.html)('#c').attr('data-done'), undefined, 'the attribute is gone from the source')
  assert.equal(writeDocument(load, result.html, { done: null }).changed, false)
})

test('writeDocument: a set value round trips and an omitted key preserves the source', () => {
  const set = writeDocument(load, SRC, { done: 'yes' })
  assert.ok(set.html.includes('data-done="yes"'))
  assert.equal(writeDocument(load, set.html, { done: 'yes' }).changed, false)
  const omitted = writeDocument(load, SRC, { note: 'n' })
  assert.ok(omitted.html.includes('data-done=""'), 'the omitted attribute survives')
})

function runGuarded(html, rules, data, opts) {
  const $ = cheerio.load(html)
  const g = guardAdapter(cheerioAdapter)
  apply(g, $.root(), rules, data, opts)
  g.assertClean()
  return $
}

test('guardAdapter: removing a content attribute is allowed', () => {
  const $ = runGuarded('<p id="p" data-done="yes">x</p>', { done: '#p@data-done' }, { done: null })
  assert.equal($('#p').attr('data-done'), undefined)
})

test('guardAdapter: removal through a protected attribute rule is refused', () => {
  for (const [html, rule] of [
    ['<p id="p" style="color:red">x</p>', { v: '#p@style' }],
    ['<p id="p" onclick="x()">x</p>', { v: '#p@onclick' }],
    ['<p id="p" data-rules-name="api">x</p>', { v: '#p@data-rules-name' }],
  ]) {
    assert.throws(
      () => runGuarded(html, rule, { v: null }),
      (e) => e instanceof WriteRefused && e.refusals.length === 1,
      `expected a refusal for ${Object.values(rule)[0]}`,
    )
  }
})

for (const env of envs) {
  test(`${env.label}: seed stripping still passes the policy wrapper`, () => {
    const { adapter, root } = env.make('<div class="list"><div class="row" cms-template><span class="n"></span></div></div>')
    const guarded = guardAdapter(adapter)
    apply(guarded, root, { items: ['.row', { name: '.n' }] }, { items: [{ name: 'X' }] }, { templateAttr: 'cms-template' })
    guarded.assertClean()
    const cloned = extract(adapter, root, { items: ['.row', { name: '.n', done: '.row@cms-template' }] })
    assert.deepEqual(cloned.items, [{ name: 'X', done: null }], 'the clone lost its seed marker and the write was allowed')
  })
}
