import { extract } from './extract.js'
import { apply } from './apply.js'
import { findRulesIn } from './rules-tag.js'

export { extract } from './extract.js'
export { apply } from './apply.js'
export { findRulesIn } from './rules-tag.js'
export { parseStrict, parseRelaxed } from './rules.js'
export * as errors from './errors.js'
export { DOM_PROPERTIES, DOM_PROPERTIES_SET } from './dom-properties.js'

// source: object literal → use as-is (no tag); string → look up by token.
// For an element root, search the whole document (root.ownerDocument) so a
// head-mounted tag is found; get/set still scope to the passed root.
// For a Document root or the cheerio $.root(), ownerDocument is absent → no-op.
export function resolveRules(adapter, root, source) {
  if (source && typeof source === 'object') {
    return { rules: source, tagNode: null }
  }
  if (typeof source === 'string') {
    const searchRoot = (root && root.ownerDocument) ? root.ownerDocument : root
    return findRulesIn(adapter, searchRoot, source)
  }
  return null
}

export function bind(adapter, root, source, opts) {
  const found = resolveRules(adapter, root, source)
  if (!found) {
    const what = typeof source === 'string' ? `data-rules-name~="${source}"` : 'the provided rules object'
    throw new Error(`hyper-html-api: could not resolve rules for ${what}`)
  }
  const { rules, tagNode } = found
  return {
    rules,
    tagNode,                                                // informational only; null for a literal object
    get: () => extract(adapter, root, rules, opts),         // opts (skip/templateAttr) forwarded
    set: (data) => apply(adapter, root, rules, data, opts),
  }
}
