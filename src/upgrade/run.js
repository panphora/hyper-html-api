/**
 * Parent-side upgrade runner (the whole flow, no iframe):
 *
 *   1. Pack: extract keyed data from the live page.
 *   2. Download: fetch the source's pristine HTML, parse with DOMParser
 *      (scripts never execute, so no runtime DOM noise can leak into what
 *      gets saved).
 *   3. Recipe: find the source's text/hyper-upgrade tag, evaluate it, and
 *      reshape the data ({ [name]: data } in, same shape out).
 *   4. Unpack: exact-name join + apply into the parsed copy.
 *   5. Serialize and return. The caller decides how to save — hyperclayjs
 *      uses saveHtml(); standalone users do their own thing.
 */

import domAdapter from '../adapters/dom.js'
import { readMeta } from './check.js'
import { extractAllFrom } from './extract-all.js'
import { findTransformTag, evaluateTransform } from './transform.js'
import { migrateInto } from './migrate.js'
import { UpgradeSourceUnreachable, UpgradeSourceHasNoRules, UpgradeTransformInvalid } from './errors.js'

export async function run({ sourceUrl, dataByName, fromVersion, doc, loc, fetchFn } = {}) {
  doc = doc || (typeof document !== 'undefined' ? document : null)
  loc = loc || (typeof location !== 'undefined' ? location : null)
  fetchFn = fetchFn || ((url) => fetch(url))
  if (!doc) throw new Error('upgrade.run requires a document context')

  sourceUrl = sourceUrl || readMeta(doc, 'hyper-source')
  if (!sourceUrl) {
    throw new Error('upgrade.run: no sourceUrl given and no hyper-source meta tag found')
  }
  const source = new URL(sourceUrl, loc ? loc.href : undefined)
  fromVersion = fromVersion !== undefined ? fromVersion : readMeta(doc, 'hyper-version')
  dataByName = dataByName || extractAllFrom(domAdapter, doc)

  let res
  try {
    res = await fetchFn(source.href)
  } catch (err) {
    throw new UpgradeSourceUnreachable(source.href, err)
  }
  if (!res.ok) {
    throw new UpgradeSourceUnreachable(source.href, new Error(`HTTP ${res.status}`))
  }
  const text = await res.text()
  const sourceDoc = new DOMParser().parseFromString(text, 'text/html')
  const toVersion = readMeta(sourceDoc, 'hyper-version')

  let map = dataByName
  let transformApplied = false
  const code = findTransformTag(domAdapter, sourceDoc)
  if (code) {
    const transform = await evaluateTransform(code)
    const out = await transform(map, { fromVersion, toVersion })
    if (!out || typeof out !== 'object' || Array.isArray(out)) {
      throw new UpgradeTransformInvalid('transform must return a plain object map of { rulesName: data }')
    }
    map = out
    transformApplied = true
  }

  const { totals, byName, rulesTagCount } = migrateInto(domAdapter, sourceDoc, map)
  if (rulesTagCount === 0 && Object.keys(map).length > 0) {
    throw new UpgradeSourceHasNoRules(source.href)
  }

  return {
    html: serializeDocument(sourceDoc),
    fromVersion,
    toVersion,
    summary: { transformApplied, totals, byName },
  }
}

function serializeDocument(doc) {
  const name = doc.doctype && doc.doctype.name ? doc.doctype.name : 'html'
  return `<!DOCTYPE ${name}>\n` + doc.documentElement.outerHTML
}
