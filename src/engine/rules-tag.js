import { parseStrict } from './rules.js'
import { UnknownRulesVersion } from './errors.js'

const RULES_TAG_ID = 'hyper-html-api'
const SUPPORTED_VERSION = '1'

export function findRulesIn(adapter, root) {
  const candidates = adapter.find(root, `script#${RULES_TAG_ID}`, { includeRulesTag: true })
  if (candidates.length === 0) return null

  const tagNode = candidates[0]
  const version = adapter.attr(tagNode, 'data-rules-version')
  if (version !== SUPPORTED_VERSION) throw new UnknownRulesVersion(version)

  const body = adapter.text(tagNode)
  const rules = parseStrict(body)
  return { rules, tagNode }
}
