import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isHelperMode, getParentOrigin } from '../src/upgrade/helper.js'

function fakeLoc(search) {
  return { search }
}

test('isHelperMode: true when query carries the helper signal', () => {
  assert.equal(
    isHelperMode(fakeLoc('?_hyperHtmlApi=upgrade-helper&parentOrigin=https://x')),
    true,
  )
})

test('isHelperMode: false on bare URL', () => {
  assert.equal(isHelperMode(fakeLoc('')), false)
})

test('isHelperMode: false on unrelated query params', () => {
  assert.equal(isHelperMode(fakeLoc('?foo=bar&_hyperHtmlApi=other')), false)
})

test('getParentOrigin: returns the parentOrigin param verbatim', () => {
  assert.equal(
    getParentOrigin(fakeLoc('?_hyperHtmlApi=upgrade-helper&parentOrigin=https://demo.test')),
    'https://demo.test',
  )
})

test('getParentOrigin: null when missing', () => {
  assert.equal(getParentOrigin(fakeLoc('?_hyperHtmlApi=upgrade-helper')), null)
})
