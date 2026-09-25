import assert from 'node:assert/strict'
import test from 'node:test'
import * as cheerio from 'cheerio'
import cheerioAdapter from '../src/adapters/cheerio.js'
import { planWrite } from '../src/engine/index.js'

const DOC = '<h1>T</h1><a id="a" href="/">x</a><ul><li><b>A</b><i>1</i></li></ul>'

function plan(rules, data, html = DOC) {
  const $ = cheerio.load(html)
  return { $, result: planWrite(cheerioAdapter, $.root(), rules, data) }
}

test('a clean body reports nothing', () => {
  const { result } = plan(
    { title: 'h1', link: '#a@href', items: ['li', { name: 'b', n: 'i' }] },
    { title: 'X', link: '/y', items: [{ name: 'B', n: '2' }, { name: 'C' }] },
  )
  assert.deepEqual(result, { unknownKeys: [], unmatched: [] })
})

test('a top-level typo is an unknown key', () => {
  const { result } = plan(
    { title: 'h1', link: '#a@href', items: ['li', { name: 'b', n: 'i' }] },
    { titel: 'X' },
  )
  assert.deepEqual(result.unknownKeys, ['titel'])
})

test('a typo inside a list item is an unknown key', () => {
  const { result } = plan(
    { title: 'h1', link: '#a@href', items: ['li', { name: 'b', n: 'i' }] },
    { items: [{ name: 'B' }, { nmae: 'C' }] },
  )
  assert.deepEqual(result.unknownKeys, ['items[1].nmae'])
})

test('a typo inside a nested object is an unknown key', () => {
  const { result } = plan({ meta: { title: 'h1' } }, { meta: { titel: 'X' } })
  assert.deepEqual(result.unknownKeys, ['meta.titel'])
})

test('a text rule whose selector matches nothing is unmatched', () => {
  const { result } = plan({ sub: 'h2' }, { sub: 'X' })
  assert.deepEqual(result.unmatched, [{ path: 'sub', selector: 'h2' }])
})

test('an attribute rule whose selector matches nothing is unmatched', () => {
  const { result } = plan({ img: 'img@src' }, { img: 'a.png' })
  assert.deepEqual(result.unmatched, [{ path: 'img', selector: 'img' }])
})

test('keys absent from the data are never reported', () => {
  const { result } = plan({ sub: 'h2', title: 'h1' }, { title: 'X' })
  assert.deepEqual(result, { unknownKeys: [], unmatched: [] })
})

test('list rules are never reported as unmatched, even when empty', () => {
  const { result } = plan(
    { items: 'li[]', rows: ['li', { n: 'b' }] },
    { items: ['a'], rows: [{ n: 'x' }] },
    '<ul></ul>',
  )
  assert.deepEqual(result.unmatched, [])
})

test('planWrite never mutates the document', () => {
  const $ = cheerio.load(DOC)
  const before = $.html()
  const result = planWrite(
    cheerioAdapter,
    $.root(),
    { title: 'h1', sub: 'h2', items: ['li', { name: 'b' }] },
    { titel: 'X', sub: 'Y', items: [{ name: 'B' }] },
  )
  assert.ok(result.unknownKeys.length > 0 && result.unmatched.length > 0)
  assert.equal($.html(), before)
})
