/**
 * Same-page simulation of the upgrade flow.
 *
 * The production runner uses a hidden iframe so v2's JS runs in its own
 * origin and a registered transform executes there. In the playground both
 * pages live in the same JS context, so the transform is simply a function
 * the user typed — the data-migration story is the same, without the
 * postMessage scaffolding.
 *
 * `shapeMatch` is re-exported from the library so the inline simulation
 * and the real iframe runner share the same join logic.
 */

export { shapeMatch } from '../src/upgrade/shape-match.js'

/**
 * Apply an optional transform function to v1Data, returning v2Data.
 * If transformSrc is empty, the identity function is used (pure name-match).
 * Throws if the transform fails to compile, or whatever the transform throws.
 */
export function applyTransform(v1Data, transformSrc) {
  if (!transformSrc || !transformSrc.trim()) return { data: v1Data, transformed: false }
  let fn
  try {
    fn = new Function('v1Data', transformSrc.includes('return') ? transformSrc : `return (${transformSrc})`)
  } catch (e) {
    const err = new Error(`transform failed to compile: ${e.message}`)
    err.cause = e
    throw err
  }
  const raw = fn(v1Data)
  const data = typeof raw === 'function' ? raw(v1Data) : raw
  return { data, transformed: true }
}

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
