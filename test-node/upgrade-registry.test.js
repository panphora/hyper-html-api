import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  registerUpgrade,
  getRegisteredTransform,
  _resetRegistryForTests,
} from '../src/upgrade/registry.js'
import { UpgradeAlreadyRegistered } from '../src/engine/errors.js'

test('registerUpgrade stores fn and getRegisteredTransform returns it', () => {
  _resetRegistryForTests()
  const fn = (v) => ({ ...v, upgraded: true })
  registerUpgrade(fn)
  assert.equal(getRegisteredTransform(), fn)
})

test('registerUpgrade rejects non-functions', () => {
  _resetRegistryForTests()
  assert.throws(() => registerUpgrade('not a fn'), TypeError)
  assert.throws(() => registerUpgrade(null), TypeError)
})

test('registerUpgrade throws UpgradeAlreadyRegistered on second call', () => {
  _resetRegistryForTests()
  registerUpgrade(() => {})
  assert.throws(() => registerUpgrade(() => {}), UpgradeAlreadyRegistered)
})
