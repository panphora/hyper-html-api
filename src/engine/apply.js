import {
  DOM_PROPERTIES_WRITE_SET,
  DOM_PROPERTIES_READ_ONLY_SET,
} from './dom-properties.js'
import {
  MaxRuleDepthExceeded,
  MAX_RULE_DEPTH,
  RuleTargetReadOnly,
  ShapeMismatch,
} from './errors.js'
import { listDiff } from './diff.js'

const BOOLEAN_PROPS = new Set(['checked', 'selected', 'disabled', 'readOnly', 'paused'])

export function apply(adapter, root, rules, data, opts = {}) {
  const mismatches = []
  validateShape(rules, data, [], mismatches)
  if (mismatches.length) throw new ShapeMismatch(mismatches)

  applyAt(adapter, root, rules, data, { depth: 0, path: [] }, opts)
}

// applyAt returns the (possibly new) ctx node. Most rules don't change
// ctx, but writes targeting `@outerHTML` on ctx itself replace the node;
// downstream code (object-rule sub-walks, listDiff) needs to refresh its
// pointer from the return value.
export function applyAt(adapter, ctx, rule, value, trace, opts = {}) {
  if (trace.depth > MAX_RULE_DEPTH) throw new MaxRuleDepthExceeded(trace.path)
  if (value === undefined) return ctx

  if (typeof rule === 'string') return applyScalar(adapter, ctx, rule, value, trace, opts)

  if (Array.isArray(rule)) {
    const [selector, shape] = rule
    listDiff(adapter, ctx, selector, shape, value, trace, applyAt, opts)
    return ctx
  }

  if (typeof rule === 'object' && rule !== null) {
    for (const [key, sub] of Object.entries(rule)) {
      const newCtx = applyAt(
        adapter,
        ctx,
        sub,
        value == null ? value : value[key],
        { depth: trace.depth + 1, path: [...trace.path, key] },
        opts,
      )
      if (newCtx && newCtx !== ctx) ctx = newCtx
    }
    return ctx
  }
  return ctx
}

function applyScalar(adapter, ctx, rule, value, trace, opts) {
  if (rule.endsWith('[]')) {
    const selector = rule.slice(0, -2)
    listDiff(adapter, ctx, selector, null, value, trace, applyAt, opts)
    return ctx
  }

  if (rule.startsWith('@')) {
    return writePropOrAttr(adapter, ctx, rule.slice(1), value)
  }

  if (rule.includes('@')) {
    const at = rule.lastIndexOf('@')
    const selector = rule.slice(0, at)
    const name = rule.slice(at + 1)
    const matches = selector ? adapter.find(ctx, selector, opts) : [ctx]
    if (matches.length === 0) return ctx
    writePropOrAttr(adapter, matches[0], name, value)
    return ctx
  }

  if (rule === '.') {
    adapter.text(ctx, value == null ? '' : String(value))
    return ctx
  }

  const matches = adapter.find(ctx, rule, opts)
  if (matches.length === 0) return ctx
  adapter.text(matches[0], value == null ? '' : String(value))
  return ctx
}

// Returns the (possibly new) node. For outerHTML, the original is detached
// and a freshly parsed element takes its place; that new node is returned.
// For every other write, returns the original node unchanged.
function writePropOrAttr(adapter, node, name, value) {
  if (DOM_PROPERTIES_READ_ONLY_SET.has(name)) {
    throw new RuleTargetReadOnly(name)
  }
  if (name === 'outerHTML') {
    const html = value == null ? '' : String(value)
    return adapter.replaceWith(node, html)
  }
  if (DOM_PROPERTIES_WRITE_SET.has(name)) {
    adapter.prop(node, name, coercePropValue(name, value))
    return node
  }
  adapter.attr(node, name, value == null ? '' : String(value))
  return node
}

function coercePropValue(name, value) {
  if (value === null || value === undefined) {
    return BOOLEAN_PROPS.has(name) ? false : ''
  }
  if (BOOLEAN_PROPS.has(name)) return Boolean(value)
  return value
}

function validateShape(rule, value, path, mismatches) {
  // undefined = key omitted by caller; treat as "skip this rule entirely".
  // null / '' are valid for scalar rules (clears the value), but NOT for
  // list or object rules — those mismatch explicitly.
  if (value === undefined) return

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
    // Scalar rule. null / '' are valid (clears text/attribute). Reject
    // only nested objects/arrays.
    if (value !== null && typeof value === 'object') {
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
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
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
