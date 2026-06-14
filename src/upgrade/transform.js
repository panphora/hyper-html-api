import { UpgradeMultipleTransforms, UpgradeTransformInvalid } from './errors.js'

export const TRANSFORM_TYPE = 'text/hyper-upgrade'

/**
 * The migration recipe is a non-executing script tag in the source HTML:
 *
 *   <script type="text/hyper-upgrade">
 *   export default (dataByName, { fromVersion, toVersion }) => dataByName
 *   </script>
 *
 * Browsers ignore unknown script types, so it never runs on the source page
 * itself; the upgrading fork reads it out of the fetched pristine copy and
 * evaluates it on demand. Returns the tag's code, or null when absent.
 */
export function findTransformTag(adapter, root) {
  const tags = adapter.find(root, `script[type="${TRANSFORM_TYPE}"]`)
  if (tags.length === 0) return null
  if (tags.length > 1) throw new UpgradeMultipleTransforms(tags.length)
  const code = adapter.text(tags[0])
  return code || null
}

// Bundlers rewrite a bare dynamic import() when emitting non-ESM formats; the
// Function indirection keeps it a native browser import() at runtime.
const dynamicImport = new Function('url', 'return import(url)')

/**
 * Evaluate transform code as a real ES module (Blob URL import). The module
 * must `export default` a function; it may be async. Relative imports won't
 * resolve from a Blob URL; absolute (CDN) imports work.
 */
export async function evaluateTransform(code) {
  const blob = new Blob([code], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  let mod
  try {
    mod = await dynamicImport(url)
  } catch (err) {
    throw new UpgradeTransformInvalid(
      `transform failed to load: ${err && err.message ? err.message : err}`,
      err,
    )
  } finally {
    URL.revokeObjectURL(url)
  }
  if (typeof mod.default !== 'function') {
    throw new UpgradeTransformInvalid('transform must `export default` a function')
  }
  return mod.default
}
