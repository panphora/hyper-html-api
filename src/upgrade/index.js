export { checkForUpdate, readMeta, parseVersion, isNewerVersion } from './check.js'
export { extractAll, extractAllFrom } from './extract-all.js'
export { findTransformTag, evaluateTransform, TRANSFORM_TYPE } from './transform.js'
export { migrateInto } from './migrate.js'
export { run } from './run.js'
export { shapeMatch, countScalarLeaves } from './shape-match.js'
export { collectRulesTags, normalizeName } from './rules-tags.js'
export {
  UpgradeSourceUnreachable,
  UpgradeSourceHasNoRules,
  UpgradeTransformInvalid,
  UpgradeMultipleTransforms,
} from './errors.js'
