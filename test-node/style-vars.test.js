import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply, findRulesIn, isCustomPropertyName, readStyleVar, writeStyleVar } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'
import { writeDocument } from '../src/write.js'

test('isCustomPropertyName accepts only --names', () => {
  assert.equal(isCustomPropertyName('--accent'), true)
  assert.equal(isCustomPropertyName('--'), false)
  assert.equal(isCustomPropertyName('color'), false)
  assert.equal(isCustomPropertyName('--a b'), false)
  assert.equal(isCustomPropertyName(null), false)
})

test('readStyleVar reads a value out of the attribute text', () => {
  assert.equal(readStyleVar(null, '--a'), null)
  assert.equal(readStyleVar('color: red; --a: oklch(58% 0.2 17)', '--a'), 'oklch(58% 0.2 17)')
  assert.equal(readStyleVar('color: red', '--a'), null)
})

test('readStyleVar: the last declaration wins, unless an earlier one is !important', () => {
  assert.equal(readStyleVar('--a: red; --a: blue', '--a'), 'blue')
  assert.equal(readStyleVar('--a: red !important; --a: blue', '--a'), 'red')
  assert.equal(readStyleVar('--a: red; --a: blue !important', '--a'), 'blue')
})

test('readStyleVar does not split on a ; inside quotes, parens or a comment', () => {
  assert.equal(readStyleVar('content: "a;b"; --a: x', '--a'), 'x')
  assert.equal(readStyleVar('background: url("a;b"); --a: x', '--a'), 'x')
  assert.equal(readStyleVar('/* a;b */ color: red; --a: x', '--a'), 'x')
})

test('a comment before the name does not hide the declaration', () => {
  assert.equal(readStyleVar('/* t */ --x: red !important; color: black', '--x'), 'red')
  assert.equal(writeStyleVar('/* t */ --x: red; color: black', '--x', '').trim(), 'color: black')
})

test('a comment between name and colon and around !important', () => {
  assert.equal(readStyleVar('--x /* a */ : blue /* b */ ! important', '--x'), 'blue')
})

test('readStyleVar treats a mismatched closer as not closing the block', () => {
  assert.equal(readStyleVar('--a: (x]; color: red', 'color'), null)
  assert.equal(readStyleVar('--a: (x); color: red', 'color'), 'red')
  assert.equal(readStyleVar('--a: [x); color: red', 'color'), null)
})

test('a comment-like run inside a string stays', () => {
  assert.equal(readStyleVar('--f: "/* x */"', '--f'), '"/* x */"')
})

test('writeStyleVar appends, replaces and removes', () => {
  assert.equal(writeStyleVar(null, '--a', 'x'), '--a: x')
  assert.equal(writeStyleVar('', '--a', 'x'), '--a: x')
  assert.equal(writeStyleVar('color: red', '--a', 'x'), 'color: red; --a: x')
  assert.equal(writeStyleVar('color: red;', '--a', 'x'), 'color: red; --a: x')
})

test('writeStyleVar replaces in place and keeps the other declarations byte-for-byte', () => {
  assert.equal(
    writeStyleVar('color: red; --a: 1; margin: 0', '--a', '2'),
    'color: red; --a: 2; margin: 0',
  )
})

test('writeStyleVar keeps !important and collapses duplicates', () => {
  assert.equal(writeStyleVar('--a: 1 !important', '--a', '2'), '--a: 2 !important')
  assert.equal(writeStyleVar('--a: 1; --a: 2', '--a', '3'), '--a: 3')
})

test('writeStyleVar removes the property and leaves the rest', () => {
  assert.equal(writeStyleVar('color: red; --a: 1', '--a', null), 'color: red')
  assert.equal(writeStyleVar('color: red; --a: 1', '--a', ''), 'color: red')
  assert.equal(writeStyleVar('--a: 1', '--a', null), null)
  assert.equal(writeStyleVar('--a: 1', '--a', ''), null)
})

const HTML =
  '<html style="color: red; --accent: oklch(58.6% 0.253 17.585)">' +
  '<body><section id="s"></section></body></html>'
const RULES = { a: 'html@--accent', b: '#s@--bg' }

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    htmlStyle: () => $('html').attr('style') ?? null,
    sectionStyle: () => $('#s').attr('style') ?? null,
  }
}

function jsdomCtx(html) {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  return {
    adapter: domAdapter,
    root: doc,
    htmlStyle: () => doc.querySelector('html').getAttribute('style'),
    sectionStyle: () => doc.querySelector('#s').getAttribute('style'),
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

for (const env of envs) {
  test(`style vars [${env.label}] — extract reads the property inside the style attribute`, () => {
    const { adapter, root } = env.make(HTML)
    assert.deepEqual(extract(adapter, root, RULES), {
      a: 'oklch(58.6% 0.253 17.585)',
      b: null,
    })
  })

  test(`style vars [${env.label}] — apply writes the property and leaves the rest alone`, () => {
    const ctx = env.make(HTML)
    apply(ctx.adapter, ctx.root, RULES, { a: '#123456', b: 'oklch(97% 0 0)' })
    assert.deepEqual(extract(ctx.adapter, ctx.root, RULES), {
      a: '#123456',
      b: 'oklch(97% 0 0)',
    })
    assert.equal(ctx.htmlStyle(), 'color: red; --accent: #123456')
  })

  test(`style vars [${env.label}] — an empty value removes the property`, () => {
    const ctx = env.make(HTML)
    apply(ctx.adapter, ctx.root, RULES, { a: '' })
    assert.equal(extract(ctx.adapter, ctx.root, RULES).a, null)
    assert.equal(ctx.htmlStyle(), 'color: red')

    apply(ctx.adapter, ctx.root, RULES, { b: 'oklch(97% 0 0)' })
    assert.equal(ctx.sectionStyle(), '--bg: oklch(97% 0 0)')
    apply(ctx.adapter, ctx.root, RULES, { b: '' })
    assert.equal(ctx.sectionStyle(), null, 'the whole style attribute is gone')
  })
}

test('style vars [jsdom] — applying the same value twice performs no second write', () => {
  const dom = new JSDOM(HTML)
  const doc = dom.window.document
  const counts = { attrWrites: 0, removeAttr: 0 }
  const counting = {
    ...domAdapter,
    attr(node, name, value) {
      if (arguments.length >= 3) counts.attrWrites++
      return domAdapter.attr(node, name, value)
    },
    removeAttr(node, name) {
      counts.removeAttr++
      return domAdapter.removeAttr(node, name)
    },
  }

  apply(counting, doc, RULES, { a: '#123456' })
  assert.equal(counts.attrWrites, 1, 'guard: the first apply writes')
  counts.attrWrites = 0
  counts.removeAttr = 0

  apply(counting, doc, RULES, { a: '#123456' })
  assert.deepEqual(counts, { attrWrites: 0, removeAttr: 0 })
  assert.equal(doc.querySelector('html').getAttribute('style'), 'color: red; --accent: #123456')
})

test('writeDocument writes a @--x value into the style attribute and it round-trips', () => {
  const D =
    '<!doctype html><html style="color: red; --accent: red"><head>' +
    '<script data-rules-name="api" data-rules-version="1">{a:"html@--accent"}</script>' +
    '</head><body><p>x</p></body></html>'
  const result = writeDocument(cheerio.load, D, { a: '#123456' })
  assert.equal(result.changed, true)
  assert.equal(result.html, D.replace('--accent: red', '--accent: #123456'))
  const $ = cheerio.load(result.html)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  assert.deepEqual(extract(cheerioAdapter, $.root(), rules), { a: '#123456' })
})
