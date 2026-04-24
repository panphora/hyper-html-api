/**
 * Names that are read/written via the DOM/cheerio .prop() interface rather
 * than .attr(). Copied verbatim from hyperclay/server-lib/data-extractor.js
 * so the new engine preserves byte-identical output.
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

  'href',
  'src',
  'action',
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
