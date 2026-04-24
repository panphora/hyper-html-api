/**
 * v0 form-builder — walks a rules tree, renders a <form> DOM subtree.
 *
 * Dispatch on rule shape:
 *   "selector"           → scalar widget (+ include checkbox)
 *   "selector[]"         → scalar-array repeater
 *   [selector, shape]    → object-array repeater (cards)
 *   { key: rule, ... }   → labeled section; recurses
 *
 * onChange is called with a full new data tree on any edit. The caller owns
 * re-applying via `engine.apply` — this module never touches the rendered app.
 *
 * Widget inference peeks at the rendered app (via the `appRoot` arg) to pick a
 * sensible default input shape (text / textarea / checkbox / select).
 *
 * v0 intentionally omits: widget registry, sidecar config, drag-reorder,
 * undo toast. Those land in `src/cms/` proper (see cms-plan.md).
 */

import { DOM_PROPERTIES_SET } from '../src/engine/dom-properties.js'

const BOOL_PROPS = new Set(['checked', 'selected', 'disabled', 'readOnly', 'paused'])

/** Public entry. Returns a DocumentFragment so the caller decides where to mount. */
export function buildForm({ rules, data, onChange, appRoot, cmsRoot }) {
  const frag = document.createDocumentFragment()
  const ctx = { onChange, getData: () => data, rules, appRoot, cmsRoot }
  frag.appendChild(buildNode({ rule: rules, value: data, path: [], ctx }))
  return frag
}

// ─ dispatch ─────────────────────────────────────────────────────────

function buildNode({ rule, value, path, ctx }) {
  if (typeof rule === 'string') {
    if (rule.endsWith('[]')) return buildScalarArray({ rule, value, path, ctx })
    return buildScalarField({ rule, value, path, ctx })
  }
  if (Array.isArray(rule)) return buildObjectArray({ rule, value, path, ctx })
  if (typeof rule === 'object' && rule !== null) {
    return buildObject({ rule, value, path, ctx })
  }
  const span = document.createElement('span')
  span.textContent = '(unsupported rule)'
  return span
}

// ─ object ───────────────────────────────────────────────────────────

function buildObject({ rule, value, path, ctx }) {
  const wrap = document.createElement('div')
  wrap.className = 'form-section'

  if (path.length > 0) {
    const label = document.createElement('div')
    label.className = 'form-section-label'
    label.textContent = humanize(path[path.length - 1])
    wrap.appendChild(label)
  }

  for (const [key, sub] of Object.entries(rule)) {
    const subPath = [...path, key]
    const subValue = value == null ? undefined : value[key]
    wrap.appendChild(buildNode({ rule: sub, value: subValue, path: subPath, ctx }))
  }

  return wrap
}

// ─ scalar field (with include toggle) ──────────────────────────────

