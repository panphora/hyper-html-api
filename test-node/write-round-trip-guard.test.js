import assert from 'node:assert/strict'
import test from 'node:test'
import * as cheerio from 'cheerio'
import cheerioAdapter from '../src/adapters/cheerio.js'
import { extract, findRulesIn } from '../src/engine/index.js'
import { WriteNotRoundTripped } from '../src/engine/errors.js'
import { writeDocument } from '../src/write.js'

const load = cheerio.load

const RULES =
  '{title:"h1",link:"#a@href",note:"#p@data-note",body:"#p@textContent",count:"#p@data-count",done:"#c@checked",items:["li",{name:"b",n:"i"}]}'

const SRC = [
  '<!doctype html>',
  '<html>',
  '<head>',
  `<script data-rules-name="api" data-rules-version="1">${RULES}</script>`,
  '</head>',
  '<body>',
  '<h1>Hello</h1>',
  '<a id="a" href="/">x</a>',
  '<p id="p" data-note="keep" data-count="1">plain</p>',
  '<input id="c" type="checkbox">',
  '<ul>',
  '  <li><b>A</b><i>1</i></li>',
  '  <li><b>B</b><i>2</i></li>',
  '</ul>',
  '</body>',
  '</html>',
].join('\n')

function read(html) {
  const $ = cheerio.load(html)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  return extract(cheerioAdapter, $.root(), rules)
}

test('a partial object write verifies only the supplied fields', () => {
  const result = writeDocument(load, SRC, { title: 'World' })
  assert.equal(result.changed, true)
  assert.equal(read(result.html).title, 'World')
  assert.equal(read(result.html).link, '/')
  assert.equal(read(result.html).note, 'keep')
})

test('a partial row object keeps the fields the item omitted', () => {
  const result = writeDocument(load, SRC, { items: [{ name: 'Z' }] })
  assert.equal(result.changed, true)
  assert.deepEqual(read(result.html).items, [{ name: 'Z', n: '1' }])
})

test('a caller that omits a whole list is still accepted', () => {
  const result = writeDocument(load, SRC, { link: '/next', note: 'kept' })
  assert.equal(result.changed, true)
  assert.deepEqual(read(result.html).items, [{ name: 'A', n: '1' }, { name: 'B', n: '2' }])
  assert.equal(read(result.html).link, '/next')
  assert.equal(read(result.html).note, 'kept')
})

test('an implicit text rule compares trimmed, @textContent compares exactly', () => {
  const trimmed = writeDocument(load, SRC, { title: '  Padded  ' })
  assert.equal(trimmed.changed, true)
  assert.ok(trimmed.html.includes('<h1>  Padded  </h1>'))

  const exact = writeDocument(load, SRC, { body: '  kept  ' })
  assert.equal(exact.changed, true)
  assert.equal(read(exact.html).body, '  kept  ')
})

test('numeric scalars round-trip as text and as attributes', () => {
  const result = writeDocument(load, SRC, { title: 42, count: 7 })
  assert.equal(result.changed, true)
  assert.equal(read(result.html).title, '42')
  assert.equal(read(result.html).count, '7')
})

test('the string "false" unchecks a box instead of checking it', () => {
  const html = `<script data-rules-name="api" data-rules-version="1">{done:"#c@checked"}</script><input id="c" type="checkbox" checked>`
  const result = writeDocument(load, html, { done: 'false' })
  assert.equal(result.changed, true)
  assert.equal(cheerio.load(result.html)('#c').attr('checked'), undefined)
  assert.equal(read(result.html).done, 'false')

  const back = writeDocument(load, result.html, { done: 'true' })
  assert.equal(back.changed, true)
  assert.notEqual(cheerio.load(back.html)('#c').attr('checked'), undefined)
  assert.equal(read(back.html).done, 'true')
})

test('an empty attribute is written and an absent one stays absent', () => {
  const empty = writeDocument(load, SRC, { note: '' })
  assert.equal(cheerio.load(empty.html)('#p').attr('data-note'), '')
  assert.equal(read(empty.html).note, '')

  const removed = writeDocument(load, SRC, { note: null })
  assert.equal(cheerio.load(removed.html)('#p').attr('data-note'), undefined)
  assert.equal(read(removed.html).note, null)
})

test('a write of the value already in the source returns the source itself', () => {
  const result = writeDocument(load, SRC, { title: 'Hello', link: '/', note: 'keep' })
  assert.equal(result.changed, false)
  assert.equal(result.spliced, true)
  assert.equal(result.html, SRC)
})

test('a missing nested target throws instead of returning a false success', () => {
  const html = `<script data-rules-name="api" data-rules-version="1">{items:["li",{name:"em.missing"}]}</script><ul><li><b>A</b></li></ul>`
  const sentinel = 'SENTINEL-4f21'
  assert.throws(
    () => writeDocument(load, html, { items: [{ name: sentinel }] }),
    (err) => {
      assert.ok(err instanceof WriteNotRoundTripped)
      assert.equal(err.name, 'WriteNotRoundTripped')
      assert.deepEqual(err.path, ['items', 0, 'name'])
      assert.match(err.message, /items\[0\]\.name/)
      assert.ok(!err.message.includes(sentinel), 'the message must not carry visitor values')
      return true
    },
  )
  assert.equal(writeDocument(load, html, { items: [{ name: null }] }).changed, false)
})

test('a value the serialized source cannot carry throws', () => {
  const sentinel = 'SENTINEL\r9c4d'
  assert.throws(
    () => writeDocument(load, SRC, { note: sentinel }),
    (err) => {
      assert.ok(err instanceof WriteNotRoundTripped)
      assert.deepEqual(err.path, ['note'])
      assert.ok(!err.message.includes('9c4d'), 'the message must not carry visitor values')
      return true
    },
  )
})
