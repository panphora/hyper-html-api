# hyper-html-api

Self-describing data layer for HTML files — a bidirectional engine that reads structured data out of an HTML page and writes structured data back into it, driven by a single declarative rules tag.

Status: **early development** (Phase 0 — repo bootstrap). API shape and behavior are being ported from `hyperclay/server-lib/data-extractor.js`. See `plans/hyperclay/hyper-html-api/` in the workspace for the full specification.

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
