// One CSS custom property inside an inline style attribute, read and written
// as text. Not through CSSOM: the cheerio adapter has none, and both adapters
// must return the same string for the same attribute.

const CUSTOM_PROPERTY = /^--[A-Za-z0-9_-]+$/

export function isCustomPropertyName(name) {
  return typeof name === 'string' && CUSTOM_PROPERTY.test(name)
}

// Split on top-level semicolons, ignoring any inside quotes, brackets or
// comments, so url("a;b") or a comment never cuts a declaration in half.
function splitDeclarations(text) {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if ((c === ')' || c === ']' || c === '}') && depth > 0) depth--
    else if (c === ';' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

function parseDeclaration(raw) {
  const colon = raw.indexOf(':')
  if (colon === -1) return null
  const name = raw.slice(0, colon).trim()
  let value = raw.slice(colon + 1).trim()
  const bang = /!\s*important\s*$/i.exec(value)
  if (bang) value = value.slice(0, bang.index).trim()
  return { name, value, important: !!bang }
}

// The declaration that wins: the last one, unless an earlier one is
// !important and the last one is not. Absent reads as null.
export function readStyleVar(styleText, name) {
  if (styleText == null) return null
  let winner = null
  for (const raw of splitDeclarations(String(styleText))) {
    const decl = parseDeclaration(raw)
    if (!decl || decl.name !== name) continue
    if (!winner || decl.important || !winner.important) winner = decl
  }
  return winner ? winner.value : null
}

// Returns the new attribute text, or null when nothing is left in it. An empty
// or null value removes every declaration of the property. Otherwise the first
// declaration is rewritten in place (keeping !important if any copy had it),
// later duplicates are dropped, and a property not yet present is appended.
export function writeStyleVar(styleText, name, value) {
  const text = styleText == null ? '' : String(styleText)
  const remove = value == null || value === ''
  const parts = splitDeclarations(text)
  const decls = parts.map(parseDeclaration)
  const important = decls.some((d) => d && d.name === name && d.important)
  const out = []
  let placed = false
  parts.forEach((raw, i) => {
    const decl = decls[i]
    if (!decl || decl.name !== name) {
      out.push(raw)
      return
    }
    if (remove || placed) return
    const lead = /^\s*/.exec(raw)[0]
    out.push(`${lead}${name}: ${value}${important ? ' !important' : ''}`)
    placed = true
  })
  let next = out.join(';')
  if (!remove && !placed) {
    const body = next.trimEnd()
    next = body === '' ? `${name}: ${value}` : `${body}${body.endsWith(';') ? ' ' : '; '}${name}: ${value}`
  }
  return next.trim() === '' ? null : next
}

// Every declaration in the attribute, in order, parsed. Empty segments (a
// trailing semicolon, stray whitespace) are dropped.
export function listDeclarations(styleText) {
  if (styleText == null) return []
  return splitDeclarations(String(styleText)).map(parseDeclaration).filter(Boolean)
}
