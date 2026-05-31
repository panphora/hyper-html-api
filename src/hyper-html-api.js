import * as cmsMod from './cms/index.js'
import * as upgradeMod from './upgrade/index.js'
import { engine, extractData, applyData } from './dom-api.js'

const cms = {
  buildForm: cmsMod.buildForm,
  bindFormEvents: cmsMod.bindFormEvents,
  scaffold: cmsMod.scaffold,
  morphForm: cmsMod.morphForm,
  path: cmsMod.path,
}

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

// Named exports ensure the IIFE namespace exposes engine/cms/upgrade and the
// data sugar as direct properties on the `HyperHtmlApi` global, rather than
// nesting them under a `.default` key the way `export default` alone would.
export { engine, cms, upgrade, extractData, applyData }

const HyperHtmlApi = { engine, cms, upgrade, extractData, applyData }
export default HyperHtmlApi
