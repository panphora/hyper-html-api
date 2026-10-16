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
// writer skips them, which is what keeps partial updates working. `source` is
// the adapter, root and options that extraction read, so the guard can see
// which element a text rule matched instead of guessing from its selector.
export function assertRoundTrip(rules, requested, actual, source) {
  check(rules, requested, actual, [], source ? { ...source, rules } : null)
}

function check(rule, want, got, path, source) {
  if (want === undefined) return
  if (typeof rule === 'string') {
    checkScalarRule(rule, want, got, path, source)
    return
  }
  if (Array.isArray(rule)) {
    checkList(rule[1], want, got, path, source)
    return
  }
  if (typeof rule === 'object' && rule !== null) {
    checkObject(rule, want, got, path, source)
  }
}

function checkScalarRule(rule, want, got, path, source) {
  if (rule.endsWith('[]')) {
    checkTextList(want, got, path)
    return
  }
  if (rule.startsWith('@')) {
    checkPropOrAttr(rule.slice(1), want, got, path, '', source)
    return
  }
  const at = ruleAttrIndex(rule)
  if (at !== -1) {
    checkPropOrAttr(rule.slice(at + 1), want, got, path, rule.slice(0, at), source)
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

function checkObject(rule, want, got, path, source) {
  if (!isPlainObject(want) || !isPlainObject(got)) fail(path)
  for (const [key, sub] of Object.entries(rule)) {
    check(sub, want[key], got[key], [...path, key], source)
  }
}

function checkList(shape, want, got, path, source) {
  if (!Array.isArray(want) || !Array.isArray(got) || want.length !== got.length) fail(path)
  for (let i = 0; i < want.length; i++) check(shape, want[i], got[i], [...path, i], source)
}

function checkPropOrAttr(name, want, got, path, selector, source) {
  if (!DOM_PROPERTIES_SET.has(name)) {
    if (want == null) {
      if (got != null) fail(path)
      return
    }
    if (!sameString(String(want), got)) fail(path)
    return
  }
  if (UNTRIMMED_PROPS.has(name)) {
    if (!sameUntrimmed(String(want ?? ''), got, selector, path, source)) fail(path)
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
function sameUntrimmed(want, got, selector, path, source) {
  if (got == null) return false
  const wantText = normalizeNewlines(want)
  const gotText = normalizeNewlines(got)
  if (wantText === gotText) return true
  return wantText.startsWith('\n') && wantText.slice(1) === gotText && dropsLeadingNewline(selector, path, source)
}

// Which element the rule matched decides the allowance, not how its selector is
// spelled: an ID or class selector names a pre just as "pre" does. An element
// that cannot be found refuses, which is the safe answer: the caller compares
// exactly.
function dropsLeadingNewline(selector, path, source) {
  const node = matchedNode(selector, path, source)
  if (!node) return false
  const tag = source.adapter.prop(node, 'tagName')
  return tag != null && NEWLINE_DROPPING_TAGS.has(String(tag).toLowerCase())
}

// The element a scalar rule reads, found the way extraction found it: walk the
// rule tree by the reported path to the rule's own context, then match the
// rule's selector there. Only called for a text rule whose value lost a leading
// newline, so an ordinary write pays nothing for it.
function matchedNode(selector, path, source) {
  if (!source || !source.adapter || !source.root) return null
  const { adapter, root, opts } = source
  let rule = source.rules
  let ctx = root
  for (const key of path) {
    if (Array.isArray(rule)) {
      const match = adapter.find(ctx, rule[0], opts)[key]
      if (!match) return null
      ctx = match
      rule = rule[1]
    } else if (isPlainObject(rule)) {
      rule = rule[key]
    } else {
      return null
    }
  }
  if (!selector) return ctx
  return adapter.find(ctx, selector, opts)[0] || null
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(path) {
  throw new WriteNotRoundTripped(path)
}
