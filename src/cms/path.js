/**
 * Canonical path representation for the CMS layer.
 *
 * One source of truth used by form-builder traversal, sidecar config keys
 * (phase 2), data-hha-path attributes, and the apply-loop's snapshot scope
 * (phase 4). Three serialized forms:
 *
 *   internal     Array<string|number>     ["products", 0, "name"]
 *   stringified  dot-separated literal    "products.0.name"
 *   wildcard     numbers replaced with *  "products.*.name"
 *
 * Numbers represent array indices; strings represent object keys. The
 * stringified form is what we write to data-hha-path; the wildcard form is
 * what sidecar config keys use.
 */

export function toString(path) {
  return path.map(String).join('.')
}

export function toConfigKey(path) {
  return path.map((seg) => (typeof seg === 'number' ? '*' : String(seg))).join('.')
}

export function parseConfigKey(str) {
  if (str === '') return []
  return str.split('.')
}

/**
 * Inverse of `toString`: parses the dot-separated stringified form back to
 * the internal array, converting digit-only segments to numbers. Used by
 * the form's delegated event handler to recover the path from
 * `data-hha-path` attributes.
 */
export function fromString(str) {
  if (str === '') return []
  return str.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg))
}

/**
 * Walks a (possibly merged) rule tree along the given path.
 *
 * Rule grammar (see cms-plan.md § Form rendering):
 *   string                 scalar or scalar-array ("...[]") rule — leaf
 *   [selector, shape]      object-array rule; numeric and "*" segments
 *                          recurse into shape (every item shares it)
 *   { key: rule, ... }     object rule; string segment indexes
 *
 * Returns the rule at the path, or undefined if the path doesn't address
 * a node.
 */
export function getRuleAtPath(rules, path) {
  let node = rules
  for (const seg of path) {
    if (node == null) return undefined
    if (typeof node === 'string') return undefined
    if (Array.isArray(node)) {
      if (typeof seg !== 'number' && seg !== '*') return undefined
      node = node[1]
      continue
    }
    if (typeof node === 'object') {
      if (typeof seg === 'number') return undefined
      if (!(seg in node)) return undefined
      node = node[seg]
      continue
    }
    return undefined
  }
  return node
}

/**
 * Walks a data tree, tolerating missing intermediate nodes.
 */
export function getValueAtPath(data, path) {
  let node = data
  for (const seg of path) {
    if (node == null) return undefined
    node = node[seg]
  }
  return node
}

/**
 * Immutable splice: returns a new tree with `value` placed at `path`.
 * Numeric leading segments copy-on-write the surrounding array; string
 * segments copy-on-write the surrounding object. Missing intermediate
 * nodes are created (object literal for string segments, sparse array for
 * numeric segments) to match the existing prototype semantics.
 */
export function setAtPath(obj, path, value) {
  if (path.length === 0) return value
  const [k, ...rest] = path
  if (typeof k === 'number') {
    const next = Array.isArray(obj) ? [...obj] : []
    next[k] = setAtPath(next[k], rest, value)
    return next
  }
  return {
    ...(obj && typeof obj === 'object' ? obj : {}),
    [k]: setAtPath((obj || {})[k], rest, value),
  }
}
