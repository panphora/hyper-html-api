/**
 * Names that are read via the DOM/cheerio .prop() interface rather than
 * .attr(). The original allowlist is preserved for read parity with the
 * legacy hyperclay/server-lib/data-extractor.js, with two exceptions
 * (`href`, `src`, `action`) that are now READ via .attr() too so the
 * round-trip stays byte-stable (writes always go through .attr() for these
 * — see DOM_PROPERTIES_WRITE_SET).
 */
export const DOM_PROPERTIES = [
  'textContent',
  'innerText',
  'innerHTML',
  'outerHTML',

  'value',
  'checked',
  'selected',
  'disabled',
  'readOnly',
  'type',

  'tagName',
  'nodeName',
  'nodeType',
  'nodeValue',
  'childElementCount',

  'id',
  'className',
  'classList',

  'baseURI',

  'offsetWidth',
  'offsetHeight',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',

  'dataset',

  'currentSrc',
  'duration',
  'paused',

  'title',
  'documentURI',
  'contentType',
]

export const DOM_PROPERTIES_SET = new Set(DOM_PROPERTIES)

/**
 * Subset of DOM_PROPERTIES that is safe to WRITE via .prop(). Everything
 * else routes through .attr() (literal attribute) or throws
 * RuleTargetReadOnly. Notably absent: href/src/action (URL normalization)
 * and outerHTML (handled via adapter.replaceWith).
 */
export const DOM_PROPERTIES_WRITE_SET = new Set([
  'textContent',
  'innerText',
  'innerHTML',
  'value',
  'checked',
  'selected',
  'disabled',
  'readOnly',
  'type',
  'id',
  'className',
  'title',
])

/**
 * Props that throw on write (DOM enforces read-only, our engine catches
 * before reaching the adapter so the error type is consistent).
 */
export const DOM_PROPERTIES_READ_ONLY_SET = new Set([
  'tagName',
  'nodeName',
  'nodeType',
  'nodeValue',
  'childElementCount',
  'classList',
  'baseURI',
  'documentURI',
  'contentType',
  'offsetWidth',
  'offsetHeight',
  'clientWidth',
  'clientHeight',
  'scrollWidth',
  'scrollHeight',
  'currentSrc',
  'duration',
  'paused',
  'dataset',
])
