// Lean upgrade entry: the DOM-bound engine + the template-upgrade flow,
// WITHOUT cms. This is what `hyper-html-api/upgrade` exports and what
// hyperclayjs vendors for its `upgrade` module.
import { engine } from './dom-api.js'
import { checkForUpdate } from './upgrade/check.js'
import { run } from './upgrade/run.js'
import { extractAll } from './upgrade/extract-all.js'
import { shapeMatch } from './upgrade/shape-match.js'

export const upgrade = { checkForUpdate, run, extractAll, shapeMatch }
export { engine }

const HyperHtmlApiUpgrade = { engine, upgrade }
export default HyperHtmlApiUpgrade
