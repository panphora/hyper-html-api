# hyper-html-api

Self-describing data layer for HTML files — a bidirectional engine that reads structured data out of an HTML page and writes structured data back into it, driven by a single declarative rules tag.

Runs in production behind [hyperclay](https://hyperclay.com), Hyperclay Local, and [`@panphora/hyper-cms`](https://github.com/panphora/hypercms), and is vendored into [hyperclayjs](https://github.com/panphora/hyperclayjs) and [clayjs](https://clayjs.com). The same rules run in the browser and in Node under cheerio, through a pluggable adapter.

## Install

```sh
npm install hyper-html-api
```

## Rules tag

Pages describe their data layer with a script tag labeled by one or more
space-separated tokens in a single `data-rules-name` attribute:

```html
<script type="application/json" data-rules-name="api cms collection" data-rules-version="1">
{
  "title": "h1",
  "user": { "name": ".user-name", "role": ".user-role" },
  "products": [".product", { "name": ".name", "price": ".price" }],
  "tags": ".tag[]"
}
</script>
```

Tokens are looked up with the CSS word-match selector
`script[data-rules-name~="<token>"]`, so a single tag can serve several roles at
once. There is no implicit unnamed tag: a consumer matches its token or finds
nothing.

## Browser API

```js
HyperHtmlApi.engine.extract(root, rules)        // → JSON
HyperHtmlApi.engine.apply(root, rules, data)    // mutates the DOM
HyperHtmlApi.engine.findRulesIn(root, token?)   // → { rules, tagNode } | null
HyperHtmlApi.engine.findRules(root, source)     // object | token → { rules, tagNode } | null
HyperHtmlApi.engine.bind(root, source, opts?)   // → { rules, tagNode, get(), set(data) }
HyperHtmlApi.engine.errors                      // error class refs
```

`bind` accepts a source that is either a literal rules object, a token string
(a tag with `data-rules-name~="token"`), and returns a small port whose `get()`
extracts data and `set(data)` writes it back. Token resolution is
document-scoped, so a tag mounted in `<head>` is found even when `bind` is given
a body or form element; `get()`/`set()` stay scoped to that element.

## Upgrade

A page that was copied from a template can pull in the template's newer
version while keeping its own data. Two meta tags opt a page in:

```html
<meta name="hyper-source" content="https://devlog.panphora.hyperclay.com">
<meta name="hyper-version" content="1.0.0">
```

`hyper-source` points at the canonical version (and doubles as identity);
`hyper-version` is a dotted version number. Forks inherit both because copying
the HTML copies the tags. Without them the upgrade subsystem is inert.

```js
HyperHtmlApi.upgrade.checkForUpdate({ force? })
// → { available, currentVersion, sourceVersion, sourceUrl } | null
// Fetches the source anonymously, reads its hyper-version, caches the result
// in localStorage for 24h. null = inert (missing tags, self-source, unreachable).

HyperHtmlApi.upgrade.extractAll(root?)
// → { dataByName, version } — keyed extraction of every rules tag on the page.

HyperHtmlApi.upgrade.run({ sourceUrl?, dataByName?, fromVersion? })
// → { html, fromVersion, toVersion, summary }
// The whole flow: extract keyed data from the live page, fetch the source's
// pristine HTML (DOMParser — its scripts never execute), evaluate its optional
// transform tag, join data into the parsed copy by exact rules-tag name, and
// serialize. Does NOT save; the caller decides how to persist `html`.
```

The join is name-match per rules tag: fields present in both carry over, fields
only in the old data are discarded (and counted in `summary`), fields only in
the new template keep its defaults, and list counts follow the old data. For
richer migrations (renames, splits, computed fields) the source declares a
transform as a non-executing script tag in its own HTML:

```html
<script type="text/hyper-upgrade">
export default function upgrade(dataByName, { fromVersion, toVersion }) {
  return {
    api: { heading: dataByName.api.title },   // rename a field
    settings: dataByName.profile,             // re-key a rules tag
  }
}
</script>
```

Browsers ignore the unknown script type, so the tag never runs on the source
page itself. The upgrading fork reads it out of the fetched copy and evaluates
it as a real ES module (Blob URL import), so it may be `async`; it must be
self-contained (relative imports won't resolve; absolute CDN imports work). At
most one per document. If it throws, the upgrade aborts and nothing is saved.

Security: the transform runs in the fork's context, but only after an explicit
upgrade action, and upgrading means adopting the source's HTML and scripts
wholesale anyway — evaluating its transform first adds no new trust. Sources
must be served with CORS open for anonymous reads (Hyperclay serves all site
HTML with `Access-Control-Allow-Origin: *`).

## Node API

```js
import { extract, apply, findRulesIn, bind, errors } from 'hyper-html-api/engine'
import cheerioAdapter from 'hyper-html-api/cheerio'
import * as cheerio from 'cheerio'

const $ = cheerio.load(html)
const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
const data = extract(cheerioAdapter, $.root(), rules)
```

## License

0BSD
