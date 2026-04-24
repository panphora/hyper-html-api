import * as engineMod from './engine/index.js'
import domAdapter from './adapters/dom.js'

const engine = {
  extract: (root, rules) => engineMod.extract(domAdapter, root, rules),
  apply: (root, rules, data) => engineMod.apply(domAdapter, root, rules, data),
  findRulesIn: (root) => engineMod.findRulesIn(domAdapter, root),
  parseStrict: engineMod.parseStrict,
  parseRelaxed: engineMod.parseRelaxed,
  errors: engineMod.errors,
  DOM_PROPERTIES: engineMod.DOM_PROPERTIES,
}

const cms = {}
const upgrade = {}

// Named exports ensure the IIFE namespace exposes engine/cms/upgrade as direct
// properties on the `HyperHtmlApi` global, rather than nesting them under a
// `.default` key the way `export default` alone would.
export { engine, cms, upgrade }

const HyperHtmlApi = { engine, cms, upgrade }
export default HyperHtmlApi
