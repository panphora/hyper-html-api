import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  toString,
  toConfigKey,
  parseConfigKey,
  fromString,
  getRuleAtPath,
  getValueAtPath,
  setAtPath,
} from '../src/cms/path.js'

test('toString — joins segments with dots, numbers become literal', () => {
  assert.equal(toString([]), '')
  assert.equal(toString(['title']), 'title')
  assert.equal(toString(['products', 0, 'name']), 'products.0.name')
  assert.equal(toString(['a', 12, 'b', 0]), 'a.12.b.0')
})

test('toConfigKey — every number becomes *, strings pass through', () => {
  assert.equal(toConfigKey([]), '')
  assert.equal(toConfigKey(['title']), 'title')
  assert.equal(toConfigKey(['products', 0, 'name']), 'products.*.name')
  assert.equal(toConfigKey(['a', 12, 'b', 7]), 'a.*.b.*')
})

test('parseConfigKey — splits on dots, returns segment strings', () => {
  assert.deepEqual(parseConfigKey(''), [])
  assert.deepEqual(parseConfigKey('title'), ['title'])
  assert.deepEqual(parseConfigKey('products.*.name'), ['products', '*', 'name'])
})

test('parseConfigKey round-trips with toConfigKey for wildcard form', () => {
  const original = ['products', 0, 'name']
  const cfg = toConfigKey(original)
  const parsed = parseConfigKey(cfg)
  assert.deepEqual(parsed, ['products', '*', 'name'])
})

test('fromString — inverse of toString, numbers come back as numbers', () => {
  assert.deepEqual(fromString(''), [])
  assert.deepEqual(fromString('title'), ['title'])
  assert.deepEqual(fromString('products.0.name'), ['products', 0, 'name'])
  assert.deepEqual(fromString('a.12.b.0'), ['a', 12, 'b', 0])
})

test('fromString — round-trips with toString for integer-keyed paths', () => {
  const original = ['products', 0, 'name']
  assert.deepEqual(fromString(toString(original)), original)
})

test('getRuleAtPath — walks object rules', () => {
  const rules = { title: 'h1', meta: { author: '.author', date: '.date' } }
  assert.equal(getRuleAtPath(rules, []), rules)
  assert.equal(getRuleAtPath(rules, ['title']), 'h1')
  assert.equal(getRuleAtPath(rules, ['meta', 'author']), '.author')
  assert.equal(getRuleAtPath(rules, ['meta', 'date']), '.date')
})

test('getRuleAtPath — walks object-array rules with numeric and * segments', () => {
  const rules = { products: ['.product', { name: '.name', price: '.price' }] }
  assert.deepEqual(getRuleAtPath(rules, ['products']), [
    '.product',
    { name: '.name', price: '.price' },
  ])
  // Numeric segment recurses into the shape — every item shares it.
  assert.deepEqual(getRuleAtPath(rules, ['products', 0]), {
    name: '.name',
    price: '.price',
  })
  assert.equal(getRuleAtPath(rules, ['products', 0, 'name']), '.name')
  // Wildcard segment is symmetrical with numeric for object-arrays.
  assert.equal(getRuleAtPath(rules, ['products', '*', 'price']), '.price')
})

test('getRuleAtPath — unknown segments return undefined, does not throw', () => {
  const rules = { title: 'h1' }
  assert.equal(getRuleAtPath(rules, ['missing']), undefined)
  assert.equal(getRuleAtPath(rules, ['title', 'extra']), undefined) // scalar leaf
  assert.equal(getRuleAtPath(rules, [0]), undefined) // numeric on object
})

test('getValueAtPath — walks data trees, tolerates missing intermediates', () => {
  const data = { products: [{ name: 'A' }, { name: 'B' }], title: 'T' }
  assert.equal(getValueAtPath(data, ['title']), 'T')
  assert.equal(getValueAtPath(data, ['products', 0, 'name']), 'A')
  assert.equal(getValueAtPath(data, ['products', 1, 'name']), 'B')
  assert.equal(getValueAtPath(data, ['products', 99, 'name']), undefined)
  assert.equal(getValueAtPath(data, ['missing', 'deep', 'path']), undefined)
})

test('setAtPath — empty path replaces root', () => {
  assert.equal(setAtPath({ a: 1 }, [], 'x'), 'x')
})

test('setAtPath — immutable: original tree is untouched, returned tree has value at path', () => {
  const original = { products: [{ name: 'A' }, { name: 'B' }] }
  const updated = setAtPath(original, ['products', 0, 'name'], 'Z')
  assert.equal(updated.products[0].name, 'Z')
  assert.equal(updated.products[1].name, 'B')
  // Original unchanged.
  assert.equal(original.products[0].name, 'A')
  // New top-level object, new array, new item object.
  assert.notEqual(updated, original)
  assert.notEqual(updated.products, original.products)
  assert.notEqual(updated.products[0], original.products[0])
  // Untouched sibling reused.
  assert.equal(updated.products[1], original.products[1])
})

test('setAtPath — string segment creates missing intermediate object', () => {
  const updated = setAtPath({}, ['author', 'name'], 'X')
  assert.deepEqual(updated, { author: { name: 'X' } })
})

test('setAtPath — numeric leading segment creates a sparse array on undefined', () => {
  const updated = setAtPath(undefined, [2], 'X')
  assert.ok(Array.isArray(updated))
  assert.equal(updated[2], 'X')
  assert.equal(updated.length, 3)
})
