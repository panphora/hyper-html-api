import { test } from 'node:test'
import assert from 'node:assert/strict'

import { scaffold } from '../src/cms/scaffold.js'

test('scaffold — scalar rule → empty string', () => {
  assert.equal(scaffold('h1'), '')
  assert.equal(scaffold('.title'), '')
  assert.equal(scaffold('@href'), '')
  assert.equal(scaffold('.'), '')
})

test('scaffold — scalar-array rule (suffix []) → empty array', () => {
  assert.deepEqual(scaffold('li[]'), [])
  assert.deepEqual(scaffold('.tag[]'), [])
})

test('scaffold — object-array rule → empty array (shape not expanded)', () => {
  assert.deepEqual(scaffold(['.product', { name: '.name', price: '.price' }]), [])
})

test('scaffold — object rule → object with each key scaffolded', () => {
  assert.deepEqual(scaffold({ name: '.name', bio: '.bio' }), {
    name: '',
    bio: '',
  })
})

test('scaffold — deeply nested object', () => {
  const shape = {
    title: 'h1',
    author: { name: '.name', tags: '.tag[]' },
    products: ['.product', { name: '.name' }],
  }
  assert.deepEqual(scaffold(shape), {
    title: '',
    author: { name: '', tags: [] },
    products: [],
  })
})

test('scaffold — unsupported rule (null, undefined, number) falls through to ""', () => {
  assert.equal(scaffold(null), '')
  assert.equal(scaffold(undefined), '')
  assert.equal(scaffold(42), '')
})
