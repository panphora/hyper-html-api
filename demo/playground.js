import HyperHtmlApi from '../src/hyper-html-api.js'
import { buildForm } from './form-builder.js'

const { engine } = HyperHtmlApi

// ─ state ────────────────────────────────────────────────────────────

const FIXTURES = {
  'products-v1': './fixtures/products-v1.html',
}

const state = {
  fixture: 'products-v1',
  view: 'single',
  rules: null,
  data: null,
  fixtureText: '', // untouched source for reset
}

const dom = {
  shell: document.getElementById('shell'),
  fixtureSelect: document.getElementById('fixture-select'),
  resetBtn: document.getElementById('reset-btn'),
  viewToggle: document.getElementById('view-toggle'),
  frame: document.getElementById('app-frame'),
  frameV2: document.getElementById('app-frame-v2'),
  form: document.getElementById('data-form'),
  rulesView: document.getElementById('rules-view'),
  extractView: document.getElementById('extract-view'),
  errorBanner: document.getElementById('error-banner'),
  dataCount: document.getElementById('data-count'),
  migrateBtn: document.getElementById('migrate-btn'),
  transformCode: document.getElementById('transform-code'),
  transformClear: document.getElementById('transform-clear'),
  summaryCard: document.getElementById('summary-card'),
}

// ─ lifecycle ────────────────────────────────────────────────────────

async function loadFixture(name, frame) {
  const res = await fetch(FIXTURES[name])
  if (!res.ok) throw new Error(`fixture not found: ${name}`)
  const text = await res.text()
  frame.srcdoc = text
  await new Promise((resolve) =>
    frame.addEventListener('load', resolve, { once: true }),
  )
  return { text, body: frame.contentDocument.body }
}

async function init() {
  const { text, body } = await loadFixture(state.fixture, dom.frame)
  state.fixtureText = text
  const found = engine.findRulesIn(body)
  if (!found) {
    showError('no rules tag in fixture')
    return
  }
  state.rules = found.rules
  state.data = engine.extract(body, state.rules)
  renderRules()
  renderExtract()
  renderForm()
}

function reset() {
  dom.frame.srcdoc = state.fixtureText
  dom.frame.addEventListener(
    'load',
    () => {
      const body = dom.frame.contentDocument.body
      state.data = engine.extract(body, state.rules)
      clearError()
      renderExtract()
      renderForm()
    },
    { once: true },
  )
}

function onDataChange(newData, opts = {}) {
  state.data = newData
  const body = dom.frame.contentDocument.body
  try {
    engine.apply(body, state.rules, newData)
    clearError()
  } catch (e) {
    showError(formatError(e))
    return
  }
  renderExtract()
  // Only rebuild the form on structural changes (list add/remove). Scalar
  // edits keep the input alive so focus / caret position is preserved.
  if (opts.structural) renderForm()
}

// ─ rendering ────────────────────────────────────────────────────────

function renderRules() {
  dom.rulesView.textContent = JSON.stringify(state.rules, null, 2)
}

function renderExtract() {
  const body = dom.frame.contentDocument.body
  const extracted = engine.extract(body, state.rules)
  dom.extractView.innerHTML = highlightJson(JSON.stringify(extracted, null, 2))
  const count = countKeys(extracted)
  dom.dataCount.textContent = `${count} field${count === 1 ? '' : 's'}`
}

function renderForm() {
  const frag = buildForm({
    rules: state.rules,
    data: state.data,
    onChange: onDataChange,
    appRoot: dom.frame.contentDocument.body,
  })
  dom.form.innerHTML = ''
  dom.form.appendChild(frag)
}

// ─ error surfacing ──────────────────────────────────────────────────

function showError(msg) {
  dom.errorBanner.textContent = msg
}
function clearError() {
  dom.errorBanner.textContent = ''
}
function formatError(e) {
  if (!e) return '(unknown error)'
  if (e.name === 'ShapeMismatch') {
    return `ShapeMismatch: ${e.mismatches
      .map((m) => `${m.path || '(root)'} expected ${m.expected}, got ${m.got}`)
      .join(' · ')}`
  }
  if (e.name === 'EmptyListInsert') {
    return `EmptyListInsert at "${(e.path || []).join('.') || '(root)'}" — seed the list in the HTML.`
  }
  return `${e.name || 'Error'}: ${e.message || e}`
}

// ─ helpers ──────────────────────────────────────────────────────────

function countKeys(v, acc = { n: 0 }) {
  if (v == null) return acc.n
  if (Array.isArray(v)) {
    v.forEach((x) => countKeys(x, acc))
    return acc.n
  }
  if (typeof v === 'object') {
    for (const k of Object.keys(v)) {
      acc.n++
      countKeys(v[k], acc)
    }
    return acc.n
  }
  return acc.n
}

function highlightJson(src) {
  return src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)/g, '<span class="k">"$1"</span>$2')
    .replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g, ': <span class="s">"$1"</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="b">$1</span>')
    .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="n">$1</span>')
}

// ─ wiring ───────────────────────────────────────────────────────────

dom.resetBtn.addEventListener('click', reset)

dom.viewToggle.addEventListener('change', () => {
  state.view = dom.viewToggle.checked ? 'upgrade' : 'single'
  dom.shell.classList.toggle('view-upgrade', state.view === 'upgrade')
})

dom.fixtureSelect.addEventListener('change', () => {
  state.fixture = dom.fixtureSelect.value
  init()
})

init().catch((e) => showError(formatError(e)))
