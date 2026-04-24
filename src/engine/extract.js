import { DOM_PROPERTIES_SET } from './dom-properties.js'
import { MaxRuleDepthExceeded } from './errors.js'

const MAX_DEPTH = 20

export function extract(adapter, root, rules) {
  return extractAt(adapter, root, rules, { depth: 0, path: [] })
}

function extractAt(adapter, ctx, rule, trace) {
  if (trace.depth > MAX_DEPTH) throw new MaxRuleDepthExceeded(trace.path)

  if (typeof rule === 'string') return extractScalar(adapter, ctx, rule)

  if (Array.isArray(rule)) {
    const [selector, shape] = rule
    const matches = adapter.find(ctx, selector)
    return matches.map((node, i) =>
      extractAt(adapter, node, shape, {
        depth: trace.depth + 1,
        path: [...trace.path, i],
      }),
    )
  }

  if (typeof rule === 'object' && rule !== null) {
    const result = {}
    for (const [key, sub] of Object.entries(rule)) {
      result[key] = extractAt(adapter, ctx, sub, {
        depth: trace.depth + 1,
        path: [...trace.path, key],
      })
    }
    return result
  }

  return null
}

function extractScalar(adapter, ctx, rule) {
  if (rule.endsWith('[]')) {
    const selector = rule.slice(0, -2)
    return adapter.find(ctx, selector).map((n) => adapter.text(n))
  }

  if (rule.startsWith('@')) {
    return readPropOrAttr(adapter, ctx, rule.slice(1))
  }

  if (rule.includes('@')) {
    const [selector, name] = rule.split('@')
    const matches = selector ? adapter.find(ctx, selector) : [ctx]
    if (matches.length === 0) return null
    return readPropOrAttr(adapter, matches[0], name)
  }

  if (rule === '.') return adapter.text(ctx)

  const matches = adapter.find(ctx, rule)
  return matches.length === 0 ? null : adapter.text(matches[0])
}

function readPropOrAttr(adapter, node, name) {
  if (DOM_PROPERTIES_SET.has(name)) {
    const v = adapter.prop(node, name)
    return v == null ? null : String(v)
  }
  const v = adapter.attr(node, name)
  return v ? v : null
}
