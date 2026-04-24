const RULES_TAG_ID = 'hyper-html-api'

function isRulesTag(node) {
  return node && node.nodeType === 1 && node.id === RULES_TAG_ID && node.tagName === 'SCRIPT'
}

function resolveSearchRoot(ctx) {
  if (!ctx) return null
  if (ctx.nodeType === 9) return ctx
  if (ctx.nodeType === 11) return ctx
  return ctx
}

const dom = {
  find(ctx, selector, opts = {}) {
    const root = resolveSearchRoot(ctx)
    if (!root || !root.querySelectorAll) return []
    const all = Array.from(root.querySelectorAll(selector))
    if (opts.includeRulesTag) return all
    return all.filter((n) => !isRulesTag(n))
  },

  parent(node) {
    return node ? node.parentElement : null
  },

  children(node) {
    return node ? Array.from(node.children) : []
  },

  text(node, value) {
    if (value === undefined) return (node.textContent || '').trim()
    node.textContent = value
  },

  attr(node, name, value) {
    if (value === undefined) {
      return node.hasAttribute && node.hasAttribute(name) ? node.getAttribute(name) : null
    }
    node.setAttribute(name, value)
  },

  prop(node, name, value) {
    if (value === undefined) {
      const v = node ? node[name] : undefined
      return v !== undefined ? v : null
    }
    node[name] = value
  },

  clone(node) {
    return node.cloneNode(true)
  },

  insertAt(parent, node, index) {
    const ref = parent.children[index] || null
    parent.insertBefore(node, ref)
  },

  remove(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node)
  },

  stripIds(node) {
    let count = 0
    if (node.id) {
      node.removeAttribute('id')
      count++
    }
    const inner = node.querySelectorAll ? node.querySelectorAll('[id]') : []
    inner.forEach((el) => {
      el.removeAttribute('id')
      count++
    })
    return count
  },

  sameNode(a, b) {
    return a === b
  },
}

export default dom
