import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import { createDomAdapter } from '../src/adapters/dom.js'

// The content-view adapter inserts a grown row by anchoring it to the last row
// already placed (insertAfter) once the projected parent has no sibling left to
// insert before. The live list and the projected copy both have to end up with
// the rows in order, and the unowned editor UI has to stay out of the copy.

const RULES = { items: ['#l > li', { t: '.' }] }
const HTML =
  '<!doctype html><html><body>' +
  '<ul id="l"><li>a</li><li>b</li><span editor-ui>UI</span>\n</ul>' +
  '</body></html>'

test('content-view adapter places grown rows after the last placed row', () => {
  const { document } = new JSDOM(HTML).window
  const adapter = createDomAdapter(document, { _write: true })
  const ul = document.getElementById('l')

  apply(adapter, document, RULES, { items: [{ t: 'a' }, { t: 'b' }, { t: 'c' }, { t: 'd' }] })

  assert.deepEqual(extract(adapter, document, RULES), {
    items: [{ t: 'a' }, { t: 'b' }, { t: 'c' }, { t: 'd' }],
  })
  assert.deepEqual(
    [...ul.children].map((node) => (node.hasAttribute('editor-ui') ? 'UI' : node.textContent)),
    ['a', 'b', 'c', 'd', 'UI'],
  )
  const projected = adapter.prop(ul, 'innerHTML')
  assert.ok(!projected.includes('UI'), `the projected copy kept the editor UI: ${projected}`)
  assert.deepEqual(projected.match(/<li>[^<]*<\/li>/g), ['<li>a</li>', '<li>b</li>', '<li>c</li>', '<li>d</li>'])
})
