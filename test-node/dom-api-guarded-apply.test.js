import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'
import { applyData, extractData } from '../src/dom-api.js'
import { writeDocument } from '../src/write.js'

function captureError(run) {
  let caught
  try {
    run()
  } catch (error) {
    caught = error
  }
  assert.ok(caught)
  return caught
}

const cases = [
  ['innerHTML', '<main id="target">A</main>', { value: '#target@innerHTML' }, { value: '<b>B</b>' }],
  ['script text', '<script id="target">A</script>', { value: '#target' }, { value: 'alert(1)' }],
  ['style text', '<style id="target">a{}</style>', { value: '#target' }, { value: 'b{}' }],
  ['handler attribute', '<button id="target">A</button>', { value: '#target@onclick' }, { value: 'alert(1)' }],
  ['javascript URL', '<a id="target" href="/">A</a>', { value: '#target@href' }, { value: 'javascript:alert(1)' }],
  ['unknown key', '<h1>A</h1>', { title: 'h1' }, { titel: 'B' }],
]

for (const [label, html, rules, data] of cases) {
  test(`applyData matches writeDocument refusal for ${label}`, () => {
    const document = new JSDOM(html).window.document
    const before = document.documentElement.outerHTML
    let serverError
    let browserError
    try {
      writeDocument(cheerio.load, html, data, { rules })
    } catch (error) {
      serverError = error
    }
    try {
      applyData(document, data, rules)
    } catch (error) {
      browserError = error
    }
    assert.ok(serverError)
    assert.ok(browserError)
    assert.equal(browserError.name, serverError.name)
    assert.equal(browserError.code, serverError.name)
    assert.equal('status' in browserError, false)
    assert.notEqual(browserError.details, undefined)
    assert.equal(document.documentElement.outerHTML, before)
  })
}

test('one allowed key plus one refused key leaves the live DOM unchanged', () => {
  const document = new JSDOM('<h1>A</h1><style id="target">a{}</style>').window.document
  const title = document.querySelector('h1')
  const before = document.documentElement.outerHTML
  assert.throws(() => applyData(document, { title: 'B', style: 'b{}' }, { title: 'h1', style: '#target' }), { name: 'WriteRefused' })
  assert.equal(document.documentElement.outerHTML, before)
  assert.equal(document.querySelector('h1'), title)
})

test('live option selection is validated before any live change', () => {
  const document = new JSDOM('<h1>Before</h1><select><option class="first" selected>First</option><option class="second">Second</option></select>').window.document
  document.querySelector('select').selectedIndex = 1
  const title = document.querySelector('h1')
  assert.throws(
    () => applyData(document, { title: 'After', selectedClass: 'first' }, { title: 'h1', selectedClass: 'option:checked@classList' }),
    { name: 'RuleTargetReadOnly' },
  )
  assert.equal(title.textContent, 'Before')
  assert.equal(document.querySelector('select').selectedIndex, 1)
})

test('live option selection cannot bypass protected attribute policy', () => {
  const document = new JSDOM('<select><option selected contenteditable="false">First</option><option>Second</option></select>').window.document
  document.querySelector('select').selectedIndex = 1
  const selected = document.querySelectorAll('option')[1]
  assert.throws(
    () => applyData(document, { editable: 'false' }, { editable: 'option:checked@contenteditable' }),
    { name: 'WriteRefused' },
  )
  assert.equal(selected.getAttribute('contenteditable'), null)
  assert.equal(document.querySelector('select').selectedIndex, 1)
})

test('a rooted applyData call still enforces ancestor policy', () => {
  const document = new JSDOM('<object><div id="root"><p>Before</p></div></object>').window.document
  const root = document.querySelector('#root')
  const paragraph = root.querySelector('p')
  assert.throws(() => applyData(root, { title: 'After' }, { title: 'p' }), { name: 'WriteRefused' })
  assert.equal(paragraph.textContent, 'Before')
})

test('an unmatched selector rejects before any live change', () => {
  const document = new JSDOM('<h1>A</h1>').window.document
  const before = document.documentElement.outerHTML
  assert.throws(() => applyData(document, { title: 'B', subtitle: 'C' }, { title: 'h1', subtitle: 'h2' }), { name: 'WriteRejected' })
  assert.equal(document.documentElement.outerHTML, before)
})

test('a validated list growth applies to live nodes and keeps existing identity', () => {
  const document = new JSDOM('<ul><li><b>A</b></li></ul>').window.document
  const first = document.querySelector('li')
  applyData(document, { items: [{ name: 'A' }, { name: 'B' }] }, { items: ['li', { name: 'b' }] })
  assert.equal(document.querySelector('li'), first)
  assert.deepEqual(
    [...document.querySelectorAll('li')].map(node => node.textContent),
    ['A', 'B'],
  )
})

