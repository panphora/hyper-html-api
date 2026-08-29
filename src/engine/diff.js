import { EmptyListInsert } from './errors.js'
import { extract } from './extract.js'
import { matchRows } from './row-match.js'

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
    // Still once per list: a consumer keyed by path has to learn it settled empty.
    callHook(opts, 'onRowsApplied', trace.path, [])
    return
  }

  const needsTemplate = newItems.length > oldNodes.length
  let templateSource = oldNodes[0] || null
  if (needsTemplate && !templateSource) {
    templateSource = findFallbackTemplate(adapter, parentCtx, selector, opts)
    if (!templateSource) throw new EmptyListInsert(trace.path)
  }

  const oldValues = oldNodes.map((n) => extractItem(adapter, n, shape, opts))

  // Only a list that grew can need a clone, because matchRows pairs every row
  // it can. Cloning unconditionally made a plain edit strip the ids off a
  // template it never used, and warn about it, on every keystroke.
  let template = null
  if (needsTemplate && templateSource) {
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

  const matches = matchRows(newItems, oldValues, shape, lockSuppliedRows(adapter, oldNodes, newItems, trace, opts))

  const referenceNode = oldNodes[0] || templateSource
  const parent = adapter.parent(referenceNode)
  const anchorIdx = oldNodes.length > 0
    ? indexInParent(adapter, parent, referenceNode)
    : 0
  const contiguous = isContiguousRun(adapter, oldNodes)

  const used = new Set()
  const fresh = []
  const finalNodes = newItems.map((_, i) => {
    const oldIdx = matches[i]
    if (oldIdx >= 0) {
      used.add(oldIdx)
      fresh.push(false)
      return oldNodes[oldIdx]
    }
    fresh.push(true)
    const cloned = adapter.clone(template)
    adapter.stripIds(cloned)
    return cloned
  })

  // Remove only unmatched old nodes. Matched nodes stay attached so DOM
  // identity (focus, observers, animations) survives the reorder.
  oldNodes.forEach((n, i) => {
    if (!used.has(i)) adapter.remove(n)
  })

  if (contiguous) {
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
  } else {
    // The matched nodes are not a contiguous run of siblings, so this list has
    // no DOM order to restore: any repositioning would move elements the list
    // does not own. Anchoring every node to parent(oldNodes[0]) is what
    // reparents a cross-parent list into its first container and compacts past
    // unowned siblings, and both destroy content on a write that changed
    // nothing. Leave every surviving node exactly where the author put it and
    // only place the grown ones.
    placeGrownItems(adapter, finalNodes, fresh, parent, anchorIdx)
  }

  writeItems(adapter, finalNodes, shape, newItems, trace, applyItem, opts)

  // writeItems can replace a node (@outerHTML on the item itself) and updates
  // finalNodes in place, so this reports the nodes the list actually ended with.
  callHook(opts, 'onRowsApplied', trace.path, finalNodes)
}

// Consumer code runs in the middle of an engine write, and onRowsApplied runs
// after the list is already written. Letting it throw left the page written and
// the apply reported as failed, which in hypercms meant an error banner, a stale
// fingerprint, and a page that no longer matched it. A hook is an optional
// report; a broken one is the consumer's bug to see, not a reason to abandon a
// finished write.
function callHook(opts, name, path, arg) {
  if (typeof opts[name] !== 'function') return undefined
  try {
    return opts[name](path.slice(), arg)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[hyper-html-api] ${name} threw at "${path.join('.') || '(root)'}"`, err)
    return undefined
  }
}

// A caller that already knows which node each incoming item belongs to can say
// so, and content matching cannot tell two byte-identical rows apart however
// good it gets. `identifyRows` returns an array parallel to newItems of
// Node | null. A node that is not in this list right now is ignored, so a stale
// handle degrades to matching rather than corrupting the list.
function lockSuppliedRows(adapter, oldNodes, newItems, trace, opts) {
  const supplied = callHook(opts, 'identifyRows', trace.path, newItems)
  if (!Array.isArray(supplied)) return null
  const locked = new Array(newItems.length).fill(-1)
  const taken = new Set()
  for (let i = 0; i < newItems.length; i++) {
    if (!supplied[i]) continue
    for (let j = 0; j < oldNodes.length; j++) {
      if (taken.has(j) || !adapter.sameNode(oldNodes[j], supplied[i])) continue
      locked[i] = j
      taken.add(j)
      break
    }
  }
  return locked
}

// Apply per-item content. Skip when the existing value already matches
// — saves a write on no-op applies and avoids spurious mutation events.
function writeItems(adapter, finalNodes, shape, newItems, trace, applyItem, opts) {
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
  // This is a per-row read whose path restarts at the row, so a caller's
  // onRowsRead would see a nested list under a truncated path and bind it to the
  // wrong parent. The read hook belongs to a top-level extract only, and
  // engine.bind() hands one opts object to both halves, so the caller cannot
  // always keep them apart. Drop it here instead of documenting a rule the API
  // does not let everyone follow.
  return extract(adapter, node, shape, opts.onRowsRead ? { ...opts, onRowsRead: undefined } : opts)
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

// Repositioning only means something when the list occupies a contiguous run of
// element siblings under one parent. Two containers, or an unowned sibling
// sitting between two owned nodes, has no list order to restore.
function isContiguousRun(adapter, nodes) {
  if (nodes.length <= 1) return true
  const parent = adapter.parent(nodes[0])
  if (!parent) return false
  const siblings = adapter.children(parent)
  const indices = []
  for (const node of nodes) {
    const i = siblings.findIndex((s) => adapter.sameNode(s, node))
    if (i === -1) return false
    indices.push(i)
  }
  indices.sort((a, b) => a - b)
  return indices[indices.length - 1] - indices[0] === indices.length - 1
}

// Grown items follow the surviving node before them, so a new row lands next to
// its neighbour rather than being teleported into the first container. With no
// surviving node before it, fall back to where the list started.
function placeGrownItems(adapter, finalNodes, fresh, fallbackParent, fallbackIdx) {
  let anchor = null
  let nextFallbackIdx = fallbackIdx
  for (let i = 0; i < finalNodes.length; i++) {
    if (!fresh[i]) {
      anchor = finalNodes[i]
      continue
    }
    const parent = anchor ? adapter.parent(anchor) : fallbackParent
    if (!parent) continue
    const at = anchor ? indexInParent(adapter, parent, anchor) + 1 : nextFallbackIdx++
    adapter.insertAt(parent, finalNodes[i], at)
    anchor = finalNodes[i]
  }
}
