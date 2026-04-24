export class RulesParseError extends Error {
  constructor(message, originalError) {
    super(message)
    this.name = 'RulesParseError'
    this.cause = originalError
  }
}

export class UnknownRulesVersion extends Error {
  constructor(version) {
    super(`unknown rules version: ${version}. Library supports "1".`)
    this.name = 'UnknownRulesVersion'
    this.version = version
  }
}

export class MaxRuleDepthExceeded extends Error {
  constructor(path) {
    super(`rule depth exceeded 20 at path: ${path.join('.')}`)
    this.name = 'MaxRuleDepthExceeded'
    this.path = path
  }
}

export class ShapeMismatch extends Error {
  constructor(mismatches) {
    super(`shape mismatch: ${mismatches.length} field(s) failed validation`)
    this.name = 'ShapeMismatch'
    this.mismatches = mismatches
  }
}

export class EmptyListInsert extends Error {
  constructor(path) {
    super(
      `cannot add items to empty list at "${path.join('.')}" — no sibling to clone as template. Seed the list with a hidden item first.`,
    )
    this.name = 'EmptyListInsert'
    this.path = path
  }
}

export class UpgradeAlreadyRegistered extends Error {
  constructor() {
    super('upgrade transform already registered; only one registration is allowed per page.')
    this.name = 'UpgradeAlreadyRegistered'
  }
}
