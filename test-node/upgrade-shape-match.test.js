import { test } from 'node:test'
import assert from 'node:assert/strict'

import { shapeMatch } from '../src/upgrade/shape-match.js'

test('shape-match: scalar carry + missing field stays undefined', () => {
  const v2Rules = { title: 'h1', subtitle: '.subtitle', tagline: '.tagline' }
  const v1Data = { title: 'hi', subtitle: 'hey' }
  const { data, summary } = shapeMatch(v1Data, v2Rules)
  assert.deepEqual(data, { title: 'hi', subtitle: 'hey' })
  assert.equal(summary.carriedOver, 2)
  assert.equal(summary.discarded, 0)
})

test('shape-match: extra v1 field is counted as discarded', () => {
  const v2Rules = { title: 'h1' }
  const v1Data = { title: 'hi', dropped: 'bye' }
  const { summary } = shapeMatch(v1Data, v2Rules)
  assert.equal(summary.carriedOver, 1)
  assert.equal(summary.discarded, 1)
})

test('shape-match: object array trimmed to v1 count, missing fields undefined', () => {
  const v2Rules = {
    products: ['.product', { name: '.name', price: '.price', description: '.description' }],
  }
  const v1Data = {
    products: [
      { name: 'A', price: '$1' },
      { name: 'B', price: '$2' },
    ],
  }
  const { data, summary } = shapeMatch(v1Data, v2Rules)
  assert.equal(data.products.length, 2)
  assert.deepEqual(data.products[0], { name: 'A', price: '$1' })
  assert.equal(summary.listItems, 2)
})

test('shape-match: scalar-array rule (sel[]) carries v1 array as-is', () => {
  const v2Rules = { tags: '.tag-cloud .tag[]' }
  const v1Data = { tags: ['a', 'b', 'c'] }
  const { data, summary } = shapeMatch(v1Data, v2Rules)
  assert.deepEqual(data.tags, ['a', 'b', 'c'])
  assert.equal(summary.listItems, 3)
  assert.equal(summary.carriedOver, 3)
  assert.equal(summary.discarded, 0)
})

test('shape-match: nested object array discards count correctly', () => {
  const v2Rules = {
    sections: ['.section', { title: '.title', items: ['.item', { text: '.text' }] }],
  }
  const v1Data = {
    sections: [
      { title: 'S1', items: [{ text: 'a', extra: 'x' }] },
    ],
  }
  const { summary } = shapeMatch(v1Data, v2Rules)
  assert.equal(summary.discarded, 1)
})
