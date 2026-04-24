import { DOM_PROPERTIES_SET } from './dom-properties.js'
import { MaxRuleDepthExceeded, ShapeMismatch } from './errors.js'
import { listDiff } from './diff.js'

const MAX_DEPTH = 20

const BOOLEAN_PROPS = new Set(['checked', 'selected', 'disabled', 'readOnly', 'paused'])

export function apply(adapter, root, rules, data) {
  const mismatches = []
  validateShape(rules, data, [], mismatches)
  if (mismatches.length) throw new ShapeMismatch(mismatches)

  applyAt(adapter, root, rules, data, { depth: 0, path: [] })
}

export function applyAt(adapter, ctx, rule, value, trace) {
  if (trace.depth > MAX_DEPTH) throw new MaxRuleDepthExceeded(trace.path)
  if (value === undefined) return

  if (typeof rule === 'string') return applyScalar(adapter, ctx, rule, value, trace)

  if (Array.isArray(rule)) {
    const [selector, shape] = rule
    return listDiff(adapter, ctx, selector, shape, value, trace, applyAt)
  }

  if (typeof rule === 'object' && rule !== null) {
    for (const [key, sub] of Object.entries(rule)) {
      applyAt(
        adapter,
        ctx,
        sub,
        value == null ? value : value[key],
        { depth: trace.depth + 1, path: [...trace.path, key] },
      )
    }
  }
}

function applyScalar(adapter, ctx, rule, value, trace) {
  if (rule.endsWith('[]')) {
    const selector = rule.slice(0, -2)
    return listDiff(adapter, ctx, selector, null, value, trace, applyAt)
  }

  if (rule.startsWith('@')) {
    return writePropOrAttr(adapter, ctx, rule.slice(1), value)
  }

  if (rule.includes('@')) {
    const [selector, name] = rule.split('@')
    const matches = selector ? adapter.find(ctx, selector) : [ctx]
    if (matches.length === 0) return
    return writePropOrAttr(adapter, matches[0], name, value)
  }

  if (rule === '.') {
    adapter.text(ctx, value == null ? '' : String(value))
    return
  }

  const matches = adapter.find(ctx, rule)
  if (matches.length === 0) return
  adapter.text(matches[0], value == null ? '' : String(value))
}

function writePropOrAttr(adapter, node, name, value) {
  if (DOM_PROPERTIES_SET.has(name)) {
    adapter.prop(node, name, coercePropValue(name, value))
  } else {
    adapter.attr(node, name, value == null ? '' : String(value))
  }
}

function coercePropValue(name, value) {
  if (value === null || value === undefined) {
    return BOOLEAN_PROPS.has(name) ? false : ''
  }
  if (BOOLEAN_PROPS.has(name)) return Boolean(value)
  return value
}

function validateShape(rule, value, path, mismatches) {
  if (value === undefined || value === null || value === '') return

  if (typeof rule === 'string') {
    if (rule.endsWith('[]')) {
      if (!Array.isArray(value)) {
        mismatches.push({ path: pathStr(path), expected: 'array', got: typeofX(value) })
      } else {
        value.forEach((v, i) => {
          if (typeof v === 'object' && v !== null) {
            mismatches.push({
              path: pathStr([...path, i]),
              expected: 'scalar',
              got: typeofX(v),
            })
          }
        })
      }
      return
    }
    if (typeof value === 'object') {
      mismatches.push({ path: pathStr(path), expected: 'scalar', got: typeofX(value) })
    }
    return
  }

  if (Array.isArray(rule)) {
    if (!Array.isArray(value)) {
      mismatches.push({ path: pathStr(path), expected: 'array', got: typeofX(value) })
      return
    }
    const shape = rule[1]
    value.forEach((item, i) => validateShape(shape, item, [...path, i], mismatches))
    return
  }

  if (typeof rule === 'object' && rule !== null) {
    if (Array.isArray(value) || typeof value !== 'object') {
      mismatches.push({ path: pathStr(path), expected: 'object', got: typeofX(value) })
      return
    }
    for (const [k, sub] of Object.entries(rule)) {
      validateShape(sub, value[k], [...path, k], mismatches)
    }
  }
}

function typeofX(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function pathStr(path) {
  return path.join('.')
}
