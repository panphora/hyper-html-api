import { UpgradeAlreadyRegistered } from '../engine/errors.js'

let registered = null

export function registerUpgrade(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('registerUpgrade expects a function (v1Data) => v2Data')
  }
  if (registered) throw new UpgradeAlreadyRegistered()
  registered = fn
}

export function getRegisteredTransform() {
  return registered
}

export function _resetRegistryForTests() {
  registered = null
}
