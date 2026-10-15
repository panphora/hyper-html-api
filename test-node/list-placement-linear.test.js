import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'

import { extract, apply, findRulesIn } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import { writeDocument } from '../src/write.js'

// Placing a list used to re-read the parent's children for every row, so a list
// write cost the square of its length. These tests pin the cost and the
// placement semantics at the same time: the write must stay cheap AND land the
// rows exactly where the old per-row insertAt put them.

const RULES = { items: ['#l > li', { t: '.' }] }

function countingAdapter(inner) {
  const counts = { children: 0, insertAt: 0 }
  const adapter = {
    ...inner,
    children(node) {
      counts.children++
      return inner.children(node)
    },
    insertAt(parent, node, index) {
      counts.insertAt++
      return inner.insertAt(parent, node, index)
    },
  }
  return { adapter, counts }
}

test('placing 2,000 rows reads the parent a constant number of times', () => {
  const $ = cheerio.load('<ul id="l"><li>a</li></ul>')
  const rows = Array.from({ length: 2000 }, (_, i) => ({ t: 'r' + i }))
  const { adapter, counts } = countingAdapter(cheerioAdapter)

  apply(adapter, $.root(), RULES, { items: rows })

  assert.ok(counts.children <= 5, `children() called ${counts.children} times for 2,000 rows`)
  assert.ok(counts.insertAt <= 1, `insertAt called ${counts.insertAt} times for 2,000 rows`)
  assert.deepEqual(extract(cheerioAdapter, $.root(), RULES).items, rows)
})

test('reorder with an unowned no-data sibling in place', () => {
  const $ = cheerio.load('<ul id="l"><li>a</li><li>b</li><li>c</li></ul>')
  apply(cheerioAdapter, $.root(), RULES, { items: [{ t: 'c' }, { t: 'a' }, { t: 'b' }] })

  assert.deepEqual(extract(cheerioAdapter, $.root(), RULES).items, [{ t: 'c' }, { t: 'a' }, { t: 'b' }])
  assert.equal($('#l').toString(), '<ul id="l"><li>c</li><li>a</li><li>b</li></ul>')

  const $$ = cheerio.load('<ul id="l"><li>a</li><li editor-ui>Add</li><li>b</li><li>c</li></ul>')
  apply(cheerioAdapter, $$.root(), RULES, { items: [{ t: 'c' }, { t: 'a' }, { t: 'b' }] })

  assert.deepEqual(extract(cheerioAdapter, $$.root(), RULES).items, [{ t: 'c' }, { t: 'a' }, { t: 'b' }])
  assert.deepEqual(
    $$('#l').children().map((_, node) => ($$(node).attr('editor-ui') !== undefined ? 'UI' : $$(node).text())).get(),
    ['c', 'a', 'UI', 'b'],
    'the unowned sibling stays between a and b, where the author put it',
  )
})

test('writing a list back unchanged reports no change', () => {
  const html = '<!doctype html><html><head><script data-rules-name="api" data-rules-version="1">{items:["#l > li",{t:"."}]}</script></head><body><ul id="l"><li>a</li><li>b</li><li>c</li></ul></body></html>'
  const $ = cheerio.load(html)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  const data = extract(cheerioAdapter, $.root(), rules)

  const result = writeDocument(cheerio.load, html, data)

  assert.equal(result.changed, false)
})

test('grow and shrink in one write', () => {
  const $ = cheerio.load('<ul id="l"><li>a</li><li>b</li><li>c</li><li>d</li></ul>')
  const items = [{ t: 'b' }, { t: 'x' }, { t: 'd' }, { t: 'y' }, { t: 'z' }]

  apply(cheerioAdapter, $.root(), RULES, { items })

  assert.deepEqual(extract(cheerioAdapter, $.root(), RULES).items, items)
})
