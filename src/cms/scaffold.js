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
 * `rowSelector` is the list rule's own selector ("ul > li[data-id]"), so an
 * attribute the row cannot be a row without arrives present-and-empty instead.
 *
 * Anything else falls through to the scalar default ("").
 */
export function scaffold(shape, rowSelector) {
  if (typeof shape === 'string') {
    if (shape.endsWith('[]')) return []
    if (!isAttributeRule(shape)) return ''
    return rowRequiresAttribute(rowSelector, splitRule(shape).prop) ? '' : null
  }
  if (Array.isArray(shape)) return []
  if (typeof shape === 'object' && shape !== null) {
    const out = {}
    for (const [k, v] of Object.entries(shape)) out[k] = scaffold(v, rowSelector)
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

// An attribute the row selector itself requires is structural: apply removes a
// null attribute, and a row without "data-id" falls straight out of the data on
// the next read. Only the selector's final compound speaks for the row; an
// attribute named earlier belongs to an ancestor.
function rowRequiresAttribute(rowSelector, prop) {
  if (!rowSelector || !prop) return false
  const compound = lastCompound(rowSelector)
  const wanted = prop.toLowerCase()
  for (let i = 0; i < compound.length; i++) {
    if (compound[i] === '\\') {
      i++
    } else if (compound[i] === '[') {
      const end = compound.indexOf(']', i)
      if (end === -1) return false
      const name = /^\s*([^\s\]=~^|*$]+)/.exec(compound.slice(i + 1, end))
      if (name && name[1].toLowerCase() === wanted) return true
      i = end
    }
  }
  return false
}

// Everything after the last top-level combinator, which is the compound that
// describes the row itself.
function lastCompound(selector) {
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '\\') {
      i++
    } else if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '[' || ch === '(') {
      depth++
    } else if (ch === ']' || ch === ')') {
      if (depth > 0) depth--
    } else if (depth === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) {
      start = i + 1
    }
  }
  return selector.slice(start)
}
