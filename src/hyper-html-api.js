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
  checkForUpdate: upgradeMod.checkForUpdate,
  run: upgradeMod.run,
  extractAll: upgradeMod.extractAll,
  shapeMatch: upgradeMod.shapeMatch,
}

// Named exports ensure the IIFE namespace exposes engine/cms/upgrade and the
// data sugar as direct properties on the `HyperHtmlApi` global, rather than
// nesting them under a `.default` key the way `export default` alone would.
export { engine, cms, upgrade, extractData, applyData }

const HyperHtmlApi = { engine, cms, upgrade, extractData, applyData }
export default HyperHtmlApi
