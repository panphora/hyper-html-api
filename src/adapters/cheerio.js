function isRulesTag(node) {
  if (!node || !node.attr) return false
  const tag = node.prop ? node.prop('tagName') : ''
  if (String(tag || '').toUpperCase() !== 'SCRIPT') return false
  return node.attr('data-rules-name') !== undefined
}

function toWrappers(cheerioSet) {
  const out = []
  for (let i = 0; i < cheerioSet.length; i++) out.push(cheerioSet.eq(i))
  return out
}

const cheerioAdapter = {
  find(ctx, selector, opts = {}) {
    if (!ctx || !ctx.find) return []
    let matches = toWrappers(ctx.find(selector))
    if (!opts.includeRulesTag) matches = matches.filter((n) => !isRulesTag(n))
    const skipParts = []
    if (opts.skip) skipParts.push(opts.skip)
    if (opts.templateAttr) skipParts.push('[' + opts.templateAttr + ']')
    if (skipParts.length) {
      const combined = skipParts.join(', ')
      matches = matches.filter((n) => !n.closest || n.closest(combined).length === 0)
    }
    return matches
  },

  parent(node) {
    if (!node || !node.parent) return null
    const p = node.parent()
    return p && p.length ? p : null
  },

  children(node) {
    if (!node || !node.children) return []
    return toWrappers(node.children())
  },

  text(node, value) {
    if (value === undefined) return node.text().trim()
    node.text(value)
  },

  attr(node, name, value) {
    if (value === undefined) {
      const v = node.attr(name)
      return v !== undefined ? v : null
    }
    node.attr(name, value)
  },

  removeAttr(node, name) {
    if (node) node.removeAttr(name)
  },

  prop(node, name, value) {
    if (value === undefined) {
      // Cheerio's .prop() doesn't expose innerHTML/textContent/className as
      // proper properties. Route reads through the matching cheerio API so
      // they're symmetric with the writes below (and with the DOM adapter).
      if (name === 'innerHTML') return node.html()
      if (name === 'textContent' || name === 'innerText') return node.text()
      if (name === 'className') {
        const v = node.attr('class')
        return v !== undefined ? v : null
      }
      const v = node.prop(name)
      return v !== undefined ? v : null
    }
    // Cheerio's .prop() setter writes a literal attribute named `name`; it
    // does NOT mutate the underlying property (cheerio has no live DOM).
    // For names that have semantic write meaning, route through the right
    // cheerio API instead.
    const v = value == null ? '' : String(value)
    if (name === 'innerHTML') return node.html(v)
    if (name === 'textContent' || name === 'innerText') return node.text(v)
    if (name === 'className') return node.attr('class', v)
    node.prop(name, value)
  },

  replaceWith(node, html) {
    // Capture the parent + index before detaching, then reparse the html
    // and replace. Returns a fresh cheerio wrapper around the new node so
    // callers can keep operating on it.
    const parent = node.parent()
    if (!parent || !parent.length) {
      // Detached node — nothing meaningful we can do. Mirror DOM throwing.
      throw new Error('cheerio.replaceWith: node has no parent')
    }
    const idx = parent.children().index(node[0])
    node.replaceWith(html)
    return parent.children().eq(idx)
  },

  clone(node) {
    return node.clone()
  },

  insertAt(parent, node, index) {
    const siblings = parent.children()
    if (index >= siblings.length) parent.append(node)
    else siblings.eq(index).before(node)
  },

  remove(node) {
    if (node) node.remove()
  },

  stripIds(node) {
    let count = 0
    if (node.attr('id')) {
      node.removeAttr('id')
      count++
    }
    node.find('[id]').each(function () {
      if (this.attribs && this.attribs.id !== undefined) {
        delete this.attribs.id
        count++
      }
    })
    return count
  },

  sameNode(a, b) {
    if (!a || !b) return false
    const aEl = a[0]
    const bEl = b[0]
    return !!aEl && aEl === bEl
  },
}

export default cheerioAdapter