test('extractData and applyData default to the api rules tag', () => {
  const document = new JSDOM(`
    <script data-rules-name="recipe" data-rules-version="1">{title:"p"}</script>
    <script data-rules-name="api public" data-rules-version="1">{title:"h1"}</script>
    <h1>API title</h1><p>Recipe title</p>
  `).window.document
  assert.deepEqual(extractData(document), { title: 'API title' })
  applyData(document, { title: 'Changed' })
  assert.equal(document.querySelector('h1').textContent, 'Changed')
  assert.equal(document.querySelector('p').textContent, 'Recipe title')
})

test('a non-api rules tag is not used as the default', () => {
  const document = new JSDOM(`
    <script data-rules-name="recipe" data-rules-version="1">{title:"h1"}</script>
    <h1>Recipe title</h1>
  `).window.document
  assert.throws(() => extractData(document), { name: 'NoRulesTag' })
  assert.throws(() => applyData(document, { title: 'Changed' }), {
    name: 'NoRulesTag',
  })
})

test('a selected file input does not break detached validation', () => {
  const document = new JSDOM('<input type="file"><h1>Before</h1>').window.document
  Object.defineProperty(document.querySelector('input'), 'value', {
    configurable: true,
    value: 'C:\\fakepath\\sample.txt',
  })
  applyData(document, { title: 'After' }, { title: 'h1' })
  assert.equal(document.querySelector('h1').textContent, 'After')
})

test('a live-only property is rejected before an earlier live write', () => {
  const document = new JSDOM('<h1>Before</h1><video></video>').window.document
  Object.defineProperty(document.querySelector('video'), 'paused', {
    configurable: true,
    value: false,
  })
  const error = captureError(() => applyData(document, { title: 'After', paused: true }, { title: 'h1', paused: 'video@paused' }))
  assert.equal(error.name, 'RuleTargetReadOnly')
  assert.equal(error.code, 'RuleTargetReadOnly')
  assert.deepEqual(error.details, { target: 'paused' })
  assert.equal(document.querySelector('h1').textContent, 'Before')
})

test('the generated satellite distinguishes options from legacy sources', () => {
  const window = new JSDOM(`
    <script data-rules-name="recipe" data-rules-version="1">{title:"p"}</script>
    <script data-rules-name="api" data-rules-version="1">{title:"h1"}</script>
    <h1>API</h1><p>Recipe</p><h2>Options</h2>
  `, { runScripts: 'outside-only' }).window
  const satellite = readFileSync(new URL('../../clayjs/entries/clay-data.js', import.meta.url), 'utf8')
  window.eval(satellite)

  window.clay.applyData({ title: 'Named' }, 'recipe')
  assert.equal(window.document.querySelector('p').textContent, 'Named')
  window.clay.applyData({ title: 'Inline' }, { title: 'p' })
  assert.equal(window.document.querySelector('p').textContent, 'Inline')
  window.clay.applyData({ title: 'Default null' }, null)
  assert.equal(window.document.querySelector('h1').textContent, 'Default null')
  window.clay.applyData({ title: 'Default omitted' })
  assert.equal(window.document.querySelector('h1').textContent, 'Default omitted')
  const options = window.eval('({ rules: { title: "h2" } })')
  window.clay.applyData({ title: 'Explicit options' }, options)
  assert.equal(window.document.querySelector('h2').textContent, 'Explicit options')

  const root = window.document.querySelector('p')
  window.clay.applyData(root, { title: 'Rooted' }, { title: '.' })
  assert.equal(root.textContent, 'Rooted')
})

test('invalid writes expose a code and structured details', () => {
  const scenarios = [
    {
      name: 'ShapeMismatch',
      run() {
        const document = new JSDOM('<h1>Before</h1>').window.document
        applyData(document, { title: { nested: true } }, { title: 'h1' })
      },
    },
    {
      name: 'EmptyListInsert',
      run() {
        const document = new JSDOM('<ul></ul>').window.document
        applyData(document, { items: [{ title: 'New' }] }, { items: ['li', { title: '.' }] })
      },
    },
    {
      name: 'RuleTargetReadOnly',
      run() {
        const document = new JSDOM('<video></video>').window.document
        applyData(document, { paused: true }, { paused: 'video@paused' })
      },
    },
  ]

  for (const scenario of scenarios) {
    const error = captureError(scenario.run)
    assert.equal(error.name, scenario.name)
    assert.equal(error.code, scenario.name)
    assert.ok(error.details && typeof error.details === 'object')
  }
})

test('a rooted applyData call validates shadow root content on a fragment clone', () => {
  const document = new JSDOM('<div id="host"></div>').window.document
  const shadow = document.querySelector('#host').attachShadow({ mode: 'open' })
  shadow.innerHTML = '<section><h1>Before</h1></section>'
  const root = shadow.querySelector('section')
  const title = root.querySelector('h1')
  applyData(root, { title: 'After' }, { title: 'h1' })
  assert.equal(root.querySelector('h1'), title)
  assert.equal(title.textContent, 'After')
})
