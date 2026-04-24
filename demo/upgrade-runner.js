/**
 * Same-page simulation of the upgrade flow.
 *
 * The production runner (see upgrade-plan.md) uses a hidden iframe so v2's
 * JS runs in its own origin and a registered transform executes there. In
 * the playground both pages live in the same JS context, so the transform
 * is simply a function the user typed — the data-migration story is the
 * same, without the postMessage scaffolding.
 */

/**
 * Walk v2Rules pulling matching values from v1Data.
 *   - Scalar leaves: carry the v1 value if it's defined, else leave undefined
 *     so the engine keeps v2's template default.
 *   - Object arrays: carry v1's items, trimmed to v1's count; each item is
 *     shape-matched recursively. If v2 adds a field that didn't exist in v1,
 *     it's left undefined (→ template default) on every item.
 *   - Objects: recurse per key.
 *
 * Returns { data, summary }. Summary counts scalar leaves carried vs dropped.
 */
export function shapeMatch(v1Data, v2Rules) {
  const summary = { carriedOver: 0, discarded: 0, listItems: 0 }
  const data = walk(v2Rules, v1Data, summary)
  collectDiscards(v2Rules, v1Data, summary)
  return { data, summary }
}

function walk(rule, v1, summary) {
  if (typeof rule === 'string') {
    if (rule.endsWith('[]')) {
      if (!Array.isArray(v1)) return undefined
      summary.listItems += v1.length
      summary.carriedOver += v1.length
      return v1
    }
    if (v1 === undefined || v1 === null) return undefined
    summary.carriedOver++
    return v1
  }
  if (Array.isArray(rule)) {
    const [, shape] = rule
    if (!Array.isArray(v1)) return undefined
    summary.listItems += v1.length
    return v1.map((item) => walk(shape, item, summary))
  }
  if (typeof rule === 'object' && rule !== null) {
    const out = {}
    for (const [k, sub] of Object.entries(rule)) {
      const v = walk(sub, v1 == null ? undefined : v1[k], summary)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  return undefined
}

function collectDiscards(rule, v1, summary) {
  if (v1 == null) return
  if (typeof rule === 'object' && rule !== null && !Array.isArray(rule)) {
    if (typeof v1 !== 'object' || Array.isArray(v1)) return
    const known = new Set(Object.keys(rule))
    for (const k of Object.keys(v1)) {
      if (!known.has(k)) {
        summary.discarded += countScalarLeaves(v1[k])
      } else {
        collectDiscards(rule[k], v1[k], summary)
      }
    }
    return
  }
  if (Array.isArray(rule) && Array.isArray(v1)) {
    const shape = rule[1]
    v1.forEach((item) => collectDiscards(shape, item, summary))
    return
  }
  // Scalar rule vs nested v1: only flag as discarded if the rule is truly
  // scalar. Array-shorthand rules (`.x[]`) expect an array on the v1 side —
  // those are carried, not discarded.
  if (
    typeof rule === 'string' &&
    !rule.endsWith('[]') &&
    typeof v1 === 'object' &&
    v1 !== null
  ) {
    summary.discarded += countScalarLeaves(v1)
  }
}

function countScalarLeaves(v) {
  if (v === null || v === undefined) return 0
  if (Array.isArray(v)) return v.reduce((n, x) => n + countScalarLeaves(x), 0)
  if (typeof v === 'object') {
    return Object.values(v).reduce((n, x) => n + countScalarLeaves(x), 0)
  }
  return 1
}

/**
 * Apply an optional transform function to v1Data, returning v2Data.
 * If transformSrc is empty, the identity function is used (pure name-match).
 * Throws a RegistrationError if the transform fails to compile; throws
 * whatever the transform throws at runtime.
 */
export function applyTransform(v1Data, transformSrc) {
  if (!transformSrc || !transformSrc.trim()) return { data: v1Data, transformed: false }
  let fn
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('v1Data', transformSrc.includes('return') ? transformSrc : `return (${transformSrc})`)
  } catch (e) {
    const err = new Error(`transform failed to compile: ${e.message}`)
    err.cause = e
    throw err
  }
  // `fn` can return either a value, or when the source is `data => ...` the
  // outer `new Function` call wraps that arrow and we invoke it.
  const raw = fn(v1Data)
  const data = typeof raw === 'function' ? raw(v1Data) : raw
  return { data, transformed: true }
}

/**
 * Summary → short human-readable string.
 */
export function formatSummary(summary, transformed) {
  const parts = []
  parts.push(`${summary.carriedOver} field${summary.carriedOver === 1 ? '' : 's'} carried over`)
  if (summary.discarded > 0) {
    parts.push(`${summary.discarded} dropped`)
  }
  if (summary.listItems > 0) {
    parts.push(`${summary.listItems} list item${summary.listItems === 1 ? '' : 's'} preserved`)
  }
  if (transformed) parts.push('custom transform applied')
  return parts.join(' · ')
}
