import * as engineMod from './engine/index.js'
import domAdapter from './adapters/dom.js'

const engine = {
  extract: (root, rules) => engineMod.extract(domAdapter, root, rules),
  findRulesIn: (root) => engineMod.findRulesIn(domAdapter, root),
  parseStrict: engineMod.parseStrict,
  parseRelaxed: engineMod.parseRelaxed,
  errors: engineMod.errors,
  DOM_PROPERTIES: engineMod.DOM_PROPERTIES,
}

const HyperHtmlApi = { engine, cms: {}, upgrade: {} }

export default HyperHtmlApi
