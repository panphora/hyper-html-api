/**
 * Walks a (possibly merged) rules tree and renders a form DOM subtree.
 *
 * Dispatch on rule shape:
 *   "selector"           → scalar widget (inferred from rendered app)
 *   "selector[]"         → scalar-array repeater
 *   [selector, shape]    → object-array repeater (cards)
 *   { key: rule, ... }   → labeled section; recurses
 *
 * Rendered DOM is purely declarative — no event listeners are attached
 * during build. Events are dispatched via `bindFormEvents(formRoot, ...)`,
 * which installs ONE delegated handler on the form root and routes by
 * data-attribute. Delegation is required because hyper-morph's createNode
 * path inserts new nodes via `document.importNode`, which does NOT
 * transfer addEventListener-style listeners — so any handler attached
 * during build would be silently lost the first time the morph inserts a
 * new card/row.
 *
 * Widget call sites use the locked object-arg signature (cms-plan.md §
 * "Widget registry"). Phase 1 dispatches inline on widget type; phase 3
 * swaps in the registry without changing call sites.
 */

import {
  fromString as pathFromString,
  getRuleAtPath,
  getValueAtPath,
  setAtPath,
  toString as pathToString,
} from './path.js'
import { scaffold } from './scaffold.js'
import { widgetHandles } from './widget-handles.js'

const BOOL_PROPS = new Set(['checked', 'selected', 'disabled', 'readOnly', 'paused'])

/** Public entry. Returns a DocumentFragment so the caller decides where to mount. */
export function buildForm({ rules, data, appRoot, cmsRoot }) {
  const frag = document.createDocumentFragment()
  const ctx = { rules, appRoot, cmsRoot }
  frag.appendChild(buildNode({ rule: rules, value: data, path: [], ctx }))
  return frag
}

/**
 * Install delegated event handlers on the form root. Call once after the
 * initial mount; subsequent morphs preserve the form root, so the
 * delegated handler survives without re-binding.
 *
 *   formRoot — element hosting the form output (typically dom.form).
 *   rules    — the merged rule tree used to resolve object-array shapes
 *              for "+ add" actions.
 *   getData  — function returning the current data tree (must reflect
 *              the latest state, not a snapshot).
 *   onChange — (newData, { structural }) => void.
 */
export function bindFormEvents(formRoot, { rules, getData, onChange }) {
  formRoot.addEventListener('input', (e) => handleValueEvent(e, { getData, onChange }))
  formRoot.addEventListener('change', (e) => handleValueEvent(e, { getData, onChange }))
  formRoot.addEventListener('click', (e) => handleClick(e, { rules, getData, onChange }))
}

// ─ delegated handlers ──────────────────────────────────────────────

function handleClick(e, { rules, getData, onChange }) {
  const btn = e.target.closest('[data-hha-action]')
  if (!btn || !btn.matches('[data-hha-action]')) return
  if (e.defaultPrevented) return
  const action = btn.getAttribute('data-hha-action')
  const path = pathFromString(btn.getAttribute('data-hha-path') || '')

  if (action === 'scalar-array-add') {
    const current = getValueAtPath(getData(), path) || []
    onChange(setAtPath(getData(), path, [...current, '']), { structural: true })
    return
  }
  if (action === 'object-array-add') {
    const rule = getRuleAtPath(rules, path)
    if (!Array.isArray(rule)) return
    const current = getValueAtPath(getData(), path) || []
    onChange(setAtPath(getData(), path, [...current, scaffold(rule[1])]), {
      structural: true,
    })
    return
  }
  if (action === 'array-remove') {
    if (path.length === 0) return
    const parentPath = path.slice(0, -1)
    const index = path[path.length - 1]
    const current = getValueAtPath(getData(), parentPath) || []
    if (typeof index !== 'number') return
    const next = current.filter((_, i) => i !== index)
    onChange(setAtPath(getData(), parentPath, next), { structural: true })
  }
}

