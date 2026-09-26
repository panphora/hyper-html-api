import { POLICY_TOKENS } from '../lib/region-capabilities.js'
import { WriteRefused } from './errors.js'

export const WRITE_POLICY = Object.freeze({
  refusedRuleForms: ['innerHTML', 'outerHTML'],
  refusedTargets: ['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'xmp', 'plaintext', 'noembed', 'noframes', 'meta', 'link', 'base', 'animate', 'set', 'animatemotion', 'animatetransform'],
  refusedAttributes: [
    'style', 'srcdoc', 'is', 'http-equiv', 'sandbox', 'allow', 'nonce', 'integrity', 'charset',
    'htmlclaytoken', 'htmlclayid', 'data-rules-name', 'data-rules-version', 'clay', 'contenteditable',
    ...POLICY_TOKENS,
  ],
  refusedAttributePrefixes: ['on'],
  urlAttributes: ['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'cite', 'data', 'ping', 'background', 'longdesc', 'usemap', 'xlink:href', 'manifest', 'codebase', 'icon'],
  refusedSchemes: ['javascript', 'vbscript', 'data'],
})

const TEXT_PROPS = new Set(['textContent', 'innerText'])

export function urlScheme(value) {
  const cleaned = String(value).replace(/^[\u0000- ]+|[\u0000- ]+$/g, '').replace(/[\t\n\r]/g, '')
  const m = cleaned.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  return m ? m[1].toLowerCase() : null
}

const VALID_ATTR_NAME = /^[^\t\n\f\r "'>/=\u0000-\u001f\u007f]+$/

export function checkAttribute(name, value, policy = WRITE_POLICY) {
  if (!VALID_ATTR_NAME.test(String(name))) return `attribute name ${JSON.stringify(String(name))} is not valid`
  const lower = String(name).toLowerCase()
  if (policy.refusedAttributePrefixes.some((p) => lower.startsWith(p))) return `attribute "${lower}" can run script`
  if (policy.refusedAttributes.includes(lower)) return `attribute "${lower}" is not content`
  if (policy.urlAttributes.includes(lower) && value != null) {
    const urls = lower === 'srcset'
      ? String(value).split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean)
      : [String(value)]
    for (const url of urls) {
      const scheme = urlScheme(url)
      if (scheme && policy.refusedSchemes.includes(scheme)) return `"${scheme}:" URLs are not allowed in "${lower}"`
    }
  }
  return null
}

function tagOf(adapter, node) {
  const t = adapter.prop(node, 'tagName')
  return t ? String(t).toLowerCase() : ''
}

function describe(adapter, node) {
  const tag = tagOf(adapter, node) || 'node'
  const id = adapter.attr(node, 'id')
  return id ? `<${tag}#${id}>` : `<${tag}>`
}

function refusedAncestor(adapter, node, policy) {
  let cur = node
  while (cur) {
    const tag = tagOf(adapter, cur)
    if (tag && policy.refusedTargets.includes(tag)) return tag
    cur = adapter.parent(cur)
  }
  return null
}

function holdsRulesTag(adapter, node) {
  return adapter.find(node, 'script[data-rules-name]', { includeRulesTag: true, templateAttr: null }).length > 0
}

function isOrHoldsRulesTag(adapter, node) {
  if (tagOf(adapter, node) === 'script' && adapter.attr(node, 'data-rules-name') != null) return true
  return holdsRulesTag(adapter, node)
}

// Wraps an adapter so every write is checked against the policy first. A write
// that breaks it is skipped and recorded; call assertClean() after apply() to
// throw one WriteRefused listing every violation.
export function guardAdapter(adapter, policy = WRITE_POLICY) {
  const refusals = []
  const refuse = (node, reason) => {
    refusals.push({ target: describe(adapter, node), reason })
    return false
  }
  const allowTarget = (node) => {
    const bad = refusedAncestor(adapter, node, policy)
    return bad ? refuse(node, `inside <${bad}>, which is not content`) : true
  }
  const allowText = (node) => {
    if (!allowTarget(node)) return false
    if (holdsRulesTag(adapter, node)) return refuse(node, 'a text write here would delete the data rules tag')
    return true
  }
  const allowAttr = (node, name, value) => {
    if (!allowTarget(node)) return false
    const reason = checkAttribute(name, value, policy)
    return reason ? refuse(node, reason) : true
  }

  const guarded = {
    ...adapter,
    text(node, value) {
      if (value === undefined) return adapter.text(node)
      if (allowText(node)) adapter.text(node, value)
    },
    attr(node, name, value) {
      if (value === undefined) return adapter.attr(node, name)
      if (allowAttr(node, name, value)) adapter.attr(node, name, value)
    },
    prop(node, name, value) {
      if (value === undefined) return adapter.prop(node, name)
      if (policy.refusedRuleForms.includes(name)) return refuse(node, `"@${name}" writes HTML, only text is allowed`)
      if (TEXT_PROPS.has(name)) {
        if (allowText(node)) adapter.prop(node, name, value)
        return
      }
      const attrName = name === 'className' ? 'class' : name
      if (allowAttr(node, attrName, value)) adapter.prop(node, name, value)
    },
    remove(node) {
      if (isOrHoldsRulesTag(adapter, node)) {
        refuse(node, 'removing this would delete the data rules tag')
        return
      }
      adapter.remove(node)
    },
    replaceWith(node, html) {
      if (html === adapter.prop(node, 'outerHTML')) return node
      refuse(node, '"@outerHTML" writes HTML, only text is allowed')
      return node
    },
    refusals,
    assertClean() {
      if (refusals.length) throw new WriteRefused(refusals.slice())
    },
  }
  return guarded
}
