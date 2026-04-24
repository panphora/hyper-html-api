/**
 * Iframe-based upgrade runner.
 *
 * Loads the v2 source URL in a hidden iframe with the `_hyperHtmlApi=upgrade-helper`
 * query param. The helper inside the iframe handles transform + apply +
 * serialize; the parent only orchestrates the postMessage handshake and
 * returns the resulting HTML + summary to the caller.
 *
 *   const { html, summary } = await run({ sourceUrl, v1Data })
 *
 * The caller decides what to do with `html` (e.g. POST to `/save`, render
 * in a preview pane, etc.). The runner deliberately doesn't touch the
 * network beyond the iframe load.
 */

const DEFAULT_TIMEOUT_MS = 15000

export async function run({
  sourceUrl,
  v1Data,
  v1Version = null,
  parent = typeof window !== 'undefined' ? window : null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  hidden = true,
} = {}) {
  if (!parent) throw new Error('upgrade.run requires a window context')
  if (!sourceUrl) throw new Error('upgrade.run requires sourceUrl')

  const helperUrl = buildHelperUrl(sourceUrl, parent.location.origin)
  const expectedOrigin = new URL(helperUrl, parent.location.href).origin

  const iframe = parent.document.createElement('iframe')
  if (hidden) {
    iframe.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;border:0;'
  }
  iframe.setAttribute('aria-hidden', 'true')
  iframe.src = helperUrl
  parent.document.body.appendChild(iframe)

  let cleanup = () => {}
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`upgrade.run: helper iframe timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      const onMessage = (e) => {
        if (e.source !== iframe.contentWindow) return
        if (e.origin !== expectedOrigin) return
        const msg = e.data
        if (!msg || typeof msg !== 'object') return

        if (msg.type === 'hha:upgrade-ready') {
          iframe.contentWindow.postMessage(
            { type: 'hha:upgrade-data', v1Data, v1Version },
            expectedOrigin,
          )
          return
        }
        if (msg.type === 'hha:upgrade-result') {
          clearTimeout(timer)
          resolve({ html: msg.html, summary: msg.summary })
          return
        }
        if (msg.type === 'hha:upgrade-error') {
          clearTimeout(timer)
          const err = new Error(msg.message || 'helper error')
          err.name = msg.name || 'UpgradeHelperError'
          reject(err)
          return
        }
      }

      parent.addEventListener('message', onMessage)
      cleanup = () => {
        parent.removeEventListener('message', onMessage)
        clearTimeout(timer)
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }
    })
  } finally {
    cleanup()
  }
}

function buildHelperUrl(sourceUrl, parentOrigin) {
  const url = new URL(sourceUrl, typeof location !== 'undefined' ? location.href : undefined)
  url.searchParams.set('_hyperHtmlApi', 'upgrade-helper')
  url.searchParams.set('parentOrigin', parentOrigin)
  return url.toString()
}
