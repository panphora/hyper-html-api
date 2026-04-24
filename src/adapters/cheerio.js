const RULES_TAG_ID = 'hyper-html-api'

function isRulesTag(node) {
  if (!node || !node.attr) return false
  if (node.attr('id') !== RULES_TAG_ID) return false
  const tag = node.prop ? node.prop('tagName') : ''
  return String(tag || '').toUpperCase() === 'SCRIPT'
}

function toWrappers(cheerioSet) {
  const out = []
  for (let i = 0; i < cheerioSet.length; i++) out.push(cheerioSet.eq(i))
  return out
}

const cheerioAdapter = {
  find(ctx, selector, opts = {}) {
    if (!ctx || !ctx.find) return []
    const matches = toWrappers(ctx.find(selector))
    if (opts.includeRulesTag) return matches
    return matches.filter((n) => !isRulesTag(n))
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

  prop(node, name, value) {
    if (value === undefined) {
      const v = node.prop(name)
      return v !== undefined ? v : null
    }
    node.prop(name, value)
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
}

export default cheerioAdapter
