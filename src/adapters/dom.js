function isRulesTag(node) {
  return node && node.nodeType === 1 && node.tagName === 'SCRIPT'
    && node.hasAttribute && node.hasAttribute('data-rules-name')
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
    let all = Array.from(root.querySelectorAll(selector))
    if (!opts.includeRulesTag) all = all.filter((n) => !isRulesTag(n))
    const skipParts = []
    if (opts.skip) skipParts.push(opts.skip)
    if (opts.templateAttr) skipParts.push('[' + opts.templateAttr + ']')
    if (skipParts.length) {
      const combined = skipParts.join(', ')
      all = all.filter((n) => !n.closest || !n.closest(combined))
    }
    return all
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

  removeAttr(node, name) {
    if (node && node.removeAttribute) node.removeAttribute(name)
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

  replaceWith(node, html) {
    if (!node || !node.parentNode) {
      throw new Error('dom.replaceWith: node has no parent')
    }
    const doc = node.ownerDocument
    const template = doc.createElement('template')
    template.innerHTML = html
    const newNode = template.content.firstElementChild
    if (!newNode) {
      throw new Error('dom.replaceWith: html did not parse to an element')
    }
    node.parentNode.replaceChild(newNode, node)
    return newNode
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
