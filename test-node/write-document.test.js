import test from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { writeDocument } from '../src/write.js'
import { apply, extract, findRulesIn } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import { NoRulesTag, WriteRejected, WriteRefused } from '../src/engine/errors.js'

const load = cheerio.load

const D = '<!doctype html>\r\n<html lang=en>\r\n<head><title>T</title>\r\n' +
  '<script data-rules-name="api" data-rules-version="1">{title:"h1",items:["li",{name:"b"}],link:"#a@href"}</script></head>\r\n' +
  "<body>\r\n<h1 class='x'>Hello</h1>\r\n<p>&copy; 2026<br/></p>\r\n<a id=a href=\"/\">x</a>\r\n" +
  '<ul>\r\n  <li><b>A</b></li>\r\n  <li><b>B</b></li>\r\n</ul>\r\n</body>\r\n</html>\r\n'

const IMPLIED = '<script data-rules-name="api" data-rules-version="1">{l:"html@lang"}</script><p>x</p>'

function read(html) {
  const $ = cheerio.load(html)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  return extract(cheerioAdapter, $.root(), rules)
}

function fullRender(input, data) {
  const $ = cheerio.load(input)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  apply(cheerioAdapter, $.root(), rules, data)
  return $.html()
}

function assertRoundTrips(input, data, result) {
  assert.equal(cheerio.load(result.html).html(), fullRender(input, data))
}

test('a text write splices only the changed element', () => {
  const data = { title: 'World' }
  const result = writeDocument(load, D, data)
  assert.equal(result.changed, true)
  assert.equal(result.spliced, true)
  assert.equal(result.html, D.replace("<h1 class='x'>Hello</h1>", '<h1 class="x">World</h1>'))
})

test('an attribute write splices only the changed element', () => {
  const data = { link: '/next' }
  const result = writeDocument(load, D, data)
  assert.equal(result.html, D.replace('<a id=a href="/">x</a>', '<a id="a" href="/next">x</a>'))
  assert.equal(result.spliced, true)
})

test('growing a list splices the list', () => {
  const data = { items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }
  const result = writeDocument(load, D, data)
  assert.equal(result.spliced, true)
  assert.ok(result.html.startsWith(D.slice(0, D.indexOf('<ul>'))))
  assert.ok(result.html.endsWith(D.slice(D.indexOf('</ul>') + 5)))
  assert.deepEqual(read(result.html).items, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
})

test('shrinking a list splices the list', () => {
  const data = { items: [{ name: 'B' }] }
  const result = writeDocument(load, D, data)
  assert.equal(result.spliced, true)
  assert.ok(result.html.startsWith(D.slice(0, D.indexOf('<ul>'))))
  assert.ok(result.html.endsWith(D.slice(D.indexOf('</ul>') + 5)))
  assert.deepEqual(read(result.html).items, [{ name: 'B' }])
})

test('an unchanged body is a no-op', () => {
  const result = writeDocument(load, D, { title: 'Hello' })
  assert.equal(result.changed, false)
  assert.equal(result.html, D)
})

test('an unknown key is rejected', () => {
  assert.throws(
    () => writeDocument(load, D, { titel: 'X' }),
    (err) => {
      assert.ok(err instanceof WriteRejected)
      assert.deepEqual(err.unknownKeys, ['titel'])
      return true
    },
  )
})

test('a rule with no matching element is rejected', () => {
  const html = '<script data-rules-name="api" data-rules-version="1">{sub:"h2"}</script><p>x</p>'
  assert.throws(
    () => writeDocument(load, html, { sub: 'X' }),
    (err) => {
      assert.ok(err instanceof WriteRejected)
      assert.equal(err.unmatched[0].selector, 'h2')
      return true
    },
  )
})

test('a write outside the content-only policy is refused', () => {
  const html = '<script data-rules-name="api" data-rules-version="1">{h:"#a@onclick"}</script><a id="a">x</a>'
  assert.throws(() => writeDocument(load, html, { h: 'alert(1)' }), WriteRefused)
})

test('a document with no rules tag is rejected', () => {
  assert.throws(() => writeDocument(load, '<p>x</p>', {}), NoRulesTag)
})

test('an element with no source location falls back to a full render', () => {
  const data = { l: 'en' }
  const result = writeDocument(load, IMPLIED, data)
  assert.equal(result.changed, true)
  assert.equal(result.spliced, false)
  assert.equal(cheerio.load(result.html)('html').attr('lang'), 'en')
})

test('every successful write round-trips through a full render', () => {
  const cases = [
    [D, { title: 'World' }],
    [D, { link: '/next' }],
    [D, { items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }],
    [D, { items: [{ name: 'B' }] }],
    [IMPLIED, { l: 'en' }],
  ]
  for (const [input, data] of cases) assertRoundTrips(input, data, writeDocument(load, input, data))
})

test('writing 2000 rows into a one-row list stays fast', () => {
  const html = '<script data-rules-name="api" data-rules-version="1">{items:"#u li[]"}</script><ul id=u><li>A</li></ul>'
  const data = { items: Array.from({ length: 2000 }, (_, i) => `row ${i}`) }
  const started = Date.now()
  const result = writeDocument(load, html, data)
  const elapsed = Date.now() - started
  assert.equal(result.changed, true)
  assert.equal(read(result.html).items.length, 2000)
  assert.ok(elapsed < 3000, `2000-row list write took ${elapsed}ms`)
})
