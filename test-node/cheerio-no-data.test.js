import assert from 'node:assert/strict'
import test from 'node:test'
import * as cheerio from 'cheerio'
import adapter, { isNoDataEl } from '../src/adapters/cheerio.js'
import { capabilitySelector } from '../src/lib/region-capabilities.js'
import { extract, apply } from '../src/engine/index.js'

test('no-data rows are invisible to list reads', () => {
  const $ = cheerio.load('<ul><li editor-ui>Add</li><li>A</li><li>B</li></ul>')
  assert.deepEqual(extract(adapter, $.root(), ['li', '.']), ['A', 'B'])
})

test('a no-data root reads as empty content', () => {
  const $ = cheerio.load('<section editor-ui><p>Tools</p></section>')
  assert.deepEqual(extract(adapter, $('section'), { text: '.', p: 'p' }), { text: '', p: null })
})

test('no-data descendants are projected out of scalar text reads', () => {
  for (const html of [
    '<p id="x">Hi <span no-data>secret</span>there</p>',
    '<p id="x">Hi <span clay="no-data">secret</span>there</p>',
  ]) {
    const $ = cheerio.load(html)
    assert.deepEqual(extract(adapter, $.root(), { t: '#x' }), { t: 'Hi there' })
  }
})

test('no-data descendants are projected out of innerHTML reads', () => {
  const $ = cheerio.load('<p id="x">Hi <span no-data>secret</span>there</p>')
  assert.deepEqual(extract(adapter, $.root(), { h: '#x@innerHTML' }), { h: 'Hi there' })
})

test('text writes keep no-data children in place', () => {
  const $ = cheerio.load('<p id="x">Hi <span no-data>UI</span></p>')
  apply(adapter, $.root(), { t: '#x' }, { t: 'Bye' })
  assert.equal($('#x').html(), 'Bye<span no-data="">UI</span>')
})

test('text writes escape the value they insert around no-data children', () => {
  const $ = cheerio.load('<p id="x">Hi <span no-data>UI</span></p>')
  apply(adapter, $.root(), { t: '#x' }, { t: 'a < b & c' })
  assert.equal($('#x').html(), 'a &lt; b &amp; c<span no-data="">UI</span>')
})

test('a trailing no-data row is a wall, not a sibling to replace', () => {
  const $ = cheerio.load('<ul><li>A</li><li editor-ui>Add</li></ul>')
  apply(adapter, $('ul'), ['li', '.'], ['A', 'B'])
  assert.deepEqual(
    $('ul').children().map((_, node) => ($(node).attr('editor-ui') !== undefined ? 'UI' : $(node).text())).get(),
    ['A', 'B', 'UI'],
  )
})

test('no-data rows interleave with written content and stay where they are', () => {
  const $ = cheerio.load(
    '<main><ul id="mixed"><li editor-ui>L</li><li>A</li><li editor-ui>M</li><li>B</li><li editor-ui>T</li></ul><ul id="empty"><li cms-template></li><li editor-ui>Add</li></ul></main>',
  )
  apply(adapter, $('#mixed'), ['li', '.'], ['A', 'B', 'C'])
  apply(adapter, $('#empty'), ['li', '.'], ['First'], { templateAttr: 'cms-template' })
  assert.deepEqual(
    $('#mixed').children().map((_, node) => ($(node).attr('editor-ui') !== undefined ? $(node).text() : `[${$(node).text()}]`)).get(),
    ['L', '[A]', 'M', '[B]', '[C]', 'T'],
  )
  assert.deepEqual(
    $('#empty').children().map((_, node) => ($(node).attr('editor-ui') !== undefined
      ? $(node).text()
      : $(node).attr('cms-template') !== undefined ? 'Template' : `[${$(node).text()}]`)).get(),
    ['[First]', 'Template', 'Add'],
  )
})

test('a grown row clones without its no-data parts', () => {
  const $ = cheerio.load('<ul><li>A<button no-data>x</button></li></ul>')
  apply(adapter, $('ul'), ['li', '.'], ['A', 'B'])
  assert.equal($('ul li').eq(1).html(), 'B')
  assert.equal($('ul li').eq(0).find('button').length, 1)
})

test('documents with no no-data region are byte-for-byte unchanged', () => {
  const $ = cheerio.load('<ul>\n  <li>A</li>\n</ul>')
  apply(adapter, $('ul'), ['li', '.'], ['A', 'B'])
  assert.equal($.html('ul'), '<ul>\n  <li>A</li>\n<li>B</li></ul>')
})

test('isNoDataEl agrees with the NO_DATA selector', () => {
  const NO_DATA = capabilitySelector('data')
  const cases = [
    ['<p no-data>', true],
    ['<p editor-ui>', true],
    ['<p clay="a no-data">', true],
    ['<p clay="no-database">', false],
    ['<p clay="editor-ui  x">', true],
    ['<p>', false],
  ]
  for (const [html, expected] of cases) {
    const node = cheerio.load(html)('p')
    assert.equal(isNoDataEl(node[0]), node.is(NO_DATA), `${html} agrees with the selector`)
    assert.equal(isNoDataEl(node[0]), expected, `${html} is ${expected}`)
  }
})
