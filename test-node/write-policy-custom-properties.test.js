import test from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import { writeDocument } from '../src/write.js'
import { applyData } from '../src/dom-api.js'
import { checkCustomPropertyValue } from '../src/engine/write-policy.js'

const SRC =
  '<!doctype html><html style="color: red"><head></head>' +
  '<body><p id="p" style="color: red">x</p></body></html>'

const RULES = { accent: 'html@--accent' }

// The server path returns the new source; the browser path mutates the live
// tree. Both must agree on the attribute they produced.
function applyBoth(html, rules, data, selector) {
  const written = writeDocument(cheerio.load, html, data, { rules })
  const $ = cheerio.load(written.html)
  const server = $(selector).attr('style') ?? null
  const document = new JSDOM(html).window.document
  applyData(document, data, rules)
  const browser = document.querySelector(selector).getAttribute('style')
  assert.equal(server, browser, 'server and browser produce the same attribute')
  return server
}

function refuseBoth(html, rules, data) {
  assert.throws(() => writeDocument(cheerio.load, html, data, { rules }), { name: 'WriteRefused' })
  const document = new JSDOM(html).window.document
  const before = document.documentElement.outerHTML
  assert.throws(() => applyData(document, data, rules), { name: 'WriteRefused' })
  assert.equal(document.documentElement.outerHTML, before, 'the live document is unchanged')
}

const allowedValues = [
  'oklch(58.6% 0.253 17.585)',
  '#155dfc',
  "'Fraunces', ui-serif, Georgia, serif",
  '2rem',
]

for (const value of allowedValues) {
  test(`custom property write is content: ${value}`, () => {
    assert.equal(applyBoth(SRC, RULES, { accent: value }, 'html'), `color: red; --accent: ${value}`)
  })
}

test('custom property write changes an existing value and keeps the rest', () => {
  const html = SRC.replace('style="color: red"', 'style="color: red; --accent: red"')
  assert.equal(applyBoth(html, RULES, { accent: '#155dfc' }, 'html'), 'color: red; --accent: #155dfc')
})

test('clearing a custom property drops the declaration and keeps the rest', () => {
  const html = SRC.replace('style="color: red"', 'style="color: red; --accent: red"')
  assert.equal(applyBoth(html, RULES, { accent: '' }, 'html'), 'color: red')
})

test('clearing the only custom property removes the whole style attribute', () => {
  const html = '<!doctype html><section id="s" style="--bg: red"></section>'
  assert.equal(applyBoth(html, { bg: '#s@--bg' }, { bg: '' }, '#s'), null)
})

const refusedValues = [
  ['a semicolon', 'red; color: blue'],
  ['a closing brace', 'red}'],
  ['an angle bracket', '<script>'],
  ['a backslash', 'a\\b'],
  ['url()', 'url(x.png)'],
  ['url() in any case', 'URL (x.png)'],
  ['image-set()', 'image-set("a.png" 1x)'],
  ['expression()', 'expression(alert(1))'],
  ['an over-long value', 'a'.repeat(201)],
]

for (const [label, value] of refusedValues) {
  test(`custom property write refuses ${label}`, () => {
    refuseBoth(SRC, RULES, { accent: value })
  })
}

test('custom property write refuses an over-long value at exactly one char over the limit', () => {
  refuseBoth(SRC, RULES, { accent: 'a'.repeat(201) })
  assert.equal(applyBoth(SRC, RULES, { accent: 'a'.repeat(200) }, 'html'), `color: red; --accent: ${'a'.repeat(200)}`)
})

test('a plain declaration through @style is still refused', () => {
  refuseBoth(SRC, { p: '#p@style' }, { p: 'color: blue' })
})

test('a style text rule is still refused', () => {
  refuseBoth('<!doctype html><style id="t">a{}</style>', { t: '#t' }, { t: 'b{}' })
})

test('a script text rule is still refused', () => {
  refuseBoth('<!doctype html><script id="t">a</script>', { t: '#t' }, { t: 'alert(1)' })
})

test('a javascript URL is still refused', () => {
  refuseBoth('<!doctype html><a id="a" href="/">x</a>', { link: '#a@href' }, { link: 'javascript:alert(1)' })
})

test('an allowed custom property write next to a refused script write changes nothing', () => {
  refuseBoth(
    '<!doctype html><html style="color: red"><head></head><body><script id="t">a</script></body></html>',
    { accent: 'html@--accent', s: '#t' },
    { accent: '#155dfc', s: 'alert(1)' },
  )
})

test('checkCustomPropertyValue allows values that cannot load, close or inject', () => {
  for (const value of [
    ...allowedValues,
    'var(--x)',
    'calc(1rem + 2px)',
    'color-mix(in oklch, red 20%, blue)',
    'a'.repeat(200),
  ]) {
    assert.equal(checkCustomPropertyValue(value), null, value)
  }
})

test('checkCustomPropertyValue refuses values that can load, close or inject', () => {
  for (const [label, value] of refusedValues) {
    const reason = checkCustomPropertyValue(value)
    assert.equal(typeof reason, 'string', label)
    assert.ok(reason.length > 0, label)
  }
  assert.match(checkCustomPropertyValue('a'.repeat(201)), /200 characters/)
  assert.match(checkCustomPropertyValue('red}'), /"}" is not allowed/)
  assert.match(checkCustomPropertyValue('url(x.png)'), /"url\(\)" is not allowed/)
})
