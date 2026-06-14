import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'

import { migrateInto } from '../src/upgrade/migrate.js'
import { shapeMatch } from '../src/upgrade/shape-match.js'
import cheerioAdapter from '../src/adapters/cheerio.js'

function load(html) {
  return cheerio.load(html)
}

const V2_HTML = `
<script data-rules-name="api" data-rules-version="1">
  {"heading":"h1","products":[".product",{"name":".name","price":".price","blurb":".blurb"}]}
</script>
<script data-rules-name="settings" data-rules-version="1">{"ownerName":".owner-name"}</script>
<h1>New Store</h1>
<div class="products">
  <div class="product"><span class="name">Sample</span><span class="price">$0</span><span class="blurb">default</span></div>
</div>
<div class="owner-name">Nobody</div>
`

test('migrateInto: exact-name join applies matching entries', () => {
  const $ = load(V2_HTML)
  const { totals, byName, rulesTagCount } = migrateInto(cheerioAdapter, $.root(), {
    api: {
      heading: 'My Store',
      products: [
        { name: 'Apple', price: '$1' },
        { name: 'Banana', price: '$2' },
      ],
    },
    settings: { ownerName: 'David' },
  })

  assert.equal($('h1').text(), 'My Store')
  assert.equal($('.product').length, 2)
  assert.equal($('.product').eq(0).find('.name').text(), 'Apple')
  assert.equal($('.product').eq(1).find('.price').text(), '$2')
  assert.equal($('.owner-name').text(), 'David')
  assert.equal(rulesTagCount, 2)
  assert.equal(totals.listItems, 2)
  assert.equal(byName.api.carriedOver > 0, true)
  assert.equal(byName.settings.carriedOver, 1)
})

test('migrateInto: v2 fields with no v1 data keep template defaults', () => {
  const $ = load(V2_HTML)
  migrateInto(cheerioAdapter, $.root(), {
    api: { heading: 'Mine', products: [{ name: 'Solo', price: '$9' }] },
    settings: { ownerName: 'D' },
  })
  assert.equal($('.product').eq(0).find('.blurb').text(), 'default')
})

test('migrateInto: v2 tag with no matching v1 entry stays untouched', () => {
  const $ = load(V2_HTML)
  const { byName } = migrateInto(cheerioAdapter, $.root(), {
    api: { heading: 'Only api', products: [] },
  })
  assert.equal($('.owner-name').text(), 'Nobody')
  assert.deepEqual(byName.settings, { carriedOver: 0, discarded: 0, listItems: 0 })
})

test('migrateInto: v1-only entries are counted as discarded', () => {
  const $ = load(V2_HTML)
  const { totals } = migrateInto(cheerioAdapter, $.root(), {
    api: { heading: 'X', products: [] },
    legacy: { a: '1', b: { c: '2', d: '3' } },
  })
  assert.equal(totals.discarded, 3)
})

test('migrateInto: zero rules tags reports rulesTagCount 0 and applies nothing', () => {
  const $ = load('<h1>Plain</h1>')
  const { rulesTagCount, totals } = migrateInto(cheerioAdapter, $.root(), {
    api: { heading: 'X' },
  })
  assert.equal(rulesTagCount, 0)
  assert.equal($('h1').text(), 'Plain')
  assert.equal(totals.discarded, 1)
})

test('shapeMatch: object in a scalar slot is dropped, not carried', () => {
  const { data, summary } = shapeMatch(
    { title: { nested: 'oops', deep: 'x' } },
    { title: 'h1' },
  )
  assert.equal(data.title, undefined)
  assert.equal(summary.carriedOver, 0)
  assert.equal(summary.discarded, 2)
})
