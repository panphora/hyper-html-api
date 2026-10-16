import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { extract, apply } from '../src/engine/index.js'
import { applyData } from '../src/dom-api.js'
import { EmptyListInsert } from '../src/engine/errors.js'
import { finalChildCombinatorLeft } from '../src/engine/rule-syntax.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// A list whose only [cms-template] seed lives OUTSIDE its own container (the
// shared #api-seeds bank at the end of the body) used to clone the seed and
// insert the row next to it, inside the bank: `changed` was true while the list
// stayed empty, because every later read skips a seed subtree. The clone source
// and the insertion destination are separate: the seed says what a row looks
// like, the selector's container inside the current context says where rows go.

const OPT = { templateAttr: 'cms-template' }

const SEEDS =
  '<div id="api-seeds" hidden cms-template>' +
  '<ul class="lists">' +
  '<li class="list" cms-template>' +
  '<h2 class="list-title"></h2>' +
  '<ul class="cards">' +
  '<li class="card" cms-template>' +
  '<h3 class="card-title"></h3>' +
  '<ol class="comments">' +
  '<li class="comment" cms-template><span class="text"></span></li>' +
  '</ol>' +
  '<ul class="attachments">' +
  '<li class="attachment" cms-template><a class="file"></a></li>' +
  '</ul>' +
  '<section class="checklist" cms-template>' +
  '<h4 class="checklist-title"></h4>' +
  '<ul class="checklist-items">' +
  '<li class="checklist-item" cms-template><span class="label"></span></li>' +
  '</ul>' +
  '</section>' +
  '</li>' +
  '</ul>' +
  '</li>' +
  '</ul>' +
  '</div>'

const FOOTER = '<footer id="board-foot">Built</footer>'

const RULES = {
  lists: [':scope > ul.lists > li', {
    id: '@data-id',
    title: ':scope > h2.list-title',
    cards: [':scope > ul.cards > li', {
      id: '@data-id',
      title: ':scope > h3.card-title',
      comments: [':scope > ol.comments > li', { id: '@data-id', text: ':scope > span.text' }],
      attachments: [':scope > ul.attachments > li', { id: '@data-id', file: ':scope > a.file' }],
      checklists: [':scope > section.checklist', {
        id: '@data-id',
        title: ':scope > h4.checklist-title',
        items: [':scope > ul.checklist-items > li', { id: '@data-id', label: ':scope > span.label' }],
      }],
    }],
  }],
}
const LIST_SHAPE = RULES.lists[1]
const CARD_SHAPE = LIST_SHAPE.cards[1]

function card(id, title, extra = '') {
  return `<li class="card" data-id="${id}"><h3 class="card-title">${title}</h3><ol class="comments"></ol><ul class="attachments"></ul>${extra}</li>`
}

function board(cards) {
  return `<div id="board"><ul class="lists"><li class="list" data-id="l1"><h2 class="list-title">To do</h2><ul class="cards">${cards}</ul></li></ul></div>${FOOTER}`
}

function emptyBoard() {
  return `<div id="board"><ul class="lists"></ul></div>${FOOTER}`
}

function cardData(id, title, extra = {}) {
  return { id, title, comments: [], attachments: [], checklists: [], ...extra }
}

function listData(cards, id = 'l1', title = 'To do') {
  return { id, title, cards }
}

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    board: () => $('#board'),
    el: (selector) => $(selector),
    all: (selector) => $(selector).toArray(),
    outer: (selector) => ($(selector)[0] ? $.html($(selector)[0]) : null),
    text: (el) => $(el).text(),
    attr: (el, name) => $(el).attr(name),
    tags: (selector) => $(selector).children().toArray().map((el) => el.tagName),
  }
}

