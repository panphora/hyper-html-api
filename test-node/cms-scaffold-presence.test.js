import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as cheerio from 'cheerio'

import { scaffold } from '../src/cms/scaffold.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import { extract } from '../src/engine/index.js'
import { writeDocument } from '../src/write.js'

// form-builder uses bare `document.createElement` etc., so we install jsdom
// globals before importing it.
const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.DocumentFragment = dom.window.DocumentFragment
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node

const { buildForm } = await import('../src/cms/form-builder.js')

const load = cheerio.load

test('scaffold gives attribute fields null and text fields ""', () => {
  assert.equal(scaffold('@href'), null)
  assert.equal(scaffold('a@href'), null)
  assert.equal(scaffold('@data-id'), null)
  assert.equal(scaffold('h1'), '')
  assert.equal(scaffold('.'), '')
  assert.deepEqual(scaffold({ id: '@data-id', name: 'h1', labels: '@data-labels', text: '.' }), {
    id: null,
    name: '',
    labels: null,
    text: '',
  })
})

test('a scaffolded row renders its absent attributes as empty inputs', () => {
  const rules = { items: ['li.row', { id: '@data-id', name: '.name', href: 'a@href' }] }
  const appRoot = document.createElement('div')
  appRoot.innerHTML = '<ul class="rows"><li class="row" data-id="a"><span class="name">A</span><a href="/a">a</a></li></ul>'

  const host = document.createElement('div')
  document.body.innerHTML = ''
  document.body.appendChild(host)
  host.appendChild(buildForm({ rules, data: { items: [scaffold(rules.items[1])] }, appRoot }))

  const inputs = Array.from(host.querySelectorAll('.field-row input'))
  assert.equal(inputs.length, 3)
  for (const input of inputs) assert.equal(input.value, '')
})

test('writing an untouched scaffolded row keeps its attribute fields absent', () => {
  const rules = { items: ['li.row', { id: '@data-id', name: '.name', href: 'a@href' }] }
  const html = '<ul class="rows"><li class="row" data-id="a"><span class="name">A</span><a href="/a">a</a></li></ul>'
  const read = (source) => extract(cheerioAdapter, load(source).root(), rules).items

  const added = { id: 'a', name: 'A', href: '/a' }
  const result = writeDocument(load, html, { items: [added, scaffold(rules.items[1])] }, { rules })
  assert.equal(result.changed, true)
  assert.deepEqual(read(result.html), [added, { id: null, name: '', href: null }])

  const rows = load(result.html)('li.row')
  assert.equal(rows.length, 2)
  assert.equal(rows.eq(1).attr('data-id'), undefined, 'the new row has no data-id')
  assert.equal(rows.eq(1).find('a').attr('href'), undefined, 'the new row has no href')
})
