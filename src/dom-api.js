import * as engineMod from './engine/index.js'
import domAdapter from './adapters/dom.js'

// The DOM-bound engine: every engine call pre-wired with the DOM adapter. Lives
// here (instead of inline in hyper-html-api.js) so both the full CDN bundle and
// the lean `data.js` entry share one definition.
export const engine = {
  extract: (root, rules, opts) => engineMod.extract(domAdapter, root, rules, opts),
  apply: (root, rules, data, opts) => engineMod.apply(domAdapter, root, rules, data, opts),
  findRulesIn: (root, token) => engineMod.findRulesIn(domAdapter, root, token),
  findRules: (root, source) => engineMod.resolveRules(domAdapter, root, source),
  bind: (root, source, opts) => engineMod.bind(domAdapter, root, source, opts),
  parseStrict: engineMod.parseStrict,
  parseRelaxed: engineMod.parseRelaxed,
  errors: engineMod.errors,
  DOM_PROPERTIES: engineMod.DOM_PROPERTIES,
}

const isNode = (x) => !!x && typeof x.nodeType === 'number'

// Autodetect the page's single rules tag when no `source` is given.
// engine.findRulesIn(root) (no token) silently takes the FIRST of many tags, so
// the sugar counts the tags itself to enforce the one-tag rule with clear,
// distinct errors for "none" vs "multiple".
function autodetect(root) {
  const searchRoot = (root && root.ownerDocument) ? root.ownerDocument : root
  const tags = domAdapter.find(searchRoot, 'script[data-rules-name]', { includeRulesTag: true })
  if (tags.length === 0) {
    throw new Error('hyper-html-api: no rules tag found. Add <script type="application/json" data-rules-name="…" data-rules-version="1"> or pass rules.')
  }
  if (tags.length > 1) {
    throw new Error('hyper-html-api: multiple rules tags found; pass a name, e.g. extractData("api").')
  }
  // findRulesIn (no token) returns the one tag's rules and enforces data-rules-version="1".
  return engineMod.findRulesIn(domAdapter, searchRoot).rules
}

// extractData()                       → document + autodetect
// extractData(el)                     → el + autodetect
// extractData('api' | {title:'h1'})   → document + named/inline rules
// extractData(el, 'api' | {...})      → explicit root + source
// One-shot read; returns the extracted data.
export function extractData(a, b) {
  const root = isNode(a) ? a : document
  const source = isNode(a) ? b : a
  if (source === undefined) return engineMod.extract(domAdapter, root, autodetect(root))
  return engine.bind(root, source).get()
}

// applyData(root, data, source?) — writes `data` INTO the live DOM under `root`,
// using a named/inline `source` or (when omitted) the page's single rules tag.
// MUTATES the DOM and returns `root`.
export function applyData(root, data, source) {
  if (!isNode(root)) {
    throw new Error('hyper-html-api: applyData(root, data, source?) needs a DOM root as the first argument.')
  }
  if (source === undefined) engineMod.apply(domAdapter, root, autodetect(root), data)
  else engine.bind(root, source).set(data)
  return root
}