function jsdomCtx(html) {
  const doc = new JSDOM(html).window.document
  return {
    adapter: domAdapter,
    root: doc,
    board: () => doc.querySelector('#board'),
    el: (selector) => doc.querySelector(selector),
    all: (selector) => [...doc.querySelectorAll(selector)],
    outer: (selector) => doc.querySelector(selector)?.outerHTML ?? null,
    text: (el) => el.textContent,
    attr: (el, name) => el.getAttribute(name),
    tags: (selector) => [...doc.querySelector(selector).children].map((el) => el.tagName.toLowerCase()),
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

// The DOM half of "assert the location": the rows a card owns are the direct
// children of ITS containers, and nothing new sits in the seed bank. A card
// cloned from the seed card keeps its own inner [cms-template] row as a seed, so
// the rows a card owns are the non-seed ones.
function commentsOf(env, id) {
  return env.all(`li.card[data-id="${id}"] > ol.comments > li.comment:not([cms-template])`).map(env.text)
}
function attachmentsOf(env, id) {
  return env.all(`li.card[data-id="${id}"] > ul.attachments > li.attachment:not([cms-template])`).map(env.text)
}
function bankRows(env, selector) {
  return env.all(`#api-seeds ${selector}`).map(env.text)
}
function bankSnapshot(env) {
  return env.outer('#api-seeds')
}

for (const env of envs) {
  test(`external seed [${env.label}] — two empty cards sharing one blueprint each get their own comment`, () => {
    const ctx = env.make(board(card('c1', 'Card one') + card('c2', 'Card two')) + SEEDS)
    const before = bankSnapshot(ctx)
    const data = {
      lists: [listData([
        cardData('c1', 'Card one', { comments: [{ id: 'n1', text: 'first' }] }),
        cardData('c2', 'Card two', { comments: [{ id: 'n2', text: 'second' }] }),
      ])],
    }

    apply(ctx.adapter, ctx.board(), RULES, data, OPT)

    assert.deepEqual(commentsOf(ctx, 'c1'), ['first'])
    assert.deepEqual(commentsOf(ctx, 'c2'), ['second'])
    assert.deepEqual(
      ctx.all('li.card[data-id="c1"] > ol.comments > li.comment').map((el) => ctx.attr(el, 'data-id')),
      ['n1'],
    )
    assert.equal(bankSnapshot(ctx), before, 'the seed bank is untouched')
    assert.equal(ctx.all('#api-seeds li.comment:not([cms-template])').length, 0, 'no row was written into the bank')
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), data)
  })

  test(`external seed [${env.label}] — a comment and an attachment land in the card that was written`, () => {
    const ctx = env.make(board(card('c1', 'Card one') + card('c2', 'Card two')) + SEEDS)
    const before = bankSnapshot(ctx)
    const data = {
      lists: [listData([
        cardData('c1', 'Card one', {
          comments: [{ id: 'n1', text: 'note' }],
          attachments: [{ id: 'a1', file: 'plan.pdf' }],
        }),
        cardData('c2', 'Card two'),
      ])],
    }

    apply(ctx.adapter, ctx.board(), RULES, data, OPT)

    assert.deepEqual(commentsOf(ctx, 'c1'), ['note'])
    assert.deepEqual(attachmentsOf(ctx, 'c1'), ['plan.pdf'])
    assert.deepEqual(commentsOf(ctx, 'c2'), [])
    assert.deepEqual(attachmentsOf(ctx, 'c2'), [])
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), data)
  })

  test(`external seed [${env.label}] — two separate writes reuse the same unchanged seed`, () => {
    const ctx = env.make(board(card('c1', 'Card one') + card('c2', 'Card two')) + SEEDS)
    const before = bankSnapshot(ctx)

    const first = {
      lists: [listData([
        cardData('c1', 'Card one', { comments: [{ id: 'n1', text: 'first' }] }),
        cardData('c2', 'Card two'),
      ])],
    }
    apply(ctx.adapter, ctx.board(), RULES, first, OPT)
    assert.deepEqual(commentsOf(ctx, 'c1'), ['first'])
    assert.deepEqual(commentsOf(ctx, 'c2'), [])
    assert.equal(bankSnapshot(ctx), before)

    const second = {
      lists: [listData([
        cardData('c1', 'Card one', { comments: [{ id: 'n1', text: 'first' }] }),
        cardData('c2', 'Card two', { comments: [{ id: 'n2', text: 'second' }] }),
      ])],
    }
    apply(ctx.adapter, ctx.board(), RULES, second, OPT)

    assert.deepEqual(commentsOf(ctx, 'c1'), ['first'])
    assert.deepEqual(commentsOf(ctx, 'c2'), ['second'])
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), second)
  })

  test(`external seed [${env.label}] — an empty board, then an empty list, then an empty card`, () => {
    const ctx = env.make(emptyBoard() + SEEDS)
    const before = bankSnapshot(ctx)

    const withList = { lists: [listData([], 'l9', 'Fresh list')] }
    apply(ctx.adapter, ctx.board(), RULES, withList, OPT)

    assert.equal(ctx.all('#board > ul.lists > li.list:not([cms-template])').length, 1, 'the list went into the board container')
    assert.deepEqual(ctx.all('#board > ul.lists > li.list:not([cms-template])').map(ctx.text), ['Fresh list'])
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), withList)

    const listEl = ctx.el('#board > ul.lists > li.list:not([cms-template])')
    const withCard = listData([cardData('c9', 'Fresh card')], 'l9', 'Fresh list')
    apply(ctx.adapter, listEl, LIST_SHAPE, withCard, OPT)

    assert.deepEqual(ctx.all('#board > ul.lists > li.list > ul.cards > li.card:not([cms-template])').map(ctx.text), ['Fresh card'])
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, listEl, LIST_SHAPE, OPT), withCard)

    const cardEl = ctx.el('#board > ul.lists > li.list > ul.cards > li.card:not([cms-template])')
    const withComment = cardData('c9', 'Fresh card', { comments: [{ id: 'n9', text: 'hello' }] })
    apply(ctx.adapter, cardEl, CARD_SHAPE, withComment, OPT)

    assert.deepEqual(commentsOf(ctx, 'c9'), ['hello'])
    assert.deepEqual(
      ctx.all('li.card[data-id="c9"] > ol.comments > li.comment[cms-template]').map(ctx.text),
      [''],
      'the card keeps its own seed, and the materialized row is not it',
    )
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, cardEl, CARD_SHAPE, OPT), withComment)
  })

  test(`external seed [${env.label}] — :scope checklist with zero items, then two`, () => {
    const ctx = env.make(board(card('c1', 'Card one')) + SEEDS)
    const before = bankSnapshot(ctx)
    const emptyChecklist = { ...cardData('c1', 'Card one'), checklists: [{ id: 'k1', title: 'Steps', items: [] }] }

    apply(ctx.adapter, ctx.board(), RULES, { lists: [listData([emptyChecklist])] }, OPT)

    const sections = ctx.all('li.card[data-id="c1"] > section.checklist')
    assert.equal(sections.length, 1, 'the checklist became a direct child of the card')
    assert.deepEqual(sections.map(ctx.text), ['Steps'])
    assert.equal(ctx.all('li.card[data-id="c1"] > section.checklist > ul.checklist-items > li.checklist-item').length, 1)
    assert.equal(ctx.all('li.card[data-id="c1"] > section.checklist > ul.checklist-items > li.checklist-item:not([cms-template])').length, 0)
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), { lists: [listData([emptyChecklist])] })

    const withItems = {
      lists: [listData([{ ...emptyChecklist, checklists: [{ id: 'k1', title: 'Steps', items: [{ id: 'i1', label: 'one' }, { id: 'i2', label: 'two' }] }] }])],
    }
    apply(ctx.adapter, ctx.board(), RULES, withItems, OPT)

    const items = ctx.all('li.card[data-id="c1"] > section.checklist > ul.checklist-items > li.checklist-item:not([cms-template])')
    assert.deepEqual(items.map(ctx.text), ['one', 'two'])
    assert.deepEqual(items.map((el) => ctx.attr(el, 'data-id')), ['i1', 'i2'])
    assert.deepEqual(bankRows(ctx, 'li.checklist-item[cms-template]'), [''])
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), withItems)
  })

  test(`external seed [${env.label}] — the seed lookup keeps the rest of the selector, so a comment seed cannot fill a checklist`, () => {
    const ctx = env.make(
      board('<li class="card" data-id="c1"><h3 class="card-title">Card one</h3><ol class="comments"></ol><ul class="attachments"></ul><section class="checklist"><h4 class="checklist-title">Steps</h4><ul class="checklist-items"></ul></section></li>') + SEEDS,
    )
    const before = bankSnapshot(ctx)
    const data = { lists: [listData([{ ...cardData('c1', 'Card one'), checklists: [{ id: 'k1', title: 'Steps', items: [{ id: 'i1', label: 'one' }] }] }])] }

    apply(ctx.adapter, ctx.board(), RULES, data, OPT)

    const item = 'li.card[data-id="c1"] > section.checklist > ul.checklist-items > li.checklist-item:not([cms-template])'
    assert.deepEqual(ctx.all(item).map(ctx.text), ['one'])
    assert.equal(ctx.all(`${item} > span.label`).length, 1, 'cloned from the checklist item seed')
    assert.equal(ctx.all(`${item} > span.text`).length, 0, 'not from the comment seed')
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), data)
  })

  test(`external seed [${env.label}] — unrelated siblings and seed definitions survive`, () => {
    const ctx = env.make(board(card('c1', 'Card one', '<button class="add-comment">Add</button>') + card('c2', 'Card two')) + SEEDS)
    const before = bankSnapshot(ctx)
    const data = { lists: [listData([cardData('c1', 'Card one', { comments: [{ id: 'n1', text: 'note' }] }), cardData('c2', 'Card two')])] }

    apply(ctx.adapter, ctx.board(), RULES, data, OPT)

    assert.deepEqual(ctx.tags('li.card[data-id="c1"]'), ['h3', 'ol', 'ul', 'button'])
    assert.deepEqual(ctx.all('li.card[data-id="c1"] > button.add-comment').map(ctx.text), ['Add'])
    assert.deepEqual(ctx.all('#board + #board-foot').map(ctx.text), ['Built'])
    assert.equal(bankSnapshot(ctx), before)
    assert.deepEqual(bankRows(ctx, 'li.comment[cms-template]'), [''])
    assert.deepEqual(bankRows(ctx, 'li.attachment[cms-template]'), [''])
    assert.equal(ctx.all('#api-seeds li.checklist-item[cms-template]').length, 1)
    assert.deepEqual(extract(ctx.adapter, ctx.board(), RULES, OPT), data)
  })

  test(`external seed [${env.label}] — several containers in the context refuse the write`, () => {
    const ctx = env.make(
      board('<li class="card" data-id="c1"><h3 class="card-title">Card one</h3><ol class="comments"></ol><ol class="comments"></ol><ul class="attachments"></ul></li>') + SEEDS,
    )
    const before = bankSnapshot(ctx)
    const cardEl = ctx.el('li.card[data-id="c1"]')
    const data = { comments: [{ id: 'n1', text: 'note' }] }

    assert.throws(
      () => apply(ctx.adapter, cardEl, CARD_SHAPE, { ...cardData('c1', 'Card one', { comments: data.comments }) }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['comments'])
        assert.match(err.message, /matches 2 containers/)
        assert.match(err.message, /ol\.comments/)
        return true
      },
    )
    assert.equal(ctx.all('li.card[data-id="c1"] > ol.comments > li').length, 0)
    assert.equal(bankSnapshot(ctx), before)
  })

  test(`external seed [${env.label}] — no container in the context refuses the write`, () => {
    const ctx = env.make(board('<li class="card" data-id="c1"><h3 class="card-title">Card one</h3><ul class="attachments"></ul></li>') + SEEDS)
    const before = bankSnapshot(ctx)
    const cardEl = ctx.el('li.card[data-id="c1"]')

    assert.throws(
      () => apply(ctx.adapter, cardEl, CARD_SHAPE, { ...cardData('c1', 'Card one', { comments: [{ id: 'n1', text: 'note' }] }) }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['comments'])
        assert.match(err.message, /no container matching ":scope > ol\.comments"/)
        return true
      },
    )
    assert.equal(bankSnapshot(ctx), before)
  })

  test(`external seed [${env.label}] — a seed outside the context needs a container in the selector`, () => {
    const ctx = env.make(board(card('c1', 'Card one')) + SEEDS)
    const before = bankSnapshot(ctx)
    const cardEl = ctx.el('li.card[data-id="c1"]')
    const rules = { comments: ['.comment', { id: '@data-id', text: ':scope > span.text' }] }

    assert.throws(
      () => apply(ctx.adapter, cardEl, rules, { comments: [{ id: 'n1', text: 'note' }] }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['comments'])
        assert.match(err.message, /names no container/)
        return true
      },
    )
    assert.equal(bankSnapshot(ctx), before)
  })

  test(`external seed [${env.label}] — ":scope" at a document root has no container to insert into`, () => {
    const ctx = env.make(board(card('c1', 'Card one')) + SEEDS)
    const before = bankSnapshot(ctx)
    const beforeHtml = ctx.outer('html')

    assert.throws(
      () => apply(ctx.adapter, ctx.root, { items: [':scope > li', { name: '.n' }] }, { items: [{ name: 'x' }] }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['items'])
        assert.match(err.message, /no container matching ":scope"/)
        return true
      },
    )
    assert.equal(bankSnapshot(ctx), before)
    assert.equal(ctx.outer('html'), beforeHtml, 'nothing landed outside <html>')
  })

  test(`external seed [${env.label}] — a seed inside the list's own container still inserts next to it`, () => {
    const ctx = env.make('<div class="list"><div class="row" cms-template><span class="n"></span></div></div>')
    const rules = { items: ['.row', { name: '.n' }] }

    apply(ctx.adapter, ctx.root, rules, { items: [{ name: 'One' }, { name: 'Two' }] }, OPT)

    const real = ctx.all('.list > .row:not([cms-template])')
    assert.deepEqual(real.map(ctx.text), ['One', 'Two'])
    assert.equal(ctx.all('.list > .row[cms-template]').length, 1)
    assert.deepEqual(ctx.all('.list > .row[cms-template] > .n').map(ctx.text), [''])
  })
}

