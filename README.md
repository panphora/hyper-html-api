# hyper-html-api

Self-describing data layer for HTML files — a bidirectional engine that reads structured data out of an HTML page and writes structured data back into it, driven by a single declarative rules tag.

Status: **early development** (Phase 0 — repo bootstrap). API shape and behavior are being ported from `hyperclay/server-lib/data-extractor.js`. See `plans/hyperclay/hyper-html-api/` in the workspace for the full specification.

## Install

```sh
npm install hyper-html-api
```

## Rules tag

Pages describe their data layer with a single script tag:

```html
<script type="application/hyper-html-api" id="hyper-html-api" data-rules-version="1">
{
  "title": "h1",
  "user": { "name": ".user-name", "role": ".user-role" },
  "products": [".product", { "name": ".name", "price": ".price" }],
  "tags": ".tag[]"
}
</script>
```

## Browser API

```js
HyperHtmlApi.engine.extract(root, rules)       // → JSON
HyperHtmlApi.engine.apply(root, rules, data)   // mutates the DOM
HyperHtmlApi.engine.findRulesIn(root)          // → { rules, tagNode } | null
HyperHtmlApi.engine.errors                     // error class refs
```

## Node API

```js
import { extract, apply, findRulesIn, errors } from 'hyper-html-api/engine'
import cheerioAdapter from 'hyper-html-api/cheerio'
import * as cheerio from 'cheerio'

const $ = cheerio.load(html)
const { rules } = findRulesIn(cheerioAdapter, $.root())
const data = extract(cheerioAdapter, $.root(), rules)
```

## License

0BSD
