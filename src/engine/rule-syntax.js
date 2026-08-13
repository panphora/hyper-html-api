// The scalar rule grammar: "<selector>@<prop>", plus a trailing "[]" for a list
// of values, a leading "@" for a prop on the context node, and "." for its text.
//
// Locating the "@" is the only subtle part of it. It is the LAST one, because a
// prop name never contains "@" but a selector often does: a mailto link
// (a[href="mailto:hi@example.com"]), a container query, a Tailwind arbitrary
// variant. Every one of those carries its "@" inside brackets, parens or
// quotes, so a separator is an "@" at bracket depth zero and outside any quote.
// Scanning with a plain lastIndexOf finds the one in the mailto and splits the
// rule into `a[href="mailto:hi` and `example.com"]`, which reads downstream as
// an invalid selector when the rule the author wrote was correct.

// Index of the separator "@", or -1 when the rule has no prop part.
export function ruleAttrIndex(rule) {
  let depth = 0
  let quote = null
  let found = -1
  for (let i = 0; i < rule.length; i++) {
    const ch = rule[i]
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
    } else if (ch === '@' && depth === 0) {
      found = i
    }
  }
  return found
}

// "<selector>@<prop>" split at that separator. selector is "" for a leading "@"
// (the context node itself); prop is null when the rule names no prop.
export function splitRule(rule) {
  const at = ruleAttrIndex(rule)
  if (at === -1) return { selector: rule, prop: null }
  return { selector: rule.slice(0, at), prop: rule.slice(at + 1) || null }
}
