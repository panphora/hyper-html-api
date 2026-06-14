import { extract } from '../engine/extract.js'
import domAdapter from '../adapters/dom.js'
import { collectRulesTags } from './rules-tags.js'
import { readMeta } from './check.js'

/**
 * Keyed extraction: one entry per rules tag under `root`, keyed by the
 * normalized data-rules-name value. This is the v1 side of an upgrade:
 * pack the page's data into labeled boxes.
 */
export function extractAllFrom(adapter, root) {
  const dataByName = {}
  for (const { name, rules } of collectRulesTags(adapter, root)) {
    dataByName[name] = extract(adapter, root, rules)
  }
  return dataByName
}

export function extractAll(root) {
  const r = root || document
  const doc = r.nodeType === 9 ? r : r.ownerDocument || r
  return {
    dataByName: extractAllFrom(domAdapter, r),
    version: readMeta(doc, 'hyper-version'),
  }
}
