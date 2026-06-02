import { EmptyListInsert } from './errors.js'
import { extract } from './extract.js'

const SIMILARITY_THRESHOLD = 0.5

/**
 * Reconcile `newItems` (array of incoming items) into the DOM subtree matched
 * by `parentCtx.find(selector)`. `shape` is null for scalar lists (items are
 * strings) or the rule shape for object lists.
 *
 * applyItem is passed in (normally `applyAt` from apply.js) to avoid a
 * circular import; object-list items use it to recursively apply their shape.
 */
export function listDiff(adapter, parentCtx, selector, shape, newItems, trace, applyItem, opts = {}) {
  const oldNodes = adapter.find(parentCtx, selector, opts)

  if (newItems.length === 0) {
    oldNodes.forEach((n) => adapter.remove(n))
    return
  }

  const needsTemplate = newItems.length > oldNodes.length
  let templateSource = oldNodes[0] || null
  if (needsTemplate && !templateSource) {
    templateSource = findFallbackTemplate(adapter, parentCtx, selector, opts)
    if (!templateSource) throw new EmptyListInsert(trace.path)
  }

  const oldValues = oldNodes.map((n) => extractItem(adapter, n, shape, opts))

  let template = null
  if (templateSource) {
    template = adapter.clone(templateSource)
    if (opts.templateAttr) adapter.removeAttr(template, opts.templateAttr)
    const stripped = adapter.stripIds(template)
    if (stripped > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[hyper-html-api] stripped ${stripped} id attribute(s) from cloned template at "${trace.path.join('.') || '(root)'}"`,
      )
    }
  }

  const matches = greedyMatch(newItems, oldValues, shape)

  const referenceNode = oldNodes[0] || templateSource
  const parent = adapter.parent(referenceNode)
  const anchorIdx = oldNodes.length > 0
    ? indexInParent(adapter, parent, referenceNode)
    : 0

  const used = new Set()
  const finalNodes = newItems.map((_, i) => {
    const oldIdx = matches[i]
    if (oldIdx >= 0) {
      used.add(oldIdx)
      return oldNodes[oldIdx]
    }
    const cloned = adapter.clone(template)
    adapter.stripIds(cloned)
    return cloned
  })

  // Remove only unmatched old nodes. Matched nodes stay attached so DOM
  // identity (focus, observers, animations) survives the reorder.
  oldNodes.forEach((n, i) => {
    if (!used.has(i)) adapter.remove(n)
  })

  // Place each final node at its target index. If the node is already
  // there, do nothing (no-op apply on unchanged data drops zero state).
  // Otherwise insertAt moves an attached node (DOM/cheerio both treat
  // insertBefore on an attached node as "move to here").
  finalNodes.forEach((node, i) => {
    const targetIdx = anchorIdx + i
    const siblings = adapter.children(parent)
    const currentIdx = siblings.findIndex((s) => adapter.sameNode(s, node))
    if (currentIdx === targetIdx) return
    adapter.insertAt(parent, node, targetIdx)
  })

  // Apply per-item content. Skip when the existing value already matches
  // — saves a write on no-op applies and avoids spurious mutation events.
  finalNodes.forEach((node, i) => {
    if (shape === null) {
      const v = newItems[i]
      const target = v == null ? '' : String(v)
      if (adapter.text(node) !== target) adapter.text(node, target)
    } else {
      // applyItem may replace the node (e.g. @outerHTML on the item itself);
      // capture the return so finalNodes stays current for later passes.
      const newNode = applyItem(adapter, node, shape, newItems[i], {
        depth: trace.depth + 1,
        path: [...trace.path, i],
      }, opts)
      if (newNode && newNode !== node) finalNodes[i] = newNode
    }
  })
}

function extractItem(adapter, node, shape, opts) {
  if (shape === null) return adapter.text(node)
  return extract(adapter, node, shape, opts)
}

function greedyMatch(newItems, oldValues, shape) {
  const matches = new Array(newItems.length).fill(-1)
  const taken = new Set()
  newItems.forEach((newItem, i) => {
    let bestIdx = -1
    let bestScore = -1
    oldValues.forEach((oldVal, j) => {
      if (taken.has(j)) return
      const score = similarity(newItem, oldVal, shape)
      const closerIdx =
        score === bestScore && bestIdx >= 0
          ? Math.abs(j - i) < Math.abs(bestIdx - i)
          : false
      if (score > bestScore || closerIdx) {
        bestScore = score
        bestIdx = j
      }
    })
    if (bestScore >= SIMILARITY_THRESHOLD) {
      matches[i] = bestIdx
      taken.add(bestIdx)
    }
  })
  return matches
}

function similarity(a, b, shape) {
  if (shape === null) return a === b ? 1 : 0
  const fields = Object.keys(shape || {})
  if (fields.length === 0) return 0
  let equal = 0
  for (const f of fields) {
    if (JSON.stringify(a == null ? undefined : a[f]) === JSON.stringify(b == null ? undefined : b[f])) {
      equal++
    }
  }
  return equal / fields.length
}

function indexInParent(adapter, parent, targetNode) {
  const siblings = adapter.children(parent)
  for (let i = 0; i < siblings.length; i++) {
    if (adapter.sameNode(siblings[i], targetNode)) return i
  }
  return -1
}

// Look for a template-marked node matching the selector. Walks up from
// parentCtx so a template defined once in an ancestor (e.g. on a sibling
// product's variant) is found even when the immediate container has none.
function findFallbackTemplate(adapter, parentCtx, selector, opts) {
  if (!opts.templateAttr) return null
  let scope = parentCtx
  while (scope) {
    // templateAttr:null opts out of the adapter's default cms-template skip — the
    // fallback lookup MUST see the seed element to clone it for grow-from-zero.
    const candidates = adapter.find(scope, selector, { includeRulesTag: false, templateAttr: null })
    for (const n of candidates) {
      if (adapter.attr(n, opts.templateAttr) != null) return n
    }
    scope = adapter.parent(scope)
  }
  return null
}
