import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import artifact from '../dist/hyper-html-api.engine.esm.js'
import { applyData, extractData } from '../src/dom-api.js'

// dist/hyper-html-api.engine.esm.js is a packaged artifact: ClayJS vendors it as
// src/vendor/hyper-html-api-data.vendor.js and imports it on the visitor-drafts
// restore path. Nothing else in the build reads it, so a stale bundle ships
// silently. These tests run the packaged file against the same inputs as the
// source engine and demand the same answers.

const HTML =
  '<main><ul class="rows"></ul><p data-done=""></p></main>' +
  '<div cms-template hidden><ul class="rows"><li cms-template>seed</li></ul></div>'

const RULES = { done: 'p@data-done', items: ['ul.rows > li', '.'] }

const doc = () => new JSDOM(HTML).window.document

test('the packaged engine reads an empty attribute as "" like the source', () => {
  assert.deepEqual(artifact.extractData(doc(), RULES), { done: '', items: [] })
  assert.deepEqual(extractData(doc(), RULES), { done: '', items: [] })
})

test('the packaged engine inserts a new row into the list, not into the seed bank', () => {
  const packaged = doc()
  artifact.applyData(packaged, { items: ['new'] }, RULES)
  assert.deepEqual(artifact.extractData(packaged, RULES), { done: '', items: ['new'] })
  assert.equal(packaged.querySelectorAll('main ul.rows > li').length, 1, 'the row is in the live list')
  assert.equal(packaged.querySelectorAll('div[cms-template] ul.rows > li').length, 1, 'the bank kept only its seed')

  const source = doc()
  applyData(source, { items: ['new'] }, RULES)
  assert.deepEqual(extractData(source, RULES), { done: '', items: ['new'] })
  assert.equal(source.querySelectorAll('main ul.rows > li').length, 1)
})
