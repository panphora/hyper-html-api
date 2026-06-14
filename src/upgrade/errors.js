export class UpgradeSourceUnreachable extends Error {
  constructor(url, cause) {
    super(`could not fetch upgrade source: ${url}`)
    this.name = 'UpgradeSourceUnreachable'
    this.sourceUrl = url
    this.cause = cause
  }
}

export class UpgradeSourceHasNoRules extends Error {
  constructor(url) {
    super(
      `upgrade source has no rules tags; refusing to drop all existing data: ${url}`,
    )
    this.name = 'UpgradeSourceHasNoRules'
    this.sourceUrl = url
  }
}

export class UpgradeTransformInvalid extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'UpgradeTransformInvalid'
    this.cause = cause
  }
}

export class UpgradeMultipleTransforms extends Error {
  constructor(count) {
    super(
      `found ${count} script[type="text/hyper-upgrade"] tags; only one is allowed per document.`,
    )
    this.name = 'UpgradeMultipleTransforms'
    this.count = count
  }
}
