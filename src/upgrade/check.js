/**
 * Load-time update check. Reads the page's hyper-source / hyper-version meta
 * tags, fetches the source anonymously, and compares versions. Results are
 * cached in localStorage for 24 hours, keyed by source + current version so
 * a fresh check happens immediately after an upgrade.
 *
 * Returns null whenever the subsystem should stay inert: missing meta tags,
 * the page IS the canonical source, an unreachable/private source, or
 * unparseable versions. Callers (the popover UI) never need to distinguish
 * these cases.
 */

const CHECK_TTL_MS = 24 * 60 * 60 * 1000
const CHECK_KEY_PREFIX = 'hha:upgrade-check:'

export function readMeta(doc, name) {
  const el = doc.querySelector(`meta[name="${name}"]`)
  const content = el ? el.getAttribute('content') : null
  return content && content.trim() ? content.trim() : null
}

export function parseVersion(v) {
  if (typeof v !== 'string') return null
  const cleaned = v.trim().replace(/^v/, '')
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null
  return cleaned.split('.').map(Number)
}

export function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return false
}

function storageGet(key) {
  try {
    const raw = globalThis.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storageSet(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode): every check is uncached */
  }
}

export async function checkForUpdate({
  force = false,
  doc,
  loc,
  fetchFn,
  now,
  ttlMs = CHECK_TTL_MS,
} = {}) {
  doc = doc || (typeof document !== 'undefined' ? document : null)
  loc = loc || (typeof location !== 'undefined' ? location : null)
  fetchFn = fetchFn || ((url) => fetch(url))
  now = now ?? Date.now()
  if (!doc) return null

  const sourceUrl = readMeta(doc, 'hyper-source')
  if (!sourceUrl) return null
  const currentVersion = readMeta(doc, 'hyper-version')

  let source
  try {
    source = new URL(sourceUrl, loc ? loc.href : undefined)
  } catch {
    return null
  }
  // Self-source guard: the canonical page carries a self-pointing
  // hyper-source; it must never offer to upgrade from itself.
  if (loc && source.origin === loc.origin && source.pathname === loc.pathname) {
    return null
  }

  const cacheKey = `${CHECK_KEY_PREFIX}${source.href}:${currentVersion || 'none'}`
  let sourceVersion
  const cached = force ? null : storageGet(cacheKey)
  if (cached && typeof cached.checkedAt === 'number' && now - cached.checkedAt < ttlMs) {
    sourceVersion = cached.sourceVersion
  } else {
    try {
      const res = await fetchFn(source.href)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const sourceDoc = new DOMParser().parseFromString(text, 'text/html')
      sourceVersion = readMeta(sourceDoc, 'hyper-version')
    } catch {
      sourceVersion = null
    }
    storageSet(cacheKey, { checkedAt: now, sourceVersion })
  }

  if (!sourceVersion) return null
  return {
    // A fork without a hyper-version predates versioning: any source version
    // counts as newer.
    available: isNewerVersion(sourceVersion, currentVersion || '0.0.0'),
    currentVersion,
    sourceVersion,
    sourceUrl: source.href,
  }
}
