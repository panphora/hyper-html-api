import { DOM_PROPERTIES_SET } from '../engine/dom-properties.js'
import { splitRule } from '../engine/rule-syntax.js'

/**
 * Produce an empty value matching a rule shape.
 *
 * Mirrors the shape with empty leaves so apply's list diff has something
 * to write into the cloned template when an author clicks "+ add" on a
 * list.
 *
 *   "title"               → ""
 *   "@data-id"            → null   (an attribute: absent, not present-and-empty)
 *   "li[]"                → []
 *   ["sel", { ... }]      → []
 *   { name: "h1", ... }   → { name: "" , ... }
 *
 * Anything else falls through to the scalar default ("").
 */
export function scaffold(shape) {
  if (typeof shape === 'string') {
    if (shape.endsWith('[]')) return []
    return isAttributeRule(shape) ? null : ''
  }
  if (Array.isArray(shape)) return []
  if (typeof shape === 'object' && shape !== null) {
    const out = {}
    for (const [k, v] of Object.entries(shape)) out[k] = scaffold(v)
    return out
  }
  return ''
}

// "" is the present-and-empty value for an attribute, so a scaffolded row that
// used it would arrive with every presence flag set (a new task done, a new
// card archived). An attribute field starts null — the writer removes the
// attribute — while text fields keep "". DOM properties have no presence to
// speak of and keep "" too.
function isAttributeRule(rule) {
  const { prop } = splitRule(rule)
  return prop !== null && !DOM_PROPERTIES_SET.has(prop)
}