function buildScalarField({ rule, value, path, ctx }) {
  const row = document.createElement('div')
  row.className = 'field-row'

  const included = value !== undefined
  // Stash the last non-null value so toggling back on restores it rather
  // than the null that "include=off" writes into the tree.
  let stash = value == null ? '' : String(value)

  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.checked = included
  toggle.className = 'field-toggle'
  toggle.title = 'include this field'

  const body = document.createElement('div')
  body.className = 'field-body'

  const label = document.createElement('label')
  label.className = 'field-label'
  label.textContent = humanize(path[path.length - 1] || '.') + '  ' + ruleHint(rule)

  const widget = widgetFor(rule, ctx.appRoot)
  const input = makeInput(widget)
  input.classList.add(widget.type === 'textarea' ? 'field-textarea' : 'field-input')
  if (widget.type === 'checkbox') {
    input.checked = value === true || value === 'true' || value === 'checked'
  } else if (widget.type !== 'select') {
    input.value = stash
  }

  if (!included) input.classList.add('disabled')

  // Populate options for select widgets inferred from the target
  if (widget.type === 'select' && widget.options) {
    widget.options.forEach((opt) => {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.text
      if (String(value) === opt.value) o.selected = true
      input.appendChild(o)
    })
  }

  input.addEventListener('input', () => {
    if (!toggle.checked) return
    const v = readInputValue(input, widget)
    stash = v
    // Scalar edits don't restructure the form — caller shouldn't rebuild.
    ctx.onChange(setAtPath(ctx.getData(), path, v), { structural: false })
  })
  input.addEventListener('change', () => {
    if (!toggle.checked) return
    const v = readInputValue(input, widget)
    stash = v
    ctx.onChange(setAtPath(ctx.getData(), path, v), { structural: false })
  })

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      input.classList.remove('disabled')
      ctx.onChange(
        setAtPath(ctx.getData(), path, readInputValue(input, widget) || stash),
        { structural: false },
      )
    } else {
      input.classList.add('disabled')
      // `null` blanks the slot in the DOM; `undefined` would leave it as-is.
      // The playground semantic is "this data point is absent" → null.
      ctx.onChange(setAtPath(ctx.getData(), path, null), { structural: false })
    }
  })

  body.appendChild(label)
  body.appendChild(input)
  row.appendChild(toggle)
  row.appendChild(body)
  return row
}

// ─ scalar array ─────────────────────────────────────────────────────

function buildScalarArray({ rule, value, path, ctx }) {
  const wrap = document.createElement('div')
  wrap.className = 'form-section'

  const label = document.createElement('div')
  label.className = 'form-section-label'
  label.textContent = humanize(path[path.length - 1])
  wrap.appendChild(label)

  const items = Array.isArray(value) ? value : []
  const list = document.createElement('div')
  wrap.appendChild(list)

  function rerender(newItems) {
    ctx.onChange(setAtPath(ctx.getData(), path, newItems))
  }

  items.forEach((item, i) => {
    const row = document.createElement('div')
    row.className = 'scalar-array-row'
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'field-input'
    input.value = item == null ? '' : String(item)
    input.addEventListener('input', () => {
      const next = [...items]
      next[i] = input.value
      // Item value edit, no structural change.
      ctx.onChange(setAtPath(ctx.getData(), path, next), { structural: false })
    })
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'array-remove'
    remove.textContent = '×'
    remove.title = 'remove'
    remove.addEventListener('click', () => {
      const next = items.filter((_, j) => j !== i)
      ctx.onChange(setAtPath(ctx.getData(), path, next), { structural: true })
    })
    row.appendChild(input)
    row.appendChild(remove)
    list.appendChild(row)
  })

  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'array-add'
  add.textContent = '+ add'
  add.addEventListener('click', () => {
    ctx.onChange(setAtPath(ctx.getData(), path, [...items, '']), { structural: true })
  })
  wrap.appendChild(add)

  return wrap
}

// ─ object array ─────────────────────────────────────────────────────

function buildObjectArray({ rule, value, path, ctx }) {
  const [, shape] = rule
  const items = Array.isArray(value) ? value : []

  const wrap = document.createElement('div')
  wrap.className = 'form-section'

  const label = document.createElement('div')
  label.className = 'form-section-label'
  label.textContent = humanize(path[path.length - 1])
  wrap.appendChild(label)

  items.forEach((item, i) => {
    const card = document.createElement('div')
    card.className = 'array-card'

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'array-remove'
    remove.textContent = '×'
    remove.title = 'remove item'
    remove.addEventListener('click', () => {
      const next = items.filter((_, j) => j !== i)
      ctx.onChange(setAtPath(ctx.getData(), path, next), { structural: true })
    })
    card.appendChild(remove)

    const inner = buildNode({
      rule: shape,
      value: item,
      path: [...path, i],
      ctx,
    })
    // The nested object renders its own section-label from its key; strip it
    // here since the card is already the container and the key is an index.
    inner.querySelector('.form-section-label')?.remove()
    card.appendChild(inner)
    wrap.appendChild(card)
  })

  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'array-add'
  add.textContent = '+ add'
  add.addEventListener('click', () => {
    ctx.onChange(setAtPath(ctx.getData(), path, [...items, scaffoldFromShape(shape)]), {
      structural: true,
    })
  })
  wrap.appendChild(add)

  return wrap
}