// The ">" inside a quoted attribute value is not a combinator. jsdom's own
// selector engine matches no element for such a value at all, so this end-to-end
// case runs on the cheerio adapter; the scanner itself is covered for both
// adapters by the unit test below.
test('external seed [cheerio] — a selector with a quoted ">" still names the card\'s own container', () => {
  const ctx = cheerioCtx(
    board('<li class="card" data-id="c1"><h3 class="card-title">Card one</h3><ol class="comments" data-label="a > b"></ol><ul class="attachments"></ul></li>') +
    '<div id="api-seeds" hidden cms-template><ol class="comments" data-label="a > b"><li class="comment" cms-template><span class="text"></span></li></ol></div>',
  )
  const before = bankSnapshot(ctx)
  const rules = { comments: ['ol.comments[data-label="a > b"] > li', { id: '@data-id', text: ':scope > span.text' }] }
  const data = { comments: [{ id: 'n1', text: 'quoted' }] }
  const cardEl = ctx.el('li.card[data-id="c1"]')

  apply(ctx.adapter, cardEl, rules, data, OPT)

  assert.deepEqual(ctx.all('li.card[data-id="c1"] > ol.comments > li.comment').map(ctx.text), ['quoted'])
  assert.equal(ctx.all('#api-seeds ol.comments > li.comment:not([cms-template])').length, 0)
  assert.equal(bankSnapshot(ctx), before)
  assert.deepEqual(extract(ctx.adapter, cardEl, rules, OPT), data)
})

