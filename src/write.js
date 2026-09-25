import cheerioAdapter from './adapters/cheerio.js'
import { apply } from './engine/apply.js'
import { findRulesIn } from './engine/rules-tag.js'
import { guardAdapter } from './engine/write-policy.js'
import { planWrite } from './engine/write-plan.js'
import { trackAdapter, spliceDocument } from './engine/splice.js'
import { NoRulesTag, WriteRejected } from './engine/errors.js'

// Applies a JSON body to a document's source through the document's own rules
// tag, under the content-only policy. `load` is cheerio.load, passed in so this
// package keeps cheerio out of its browser bundles. Returns the new source and
// whether anything changed. Throws NoRulesTag, WriteRejected, WriteRefused,
// ShapeMismatch or EmptyListInsert, always before producing any output.
export function writeDocument(load, src, data, { token = 'api' } = {}) {
  const $ = load(src, { sourceCodeLocationInfo: true })
  const root = $.root()
  const found = findRulesIn(cheerioAdapter, root, token)
  if (!found) throw new NoRulesTag(token)
  const { rules } = found
  const plan = planWrite(cheerioAdapter, root, rules, data)
  if (plan.unknownKeys.length || plan.unmatched.length) throw new WriteRejected(plan.unknownKeys, plan.unmatched)
  const tracker = trackAdapter(cheerioAdapter)
  const guarded = guardAdapter(tracker)
  apply(guarded, root, rules, data, { templateAttr: 'cms-template' })
  guarded.assertClean()
  if (tracker.dirty.size === 0) return { html: src, changed: false, spliced: true }
  const { html, spliced } = spliceDocument(load, src, $, tracker)
  return { html, changed: html !== src, spliced }
}
