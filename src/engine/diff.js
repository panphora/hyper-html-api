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
export function listDiff(adapter, parentCtx, selector, shape, newItems, trace, applyItem) {
  const oldNodes = adapter.find(parentCtx, selector)

  if (newItems.length === 0) {
    oldNodes.forEach((n) => adapter.remove(n))
    return
  }

  const needsTemplate = newItems.length > oldNodes.length
  if (needsTemplate && oldNodes.length === 0) throw new EmptyListInsert(trace.path)

  const oldValues = oldNodes.map((n) => extractItem(adapter, n, shape))

  let template = null
  if (oldNodes.length > 0) {
    template = adapter.clone(oldNodes[0])
    const stripped = adapter.stripIds(template)
    if (stripped > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[hyper-html-api] stripped ${stripped} id attribute(s) from cloned template at "${trace.path.join('.') || '(root)'}"`,
      )
    }
  }

  const matches = greedyMatch(newItems, oldValues, shape)

  const parent = adapter.parent(oldNodes[0])
  const anchorIdx = indexInParent(adapter, parent, oldNodes[0])

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

  oldNodes.forEach((n, i) => {
    if (!used.has(i)) adapter.remove(n)
  })

  used.forEach((i) => adapter.remove(oldNodes[i]))

  finalNodes.forEach((node, i) => {
    adapter.insertAt(parent, node, anchorIdx + i)
  })

  finalNodes.forEach((node, i) => {
    if (shape === null) {
      const v = newItems[i]
      adapter.text(node, v == null ? '' : String(v))
    } else {
      applyItem(adapter, node, shape, newItems[i], {
        depth: trace.depth + 1,
        path: [...trace.path, i],
      })
    }
  })
}

function extractItem(adapter, node, shape) {
  if (shape === null) return adapter.text(node)
  return extract(adapter, node, shape)
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
