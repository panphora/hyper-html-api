import * as engineMod from './engine/index.js'
import * as upgradeMod from './upgrade/index.js'
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

const upgrade = {
  registerUpgrade: upgradeMod.registerUpgrade,
  run: upgradeMod.run,
  shapeMatch: upgradeMod.shapeMatch,
  isHelperMode: upgradeMod.isHelperMode,
}

// Helper-mode auto-boot: when the library loads inside an iframe whose URL
// carries `?_hyperHtmlApi=upgrade-helper`, we wire up the postMessage handshake
// immediately so authors don't have to add any boot code themselves. Their
// `registerUpgrade(...)` calls (which run inline as v2's scripts execute) are
// captured by the registry before the handshake message fires.
if (typeof window !== 'undefined' && upgradeMod.isHelperMode(window.location)) {
  upgradeMod.bootHelper({ win: window, doc: document })
}

// Named exports ensure the IIFE namespace exposes engine/cms/upgrade as direct
// properties on the `HyperHtmlApi` global, rather than nesting them under a
// `.default` key the way `export default` alone would.
export { engine, cms, upgrade }

const HyperHtmlApi = { engine, cms, upgrade }
export default HyperHtmlApi