test('a write through the guarded browser path lands the checklist in the card', () => {
  const document = new JSDOM(board(card('c1', 'Card one')) + SEEDS).window.document
  const cardEl = document.querySelector('li.card[data-id="c1"]')
  const data = { ...cardData('c1', 'Card one'), checklists: [{ id: 'k1', title: 'Steps', items: [{ id: 'i1', label: 'one' }] }] }

  applyData(cardEl, data, CARD_SHAPE)

  assert.equal(document.querySelectorAll('li.card[data-id="c1"] > section.checklist').length, 1)
  assert.deepEqual([...document.querySelectorAll('li.card[data-id="c1"] > section.checklist > ul.checklist-items > li.checklist-item:not([cms-template])')].map((el) => el.textContent), ['one'])
  assert.equal(document.querySelectorAll('#api-seeds li:not([cms-template])').length, 0)
  assert.equal(document.querySelector('#api-seeds li.checklist-item').textContent, '')
})

test('finalChildCombinatorLeft scans quotes, escapes, brackets and parens', () => {
  assert.equal(finalChildCombinatorLeft('ol.comments > li'), 'ol.comments')
  assert.equal(finalChildCombinatorLeft(':scope > ul.checklist-items > li'), ':scope > ul.checklist-items')
  assert.equal(finalChildCombinatorLeft(':scope>ul>li'), ':scope>ul')
  assert.equal(finalChildCombinatorLeft('ol.comments[data-label="a > b"] > li'), 'ol.comments[data-label="a > b"]')
  assert.equal(finalChildCombinatorLeft("ol.comments[data-label='a > b'] > li"), "ol.comments[data-label='a > b']")
  assert.equal(finalChildCombinatorLeft('ul:is(section > ul) > li'), 'ul:is(section > ul)')
  assert.equal(finalChildCombinatorLeft('ol.comments\\>x > li'), 'ol.comments\\>x')
  assert.equal(finalChildCombinatorLeft('#board > section.list[item]'), '#board')
  assert.equal(finalChildCombinatorLeft('li'), null)
  assert.equal(finalChildCombinatorLeft('ol.comments li'), null)
  assert.equal(finalChildCombinatorLeft('ol.comments > li, ul.notes > li'), null)
  assert.equal(finalChildCombinatorLeft('ol.comments > li, ul.notes'), null)
  assert.equal(finalChildCombinatorLeft('ol.comments[data-label="a, b"] > li'), 'ol.comments[data-label="a, b"]')
  assert.equal(finalChildCombinatorLeft('>'), null)
})