function handleValueEvent(e, { getData, onChange }) {
  const target = e.target
  if (!target.matches?.('input, textarea, select')) return
  const row = target.closest('[data-hha-path]')
  if (!row) return
  const path = pathFromString(row.getAttribute('data-hha-path') || '')
  const value = target.type === 'checkbox' ? target.checked : target.value
  onChange(setAtPath(getData(), path, value), { structural: false })
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
  wrap.setAttribute('data-hha-path', pathToString(path))

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

// ─ scalar field ─────────────────────────────────────────────────────

function buildScalarField({ rule, value, path, ctx }) {
  const row = document.createElement('div')
  row.className = 'field-row'
  row.setAttribute('data-hha-path', pathToString(path))

  const body = document.createElement('div')
  body.className = 'field-body'

  const label = document.createElement('label')
  label.className = 'field-label'
  label.textContent = humanize(path[path.length - 1] || '.') + ruleHint(rule)

  const widget = widgetFor(rule, ctx.appRoot)
  const handle = invokeWidget(widget, {
    value,
    rule,
    path,
    appRoot: ctx.appRoot,
  })

  const input = handle.el
  input.classList.add(widget.type === 'textarea' ? 'field-textarea' : 'field-input')

  body.appendChild(label)
  body.appendChild(input)
  row.appendChild(body)

  widgetHandles.set(row, handle)
  return row
}

// ─ scalar array ─────────────────────────────────────────────────────

function buildScalarArray({ rule, value, path, ctx }) {
  const wrap = document.createElement('div')
  wrap.className = 'form-section'
  wrap.setAttribute('data-hha-path', pathToString(path))

  const label = document.createElement('div')
  label.className = 'form-section-label'
  label.textContent = humanize(path[path.length - 1])
  wrap.appendChild(label)

  const items = Array.isArray(value) ? value : []
  const list = document.createElement('div')
  wrap.appendChild(list)

  items.forEach((item, i) => {
    const itemPath = [...path, i]
    const row = document.createElement('div')
    row.className = 'scalar-array-row'
    row.setAttribute('data-hha-path', pathToString(itemPath))

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'field-input'
    const itemValue = item == null ? '' : String(item)
    input.setAttribute('value', itemValue)
    input.value = itemValue

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'array-remove'
    remove.textContent = '×'
    remove.title = 'remove'
    remove.setAttribute('data-hha-action', 'array-remove')
    remove.setAttribute('data-hha-path', pathToString(itemPath))

    row.appendChild(input)
    row.appendChild(remove)
    list.appendChild(row)
  })

  const add = document.createElement('button')
  add.type = 'button'
  add.className = 'array-add'
  add.textContent = '+ add'
  add.setAttribute('data-hha-action', 'scalar-array-add')
  add.setAttribute('data-hha-path', pathToString(path))
  wrap.appendChild(add)

  return wrap
}

// ─ object array ─────────────────────────────────────────────────────

function buildObjectArray({ rule, value, path, ctx }) {
  const [, shape] = rule
  const items = Array.isArray(value) ? value : []

  const wrap = document.createElement('div')
  wrap.className = 'form-section'
  wrap.setAttribute('data-hha-path', pathToString(path))

  const label = document.createElement('div')
  label.className = 'form-section-label'
  label.textContent = humanize(path[path.length - 1])
  wrap.appendChild(label)

  items.forEach((item, i) => {
    const itemPath = [...path, i]
    const card = document.createElement('div')
    card.className = 'array-card'
    card.setAttribute('data-hha-path', pathToString(itemPath))

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'array-remove'
    remove.textContent = '×'
    remove.title = 'remove item'
    remove.setAttribute('data-hha-action', 'array-remove')
    remove.setAttribute('data-hha-path', pathToString(itemPath))
    card.appendChild(remove)

    const inner = buildNode({
      rule: shape,
      value: item,
      path: itemPath,
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
  add.setAttribute('data-hha-action', 'object-array-add')
  add.setAttribute('data-hha-path', pathToString(path))
  wrap.appendChild(add)

  return wrap
}

// ─ widget invocation (phase 1: inline; phase 3: registry) ──────────

/**
 * Build the widget element with the locked object-arg signature and
 * render its initial value. Returns a normalized handle so the morph
 * hook can unconditionally call destroy?.() at removal time.
 *
 * No event listeners are wired here — events flow through the form
 * root's delegated handler (see bindFormEvents above).
 *
 * Phase 3 will move type-specific builders into src/cms/registry.js and
 * dispatch via `registry.get(name)(ctx)` — the call site stays put.
 */
function invokeWidget(widget, ctx) {
  const el = makeInput(widget)

  // Values are set as ATTRIBUTES (not just properties) so hyper-morph's
  // input-value sync recognizes them across rebuilds. The morph clears the
  // old element's value when the new one has no `value` attribute.
  if (widget.type === 'select' && widget.options) {
    for (const opt of widget.options) {
      const o = document.createElement('option')
      o.setAttribute('value', opt.value)
      o.textContent = opt.text
      if (String(ctx.value) === opt.value) o.setAttribute('selected', '')
      el.appendChild(o)
    }
  } else if (widget.type === 'checkbox') {
    const on = ctx.value === true || ctx.value === 'true' || ctx.value === 'checked'
    if (on) el.setAttribute('checked', '')
  } else if (widget.type === 'textarea') {
    el.textContent = ctx.value == null ? '' : String(ctx.value)
  } else {
    const v = ctx.value == null ? '' : String(ctx.value)
    el.setAttribute('value', v)
    el.value = v
  }

  return {
    el,
    destroy() {},
    focus() {
      el.focus()
    },
    validate() {},
  }
}

// ─ widget inference ─────────────────────────────────────────────────

function widgetFor(rule, appRoot) {
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
  const txt = (target.textContent || '').trim()
  if (txt.length > 60 || txt.includes('\n')) return { type: 'textarea' }

  return { type: 'text' }
}

function queryTarget(rule, appRoot) {
  if (!appRoot) return null
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

// ─ misc ─────────────────────────────────────────────────────────────

function humanize(key) {
  if (typeof key === 'number') return `#${key + 1}`
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

function ruleHint(rule) {
  return `  ·  ${rule}`
}
