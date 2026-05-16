/**
 * Produce an empty value matching a rule shape.
 *
 * Mirrors the shape with empty leaves so apply's list diff has something
 * to write into the cloned template when an author clicks "+ add" on a
 * list.
 *
 *   "title"               → ""
 *   "li[]"                → []
 *   ["sel", { ... }]      → []
 *   { name: "h1", ... }   → { name: "" , ... }
 *
 * Anything else falls through to the scalar default ("").
 */
export function scaffold(shape) {
  if (typeof shape === 'string') return shape.endsWith('[]') ? [] : ''
  if (Array.isArray(shape)) return []
  if (typeof shape === 'object' && shape !== null) {
    const out = {}
    for (const [k, v] of Object.entries(shape)) out[k] = scaffold(v)
    return out
  }
  return ''
}
