import {
  DOM_PROPERTIES_SET,
  DOM_PROPERTIES_WRITE_SET,
  coercePropValue,
} from './dom-properties.js'
import { WriteNotRoundTripped } from './errors.js'
import { ruleAttrIndex } from './rule-syntax.js'

// Props whose read-side value keeps its whitespace. Every other text rule reads
// trimmed, which is what writeText compares against.
const UNTRIMMED_PROPS = new Set(['textContent', 'innerText'])

// Elements whose content loses one leading LF to the HTML parser: the tokenizer
// drops a newline that immediately follows the start tag.
const NEWLINE_DROPPING_TAGS = new Set(['pre', 'textarea'])

// Compares what the caller asked for against a fresh extraction of the
// serialized source, so a write that serialized away or never landed throws
// WriteNotRoundTripped instead of returning a false success. Only the supplied
// projection is checked: omitted keys and undefined are skipped exactly as the
// writer skips them, which is what keeps partial updates working.
export function assertRoundTrip(rules, requested, actual) {
  check(rules, requested, actual, [])
}

function check(rule, want, got, path) {
  if (want === undefined) return
  if (typeof rule === 'string') {
    checkScalarRule(rule, want, got, path)
    return
  }
  if (Array.isArray(rule)) {
    checkList(rule[1], want, got, path)
    return
  }
  if (typeof rule === 'object' && rule !== null) {
    checkObject(rule, want, got, path)
  }
}

function checkScalarRule(rule, want, got, path) {
  if (rule.endsWith('[]')) {
    checkTextList(want, got, path)
    return
  }
  if (rule.startsWith('@')) {
    checkPropOrAttr(rule.slice(1), want, got, path, '')
    return
  }
  const at = ruleAttrIndex(rule)
  if (at !== -1) {
    checkPropOrAttr(rule.slice(at + 1), want, got, path, rule.slice(0, at))
    return
  }
  checkText(want, got, path)
}

function checkText(want, got, path) {
  if (textOf(want) !== textOf(got)) fail(path)
}

function checkTextList(want, got, path) {
  if (!Array.isArray(want) || !Array.isArray(got) || want.length !== got.length) fail(path)
  for (let i = 0; i < want.length; i++) checkText(want[i], got[i], [...path, i])
}

function checkObject(rule, want, got, path) {
  if (!isPlainObject(want) || !isPlainObject(got)) fail(path)
  for (const [key, sub] of Object.entries(rule)) {
    check(sub, want[key], got[key], [...path, key])
  }
}

function checkList(shape, want, got, path) {
  if (!Array.isArray(want) || !Array.isArray(got) || want.length !== got.length) fail(path)
  for (let i = 0; i < want.length; i++) check(shape, want[i], got[i], [...path, i])
}

function checkPropOrAttr(name, want, got, path, selector) {
  if (!DOM_PROPERTIES_SET.has(name)) {
    if (want == null) {
      if (got != null) fail(path)
      return
    }
    if (!sameString(String(want), got)) fail(path)
    return
  }
  if (UNTRIMMED_PROPS.has(name)) {
    if (!sameUntrimmed(String(want ?? ''), got, selector)) fail(path)
    return
  }
  if (DOM_PROPERTIES_WRITE_SET.has(name)) {
    if (got !== String(coercePropValue(name, want))) fail(path)
    return
  }
  if (want == null) {
    if (got != null) fail(path)
    return
  }
  if (!sameString(String(want), got)) fail(path)
}

function textOf(value) {
  return normalizeNewlines(String(value ?? '').trim())
}

// A document normalizes newlines: parsing turns CRLF and a lone CR into LF, so
// a value that differs only by that is the value the source carries.
function normalizeNewlines(value) {
  return value.replace(/\r\n?/g, '\n')
}

function sameString(want, got) {
  return got != null && normalizeNewlines(want) === normalizeNewlines(got)
}

// @textContent compares exactly, with one exception: a leading newline after a
// pre/textarea start tag never reaches the DOM, so it cannot come back.
function sameUntrimmed(want, got, selector) {
  if (got == null) return false
  const wantText = normalizeNewlines(want)
  const gotText = normalizeNewlines(got)
  if (wantText === gotText) return true
  return wantText.startsWith('\n') && wantText.slice(1) === gotText && dropsLeadingNewline(selector)
}

function dropsLeadingNewline(selector) {
  return NEWLINE_DROPPING_TAGS.has(lastCompoundTag(selector))
}

// The type selector of a selector's LAST compound, so "pre", "#t pre" and
// ":scope > pre.x" all name pre. Null when that compound has no type selector,
// which is the safe answer: the caller then compares exactly.
function lastCompoundTag(selector) {
  if (!selector) return null
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '\\') {
      i++
    } else if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '[' || ch === '(') {
      depth++
    } else if (ch === ']' || ch === ')') {
      if (depth > 0) depth--
    } else if (depth === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) {
      start = i + 1
    }
  }
  const match = /^([a-zA-Z][\w-]*)/.exec(selector.slice(start))
  return match ? match[1].toLowerCase() : null
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(path) {
  throw new WriteNotRoundTripped(path)
}