// ─ widget inference ─────────────────────────────────────────────────

function widgetFor(rule, appRoot) {
  // Extract a prop name if the rule addresses one
  let propName = null
  if (rule.startsWith('@')) propName = rule.slice(1)
  else if (rule.includes('@')) propName = rule.split('@')[1] || null

  if (propName && BOOL_PROPS.has(propName)) return { type: 'checkbox' }
  if (propName === 'innerHTML') return { type: 'textarea' }

  const target = queryTarget(rule, appRoot)
  if (!target) return { type: 'text' }

  const tag = (target.tagName || '').toLowerCase()
  if (tag === 'textarea') return { type: 'textarea' }
  if (tag === 'select') {
    const options = Array.from(target.querySelectorAll('option')).map((o) => ({
      value: o.getAttribute('value') || o.textContent,
      text: o.textContent.trim() || o.getAttribute('value') || '',
    }))
    return { type: 'select', options }
  }
  if (tag === 'input') {
    const inputType = (target.getAttribute('type') || 'text').toLowerCase()
    if (inputType === 'checkbox' || inputType === 'radio') return { type: 'checkbox' }
    if (inputType === 'number') return { type: 'number' }
  }
  // Multi-line heuristic: long or multiline text content
  const txt = (target.textContent || '').trim()
  if (txt.length > 60 || txt.includes('\n')) return { type: 'textarea' }

  return { type: 'text' }
}

function queryTarget(rule, appRoot) {
  if (!appRoot) return null
  // Ignore @attr-only rules; nothing to infer from.
  if (rule === '.' || rule === '') return null
  if (rule.startsWith('@')) return null
  const selector = rule.includes('@') ? rule.split('@')[0] : rule
  if (!selector) return null
  try {
    return appRoot.querySelector(selector)
  } catch {
    return null
  }
}

function makeInput(widget) {
  if (widget.type === 'textarea') return document.createElement('textarea')
  if (widget.type === 'select') return document.createElement('select')
  const el = document.createElement('input')
  el.type = widget.type === 'checkbox' ? 'checkbox' : widget.type === 'number' ? 'number' : 'text'
  return el
}

function readInputValue(input, widget) {
  if (widget.type === 'checkbox') return input.checked
  return input.value
}

// ─ immutable tree helpers ───────────────────────────────────────────

function setAtPath(obj, path, value) {
  if (path.length === 0) return value
  const [k, ...rest] = path
  if (typeof k === 'number') {
    const next = Array.isArray(obj) ? [...obj] : []
    next[k] = setAtPath(next[k], rest, value)
    return next
  }
  return { ...(obj && typeof obj === 'object' ? obj : {}), [k]: setAtPath((obj || {})[k], rest, value) }
}

function scaffoldFromShape(shape) {
  // Mirror the shape with empty leaves so apply's list diff has something
  // to write into the cloned template.
  if (typeof shape === 'string') return shape.endsWith('[]') ? [] : ''
  if (Array.isArray(shape)) return []
  if (typeof shape === 'object' && shape !== null) {
    const out = {}
    for (const [k, v] of Object.entries(shape)) out[k] = scaffoldFromShape(v)
    return out
  }
  return ''
}

// ─ misc ─────────────────────────────────────────────────────────────

function humanize(key) {
  if (typeof key === 'number') return `#${key + 1}`
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

function ruleHint(rule) {
  // subtle right-aligned rule signature for the field label
  const hint = document.createTextNode('')
  const span = `  ·  ${rule}`
  return span
}

export { setAtPath, scaffoldFromShape, humanize }
