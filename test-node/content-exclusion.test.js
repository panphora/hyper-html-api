import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { engine } from '../src/dom-api.js'
import { extract as engineExtract } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import { createContentView } from '../src/lib/content-dom.js'

test('DOM extraction applies structural selectors to the no-data view and returns live rows', () => {
  const { document } = new JSDOM('<ul><li editor-ui>Add</li><li id="a">A</li><li id="b">B</li></ul>').window
  const ul = document.querySelector('ul')
  let rows
  const data = engine.extract(ul, { last: 'li:last-child', items: ['li', '.'] }, {
    onRowsRead(_path, nodes) { rows = nodes },
  })
  assert.deepEqual(data, { last: 'B', items: ['A', 'B'] })
  assert.equal(rows[0], document.getElementById('a'))
})

test('document rooted extraction uses the filtered document view', () => {
  const { document } = new JSDOM('<ul><li>A</li><li editor-ui>Add</li></ul>').window
  assert.deepEqual(engine.extract(document, ['li', '.']), ['A'])
})

test('detached and excluded operation roots still enforce data exclusions', () => {
  const { document } = new JSDOM('<main></main>').window
  const detached = document.createElement('ul')
  detached.innerHTML = '<li>A</li><li editor-ui>Add</li>'
  assert.deepEqual(engine.extract(detached, ['li', '.']), ['A'])
  const excluded = document.createElement('section')
  excluded.setAttribute('editor-ui', '')
  excluded.innerHTML = '<p>Tools</p>'
  assert.deepEqual(engine.extract(excluded, { text: '.', p: 'p' }), { text: '', p: null })
})

test('DOM apply inserts content before trailing editor UI', () => {
  const { document } = new JSDOM('<ul><li>A</li><li editor-ui>Add</li></ul>').window
  const ul = document.querySelector('ul')
  engine.apply(ul, ['li', '.'], ['A', 'B'])
  assert.deepEqual([...ul.children].map(node => node.hasAttribute('editor-ui') ? 'UI' : node.textContent), ['A', 'B', 'UI'])
})

test('DOM apply keeps leading and interleaved UI in place and inserts before an all-UI tail', () => {
  const { document } = new JSDOM('<main><ul id="mixed"><li editor-ui>L</li><li>A</li><li editor-ui>M</li><li>B</li><li editor-ui>T</li></ul><ul id="empty"><li cms-template></li><li editor-ui>Add</li></ul></main>').window
  const mixed = document.getElementById('mixed')
  const empty = document.getElementById('empty')
  engine.apply(mixed, ['li', '.'], ['A', 'B', 'C'])
  engine.apply(empty, ['li', '.'], ['First'], { templateAttr: 'cms-template' })
  assert.deepEqual([...mixed.children].map(node => node.hasAttribute('editor-ui') ? node.textContent : `[${node.textContent}]`), ['L', '[A]', 'M', '[B]', '[C]', 'T'])
  assert.deepEqual([...empty.children].map(node => node.hasAttribute('editor-ui') ? node.textContent : node.hasAttribute('cms-template') ? 'Template' : `[${node.textContent}]`), ['[First]', 'Template', 'Add'])
})

test('exclude null requests the raw DOM view', () => {
  const { document } = new JSDOM('<ul><li>A</li><li editor-ui>Add</li></ul>').window
  assert.deepEqual(engine.extract(document.querySelector('ul'), ['li', '.'], { exclude: null }), ['A', 'Add'])
})

test('custom exclusions extend the default no-data view', () => {
  const dom = new JSDOM('<main><p class="keep">One</p><p class="custom">Two</p><p no-data>Three</p></main>')
  const root = dom.window.document.querySelector('main')
  assert.deepEqual(engine.extract(root, { values: ['p', '.'] }, { exclude: '.custom' }), { values: ['One'] })
})

test('a bound port creates one fresh content view per get or set operation', () => {
  const { document } = new JSDOM('<main><p>A</p><button editor-ui>Add</button></main>').window
  const root = document.querySelector('main')
  const port = engine.bind(root, { value: 'p' })
  assert.deepEqual(port.get(), { value: 'A' })
  root.querySelector('p').textContent = 'B'
  assert.deepEqual(port.get(), { value: 'B' })
  port.set({ value: 'C' })
  assert.equal(root.querySelector('p').textContent, 'C')
  assert.equal(root.querySelector('[editor-ui]').textContent, 'Add')
})

test('HTML replacement keeps descendant provenance for later writes in the same operation', () => {
  const { document } = new JSDOM('<main><section><b>A</b></section><button editor-ui>Add</button></main>').window
  const root = document.querySelector('main')
  engine.apply(root, { html: 'section@innerHTML', value: 'section b' }, { html: '<b>B</b>', value: 'C' })
  assert.equal(root.querySelector('b').textContent, 'C')
  assert.equal(root.querySelector('[editor-ui]').textContent, 'Add')
})

test('HTML and marker writes re-filter later rules in the same operation', () => {
  const first = new JSDOM('<main><section><p>A</p></section></main>').window.document.querySelector('main')
  engine.apply(first, { html: 'section@innerHTML', items: ['section p', '.'] }, {
    html: '<p editor-ui>Add</p><p>A</p>', items: ['B'],
  })
  assert.equal(first.innerHTML, '<section><p editor-ui="">Add</p><p>B</p></section>')

  const second = new JSDOM('<main><p class="target">A</p><p>B</p></main>').window.document.querySelector('main')
  engine.apply(second, { marker: '.target@editor-ui', items: ['p', '.'] }, { marker: '', items: ['C'] })
  assert.equal(second.innerHTML, '<p class="target" editor-ui="">A</p><p>C</p>')
})

test('outerHTML reads serialize the filtered element', () => {
  const root = new JSDOM('<main><p>A<button editor-ui>Add</button></p></main>').window.document.querySelector('main')
  assert.deepEqual(engine.extract(root, { value: 'p@outerHTML' }), { value: '<p>A</p>' })
})

test('scalar content writes retain excluded descendants', () => {
  for (const [rule, value] of [['.', 'B'], ['@innerHTML', '<p>B</p>'], ['@textContent', 'B']]) {
    const { document } = new JSDOM('<main><p>A</p><button editor-ui>Add</button></main>').window
    const root = document.querySelector('main')
    engine.apply(root, { value: rule }, { value })
    assert.equal(root.querySelector('[editor-ui]').textContent, 'Add')
    assert.equal(root.textContent, 'BAdd')
  }
})

test('content views copy every selected option in a multi-select', () => {
  const { document } = new JSDOM('<select multiple><option>A</option><option>B</option><option>C</option></select>').window
  const select = document.querySelector('select')
  select.options[1].selected = true
  select.options[2].selected = true
  const copy = createContentView(select).root
  assert.deepEqual([...copy.selectedOptions].map(option => option.textContent), ['B', 'C'])
})

test('content views retain authored template contents while excluding runtime UI inside them', () => {
  const { document } = new JSDOM('<main><template><p>A</p><button editor-ui>Add</button></template></main>').window
  const view = createContentView(document.querySelector('main'))
  const content = view.root.querySelector('template').content
  assert.equal(content.firstElementChild.outerHTML, '<p>A</p>')
  assert.equal(content.querySelector('[editor-ui]'), null)
})

test('Cheerio rejects explicit semantic exclusions', () => {
  assert.throws(() => cheerioAdapter.find({}, 'li', { exclude: '[editor-ui]' }), /does not support semantic exclude/)
  assert.throws(() => engineExtract(cheerioAdapter, {}, '.', { exclude: '[editor-ui]' }), /does not support semantic exclude/)
})
