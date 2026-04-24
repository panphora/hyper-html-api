import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'

import { findRulesIn } from '../src/engine/index.js'
import { RulesParseError, UnknownRulesVersion } from '../src/engine/errors.js'
import cheerioAdapter from '../src/adapters/cheerio.js'

function load(html) {
  return cheerio.load(html)
}

test('findRulesIn', async (t) => {
  await t.test('returns null when no rules tag is present', () => {
    const $ = load('<div>hello</div>')
    assert.equal(findRulesIn(cheerioAdapter, $.root()), null)
  })

  await t.test('parses rules when tag is present with version 1', () => {
    const $ = load(
      '<script type="application/hyper-html-api" id="hyper-html-api" data-rules-version="1">{"title":"h1"}</script>',
    )
    const result = findRulesIn(cheerioAdapter, $.root())
    assert.ok(result)
    assert.deepEqual(result.rules, { title: 'h1' })
    assert.ok(result.tagNode)
  })

  await t.test('throws UnknownRulesVersion when data-rules-version is missing', () => {
    const $ = load(
      '<script type="application/hyper-html-api" id="hyper-html-api">{"title":"h1"}</script>',
    )
    assert.throws(() => findRulesIn(cheerioAdapter, $.root()), (err) => {
      assert.ok(err instanceof UnknownRulesVersion)
      return true
    })
  })

  await t.test('throws UnknownRulesVersion when data-rules-version is not "1"', () => {
    const $ = load(
      '<script type="application/hyper-html-api" id="hyper-html-api" data-rules-version="2">{"title":"h1"}</script>',
    )
    assert.throws(() => findRulesIn(cheerioAdapter, $.root()), (err) => {
      assert.ok(err instanceof UnknownRulesVersion)
      assert.equal(err.version, '2')
      return true
    })
  })

  await t.test('throws RulesParseError when body is malformed', () => {
    const $ = load(
      '<script type="application/hyper-html-api" id="hyper-html-api" data-rules-version="1">{title:h1}</script>',
    )
    assert.throws(() => findRulesIn(cheerioAdapter, $.root()), (err) => {
      assert.ok(err instanceof RulesParseError)
      return true
    })
  })
})
