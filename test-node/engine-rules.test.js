import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseStrict, parseRelaxed } from '../src/engine/rules.js'
import { RulesParseError } from '../src/engine/errors.js'

test('parseStrict', async (t) => {
  await t.test('parses valid JSON', () => {
    assert.deepEqual(parseStrict('{"a":".x"}'), { a: '.x' })
  })

  await t.test('throws RulesParseError on unquoted keys (relaxed input)', () => {
    assert.throws(() => parseStrict('{a:".x"}'), (err) => {
      assert.ok(err instanceof RulesParseError)
      assert.match(err.message, /strict JSON/)
      assert.match(err.message, /\?data=/)
      assert.ok(err.cause instanceof Error)
      return true
    })
  })

  await t.test('throws RulesParseError on truly invalid JSON', () => {
    assert.throws(() => parseStrict('{"'), (err) => {
      assert.ok(err instanceof RulesParseError)
      assert.ok(err.cause)
      return true
    })
  })
})

test('parseRelaxed', async (t) => {
  await t.test('accepts already-valid JSON', () => {
    assert.deepEqual(parseRelaxed('{"a":".x"}'), { a: '.x' })
  })

  await t.test('accepts unquoted keys', () => {
    assert.deepEqual(parseRelaxed('{a: .x}'), { a: '.x' })
  })

  await t.test('accepts single-quoted strings', () => {
    assert.deepEqual(parseRelaxed("{a: '.x'}"), { a: '.x' })
  })

  await t.test('handles attribute selectors with brackets', () => {
    assert.deepEqual(parseRelaxed('{a: a[href]}'), { a: 'a[href]' })
  })

  await t.test('handles array tuples [selector, shape]', () => {
    assert.deepEqual(parseRelaxed('{items: [.item, {name: .name}]}'), {
      items: ['.item', { name: '.name' }],
    })
  })

  await t.test('handles array shorthand .x[]', () => {
    assert.deepEqual(parseRelaxed('{tags: .tag[]}'), { tags: '.tag[]' })
  })

  await t.test('handles @attr rules', () => {
    assert.deepEqual(parseRelaxed('{id: @data-id}'), { id: '@data-id' })
  })

  await t.test('handles pseudo-selectors', () => {
    assert.deepEqual(parseRelaxed('{first: .x:first-child}'), {
      first: '.x:first-child',
    })
  })

  await t.test('throws RulesParseError on malformed input', () => {
    assert.throws(() => parseRelaxed('{a:}'), (err) => {
      assert.ok(err instanceof RulesParseError)
      return true
    })
  })
})
