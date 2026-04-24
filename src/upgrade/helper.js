/**
 * Helper-mode boot path. When the library loads in an iframe whose URL
 * includes `?_hyperHtmlApi=upgrade-helper&parentOrigin=...`, it skips its
 * normal idle state and instead participates in the postMessage protocol
 * defined in upgrade-plan.md:
 *
 *   1. Once the iframe document is ready, post `hha:upgrade-ready` to
 *      `parentOrigin` with the v2 rules + version + whether a transform
 *      was registered.
 *   2. Wait for the parent's `hha:upgrade-data` message carrying v1Data.
 *   3. Run the registered transform (if any), shape-match against v2's
 *      rules, then `engine.apply` to the iframe DOM.
 *   4. Serialize `documentElement.outerHTML` and post `hha:upgrade-result`
 *      back to the parent.
 *
 * Errors at any step bubble out as `hha:upgrade-error`.
 */

import { findRulesIn } from '../engine/rules-tag.js'
import { extract } from '../engine/extract.js'
import { apply } from '../engine/apply.js'
import domAdapter from '../adapters/dom.js'
import { getRegisteredTransform } from './registry.js'
import { shapeMatch } from './shape-match.js'

const HELPER_QUERY = '_hyperHtmlApi'
const HELPER_VALUE = 'upgrade-helper'
const PARENT_ORIGIN_QUERY = 'parentOrigin'

export function isHelperMode(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return false
  try {
    const params = new URLSearchParams(loc.search)
    return params.get(HELPER_QUERY) === HELPER_VALUE
  } catch {
    return false
  }
}

export function getParentOrigin(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return null
  const params = new URLSearchParams(loc.search)
  return params.get(PARENT_ORIGIN_QUERY)
}

export function bootHelper({ win, doc, parentOrigin } = {}) {
  win = win || (typeof window !== 'undefined' ? window : null)
  doc = doc || (typeof document !== 'undefined' ? document : null)
  if (!win || !doc) return
  parentOrigin = parentOrigin || getParentOrigin(win.location)
  if (!parentOrigin) return

  const start = () => runHandshake({ win, doc, parentOrigin })

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
}

function runHandshake({ win, doc, parentOrigin }) {
  let found
  try {
    found = findRulesIn(domAdapter, doc.body)
  } catch (e) {
    return postError(win, parentOrigin, e)
  }
  if (!found) {
    return postError(
      win,
      parentOrigin,
      new Error('helper-mode: no rules tag in v2 document'),
    )
  }
  const rules = found.rules
  const version = readMeta(doc, 'hyper-version')
  const hasTransform = !!getRegisteredTransform()

  const onMessage = (e) => {
    if (e.source !== win.parent) return
    if (e.origin !== parentOrigin) return
    const msg = e.data
    if (!msg || msg.type !== 'hha:upgrade-data') return
    win.removeEventListener('message', onMessage)
    try {
      const result = runUpgrade({ doc, rules, v1Data: msg.v1Data })
      win.parent.postMessage(
        { type: 'hha:upgrade-result', html: result.html, summary: result.summary },
        parentOrigin,
      )
    } catch (err) {
      postError(win, parentOrigin, err)
    }
  }
  win.addEventListener('message', onMessage)

  win.parent.postMessage(
    { type: 'hha:upgrade-ready', rules, version, hasTransform },
    parentOrigin,
  )
}

function runUpgrade({ doc, rules, v1Data }) {
  const transform = getRegisteredTransform()
  let transformed = v1Data
  let didTransform = false
  if (transform) {
    transformed = transform(v1Data)
    didTransform = true
  }
  const { data, summary } = shapeMatch(transformed, rules)
  apply(domAdapter, doc.body, rules, data)
  // Re-extract to confirm the apply landed; surface as part of summary.
  const applied = extract(domAdapter, doc.body, rules)
  const html =
    '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
  return {
    html,
    summary: { ...summary, transformApplied: didTransform, appliedFieldCount: countLeaves(applied) },
  }
}

function postError(win, parentOrigin, err) {
  win.parent.postMessage(
    { type: 'hha:upgrade-error', name: err?.name || 'Error', message: err?.message || String(err) },
    parentOrigin,
  )
}

function readMeta(doc, name) {
  const el = doc.querySelector(`meta[name="${name}"]`)
  return el ? el.getAttribute('content') : null
}

function countLeaves(v) {
  if (v == null) return 0
  if (Array.isArray(v)) return v.reduce((n, x) => n + countLeaves(x), 0)
  if (typeof v === 'object') {
    return Object.values(v).reduce((n, x) => n + countLeaves(x), 0)
  }
  return 1
}
