function raw(node) {
  return node && node[0] ? node[0] : node
}

// Records which nodes a write touched. Structural changes mark the parent,
// since the parent's children are what changed. Clones are recorded so their
// copied source locations are never trusted.
export function trackAdapter(adapter) {
  const dirty = new Set()
  const cloned = new WeakSet()
  const mark = (node) => {
    const r = raw(node)
    if (r) dirty.add(r)
  }
  const markTree = (r) => {
    if (!r) return
    cloned.add(r)
    for (const c of r.children || []) markTree(c)
  }
  return {
    ...adapter,
    text(node, value) {
      if (value === undefined) return adapter.text(node)
      mark(node)
      return adapter.text(node, value)
    },
    attr(node, name, value) {
      if (value === undefined) return adapter.attr(node, name)
      mark(node)
      return adapter.attr(node, name, value)
    },
    removeAttr(node, name) {
      mark(node)
      return adapter.removeAttr(node, name)
    },
    prop(node, name, value) {
      if (value === undefined) return adapter.prop(node, name)
      mark(node)
      return adapter.prop(node, name, value)
    },
    replaceWith(node, html) {
      const p = adapter.parent(node)
      if (p) mark(p)
      return adapter.replaceWith(node, html)
    },
    clone(node) {
      const c = adapter.clone(node)
      markTree(raw(c))
      return c
    },
    insertAt(parent, node, index) {
      mark(parent)
      const from = adapter.parent(node)
      if (from) mark(from)
      return adapter.insertAt(parent, node, index)
    },
    remove(node) {
      const p = adapter.parent(node)
      if (p) mark(p)
      return adapter.remove(node)
    },
    dirty,
    cloned,
  }
}

function attached(r, docRoot) {
  let n = r
  while (n && n.parent) n = n.parent
  return n === docRoot
}

function located(r, cloned) {
  let n = r
  while (n && n.type !== 'root') {
    const loc = n.sourceCodeLocation
    if (!cloned.has(n) && loc && loc.startOffset != null && loc.endOffset != null) return n
    n = n.parent
  }
  return null
}

function hasAncestorIn(r, set) {
  let n = r.parent
  while (n) {
    if (set.has(n)) return true
    n = n.parent
  }
  return false
}

// Replaces the source span of each topmost changed element with its fresh
// serialization, then proves the result by reparsing: the spliced text must
// render exactly like the mutated tree. Anything unprovable falls back to the
// whole-document render.
export function spliceDocument(load, src, $, tracker) {
  const full = $.html()
  const fallback = { html: full, spliced: false }
  const docRoot = raw($.root())
  const targets = new Set()
  for (const r of tracker.dirty) {
    if (!attached(r, docRoot)) continue
    const at = located(r, tracker.cloned)
    if (!at) return fallback
    targets.add(at)
  }
  const top = [...targets].filter((r) => !hasAncestorIn(r, targets))
  top.sort((a, b) => b.sourceCodeLocation.startOffset - a.sourceCodeLocation.startOffset)
  let out = src
  let prevStart = Infinity
  for (const r of top) {
    const { startOffset, endOffset } = r.sourceCodeLocation
    if (endOffset > prevStart) return fallback
    out = out.slice(0, startOffset) + $.html(r) + out.slice(endOffset)
    prevStart = startOffset
  }
  return load(out).html() === full ? { html: out, spliced: true } : fallback
}
