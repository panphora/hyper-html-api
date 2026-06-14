import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseVersion, isNewerVersion } from '../src/upgrade/check.js'

test('parseVersion: accepts plain and v-prefixed dotted numerics', () => {
  assert.deepEqual(parseVersion('1.2.0'), [1, 2, 0])
  assert.deepEqual(parseVersion('v2.1'), [2, 1])
  assert.deepEqual(parseVersion('3'), [3])
  assert.deepEqual(parseVersion(' 1.0 '), [1, 0])
})

test('parseVersion: rejects garbage', () => {
  assert.equal(parseVersion('1.2.0-beta'), null)
  assert.equal(parseVersion('one.two'), null)
  assert.equal(parseVersion(''), null)
  assert.equal(parseVersion(null), null)
  assert.equal(parseVersion('1..2'), null)
})

test('isNewerVersion: basic ordering', () => {
  assert.equal(isNewerVersion('1.2.0', '1.0.0'), true)
  assert.equal(isNewerVersion('1.0.0', '1.2.0'), false)
  assert.equal(isNewerVersion('1.2.0', '1.2.0'), false)
  assert.equal(isNewerVersion('2.0.0', '1.9.9'), true)
  assert.equal(isNewerVersion('1.10.0', '1.9.0'), true)
})

test('isNewerVersion: missing segments compare as zero', () => {
  assert.equal(isNewerVersion('1.2', '1.2.0'), false)
  assert.equal(isNewerVersion('1.2.1', '1.2'), true)
  assert.equal(isNewerVersion('2', '1.9'), true)
})

test('isNewerVersion: unparseable on either side is never newer', () => {
  assert.equal(isNewerVersion('abc', '1.0.0'), false)
  assert.equal(isNewerVersion('1.0.0', 'abc'), false)
})
