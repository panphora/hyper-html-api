import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as cheerio from 'cheerio'

import { writeDocument } from '../src/write.js'
import { extract, findRulesIn } from '../src/engine/index.js'
import cheerioAdapter from '../src/adapters/cheerio.js'

// The real Kanban app's saved markup, frozen with the rules tag and the seed bank it
// will adopt: one list seed inside #board, one label seed inside ul.label-defs, one
// person seed inside [clay-people], and #api-seeds holding a card seed whose own
// children seed a checklist, an item, a comment and an attachment. The card seed sits
// in an ol.cards inside the bank because the card selector names that container, and
// the fallback template lookup has to find it from an emptied list.
const load = cheerio.load
const OPT = { templateAttr: 'cms-template' }
const FIXTURE = fs.readFileSync(new URL('./fixtures/kanban-seeds.html', import.meta.url), 'utf8')
const BANK = bankOf(FIXTURE)

function read(src) {
  const $ = load(src)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  return extract(cheerioAdapter, $.root(), rules, OPT)
}

function bankOf(html) {
  return html.slice(html.indexOf('<div id="api-seeds"'), html.indexOf('</body>'))
}

const BASE = read(FIXTURE)
const copy = (value) => JSON.parse(JSON.stringify(value))
const allCards = (data) => data.lists.flatMap((list) => list.cards)
const cardOf = (data, id) => allCards(data).find((card) => card.id === id)
const card = (id, num, title) => ({
  id, num, title, desc: null, labels: null, cover: null, coverImage: null,
  due: null, start: null, complete: null, members: null,
  checklists: [], comments: [], attachments: [],
})

function roundTrip(data, src = FIXTURE) {
  const result = writeDocument(load, src, data)
  assert.deepEqual(read(result.html), data)
  return result
}

test('the fixture reads as 5 lists, 14 cards and 6 label definitions, with every seed excluded', () => {
  assert.equal(BASE.boardName, 'Launch Plan')
  assert.equal(BASE.nextCard, '15')
  assert.equal(BASE.lists.length, 5)
  assert.equal(allCards(BASE).length, 14)
  assert.equal(BASE.labelDefs.length, 6)
  assert.deepEqual(BASE.people, [])
  assert.deepEqual(BASE.lists.map((list) => list.id), ['l-ideas', 'l-todo', 'l-doing', 'l-review', 'l-done'])
  assert.deepEqual(BASE.lists.map((list) => list.cards.length), [3, 4, 2, 2, 3])
  assert.equal(BASE.lists.some((list) => !list.id || !list.title), false)
  assert.equal(allCards(BASE).some((c) => !c.id || !c.title), false)
  assert.equal(BASE.labelDefs.some((label) => !label.id || !label.name), false)

  const $ = load(FIXTURE)
  assert.equal($('#board > section.list[cms-template]').length, 1)
  assert.equal($('#board-meta ul.label-defs > li[cms-template]').length, 1)
  assert.equal($('[clay-people] > data[cms-template]').length, 1)
  assert.equal($('#api-seeds li.card[cms-template]').length, 1)
  assert.equal($('#api-seeds section.checklist[cms-template]').length, 1)
  assert.equal($('#api-seeds ul.checklist-items > li[cms-template]').length, 1)
  assert.equal($('#api-seeds ol.comments > li[cms-template]').length, 1)
  assert.equal($('#api-seeds ul.attachments > li[cms-template]').length, 1)
})

test('an unchanged write is a byte-for-byte no-op', () => {
  const result = writeDocument(load, FIXTURE, BASE)
  assert.equal(result.changed, false)
  assert.equal(result.html, FIXTURE)
})

test('exactly the completed cards and the checked items stay complete', () => {
  const complete = allCards(BASE).filter((c) => c.complete === '').map((c) => c.id)
  const done = allCards(BASE).flatMap((c) => c.checklists).flatMap((k) => k.items).filter((i) => i.done === '').map((i) => i.id)
  assert.deepEqual(complete, ['c-n4z7b2'])
  assert.deepEqual(done, ['i-s05', 'i-s06', 'i-s07', 'i-s10', 'i-s11', 'i-s12', 'i-s13'])
  for (const c of allCards(BASE)) assert.equal(c.complete, c.id === 'c-n4z7b2' ? '' : null)
  for (const k of allCards(BASE).flatMap((c) => c.checklists)) {
    for (const i of k.items) assert.equal(i.done, done.includes(i.id) ? '' : null)
  }

  const $ = load(FIXTURE)
  assert.deepEqual($('#board li.card[data-complete]').map((i, el) => $(el).attr('data-id')).get(), complete)
  assert.deepEqual($('#board li[data-done]').map((i, el) => $(el).attr('data-id')).get(), done)
  assert.equal(roundTrip(BASE).changed, false)
})

test('a card can be completed and uncompleted again', () => {
  const on = copy(BASE)
  cardOf(on, 'c-k3v9q2').complete = ''
  const marked = roundTrip(on)
  assert.equal(load(marked.html)('li.card[data-id="c-k3v9q2"]').attr('data-complete'), '')

  const off = copy(read(marked.html))
  cardOf(off, 'c-k3v9q2').complete = null
  const cleared = roundTrip(off, marked.html)
  assert.equal(load(cleared.html)('li.card[data-id="c-k3v9q2"]').attr('data-complete'), undefined)
  assert.equal(load(cleared.html)('li.card[data-id="c-n4z7b2"]').attr('data-complete'), '')
})

test('a card moves to another list', () => {
  const data = copy(BASE)
  const moved = data.lists[0].cards.shift()
  data.lists[1].cards.push(moved)
  const result = roundTrip(data)
  const $ = load(result.html)
  assert.equal($(`#board > section.list[data-id="l-ideas"] > ol.cards > li.card[data-id="${moved.id}"]`).length, 0)
  assert.equal($(`#board > section.list[data-id="l-todo"] > ol.cards > li.card[data-id="${moved.id}"]`).length, 1)
  assert.deepEqual($('#board > section.list:not([cms-template]) > ol.cards > li.card').map((i, el) => $(el).attr('data-id')).get(), allCards(data).map((c) => c.id))
})

test('a list is renamed, a tone changes and the lists reorder', () => {
  const renamed = copy(BASE)
  renamed.lists[2].title = 'In progress'
  const first = roundTrip(renamed)
  assert.equal(load(first.html)('#board > section.list[data-id="l-doing"] > h2.list-title').text(), 'In progress')

  const toned = copy(read(first.html))
  toned.lists[3].tone = '5'
  const second = roundTrip(toned, first.html)
  assert.equal(load(second.html)('#board > section.list[data-id="l-review"]').attr('data-tone'), '5')

  const reordered = copy(read(second.html))
  reordered.lists.reverse()
  const third = roundTrip(reordered, second.html)
  const $ = load(third.html)
  assert.deepEqual($('#board > section.list:not([cms-template])').map((i, el) => $(el).attr('data-id')).get(), reordered.lists.map((list) => list.id))
  assert.equal($('#board > section.list[data-id="l-ideas"] > h2.list-title').text(), 'Ideas')
})

test('the first comment lands in a card that had none', () => {
  const data = copy(BASE)
  const target = cardOf(data, 'c-k3v9q2')
  assert.deepEqual(target.comments, [])
  target.comments.push({ id: 'm-1', by: 'p-1', at: '2026-01-02T03:04:05.000Z', edited: null, text: 'Ship it' })
  const result = roundTrip(data)
  const $ = load(result.html)
  const rows = $('li.card[data-id="c-k3v9q2"] > ol.comments > li')
  assert.equal(rows.length, 1)
  assert.equal(rows.text(), 'Ship it')
  assert.equal(rows.attr('data-id'), 'm-1')
  assert.equal($('#api-seeds ol.comments > li:not([cms-template])').length, 0)
  assert.equal(bankOf(result.html), BANK)
})

test('the first attachment lands in a different card that had none', () => {
  const data = copy(BASE)
  const target = cardOf(data, 'c-p8d2m4')
  assert.deepEqual(target.attachments, [])
  target.attachments.push({ id: 'a-9', name: 'Notes.txt', href: 'https://example.com/notes.txt', kind: 'file' })
  const result = roundTrip(data)
  const $ = load(result.html)
  const rows = $('li.card[data-id="c-p8d2m4"] > ul.attachments > li')
  assert.equal(rows.length, 1)
  assert.equal(rows.attr('data-id'), 'a-9')
  assert.equal(rows.children('a').text(), 'Notes.txt')
  assert.equal(rows.children('a').attr('href'), 'https://example.com/notes.txt')
  assert.equal(rows.children('a').attr('data-kind'), 'file')
  assert.equal($('#api-seeds ul.attachments > li:not([cms-template])').length, 0)
  assert.equal(bankOf(result.html), BANK)
})

test('a first checklist and then its first item land in a card that had neither', () => {
  const data = copy(BASE)
  const target = cardOf(data, 'c-b6h1r8')
  assert.deepEqual(target.checklists, [])
  target.checklists.push({ id: 'k-new', name: 'Steps', items: [] })
  const first = roundTrip(data)
  const $first = load(first.html)
  assert.equal($first('li.card[data-id="c-b6h1r8"] > section.checklist[data-id="k-new"]').length, 1)
  assert.equal($first('li.card[data-id="c-b6h1r8"] > section.checklist[data-id="k-new"] > h4').text(), 'Steps')
  assert.equal($first('#api-seeds section.checklist:not([cms-template])').length, 0)
  assert.equal(bankOf(first.html), BANK)

  const next = copy(read(first.html))
  cardOf(next, 'c-b6h1r8').checklists[0].items.push({ id: 'i-new', text: 'First step', done: null, member: null })
  const second = roundTrip(next, first.html)
  const $second = load(second.html)
  const rows = $second('li.card[data-id="c-b6h1r8"] > section.checklist[data-id="k-new"] > ul.checklist-items > li:not([cms-template])')
  assert.equal(rows.length, 1)
  assert.equal(rows.text(), 'First step')
  assert.equal($second('#api-seeds ul.checklist-items > li:not([cms-template])').length, 0)
  assert.equal(bankOf(second.html), BANK)
})

test('every card in one list is deleted and one is added back', () => {
  const emptied = copy(BASE)
  emptied.lists[0].cards = []
  const first = roundTrip(emptied)
  assert.equal(load(first.html)('#board > section.list[data-id="l-ideas"] > ol.cards > li.card').length, 0)

  const next = copy(read(first.html))
  next.lists[0].cards.push(card('c-new', '15', 'Fresh card'))
  const second = roundTrip(next, first.html)
  const $ = load(second.html)
  const rows = $('#board > section.list[data-id="l-ideas"] > ol.cards > li.card')
  assert.equal(rows.length, 1)
  assert.equal(rows.attr('data-id'), 'c-new')
  assert.equal(rows.children('h3.card-title').text(), 'Fresh card')
  assert.equal($('#api-seeds ol.cards > li.card:not([cms-template])').length, 0)
  assert.equal(bankOf(second.html), BANK)
})

test('every label is removed and one is added', () => {
  const emptied = copy(BASE)
  emptied.labelDefs = []
  const first = roundTrip(emptied)
  assert.equal(load(first.html)('#board-meta ul.label-defs > li:not([cms-template])').length, 0)

  const next = copy(read(first.html))
  next.labelDefs.push({ id: 't-1', color: 'green', name: 'Idea' })
  const second = roundTrip(next, first.html)
  const $ = load(second.html)
  const rows = $('#board-meta ul.label-defs > li:not([cms-template])')
  assert.equal(rows.length, 1)
  assert.equal(rows.attr('data-id'), 't-1')
  assert.equal(rows.attr('data-color'), 'green')
  assert.equal(rows.text(), 'Idea')
})

test('the people registry is emptied and one person is added', () => {
  const added = copy(BASE)
  added.people.push({ id: 'p-1', name: 'Dana' })
  const first = roundTrip(added)
  assert.equal(load(first.html)('[clay-people] > data[value="p-1"]').text(), 'Dana')

  const emptied = copy(read(first.html))
  emptied.people = []
  const second = roundTrip(emptied, first.html)
  assert.equal(load(second.html)('[clay-people] > data:not([cms-template])').length, 0)

  const next = copy(read(second.html))
  next.people.push({ id: 'p-2', name: 'Sam' })
  const third = roundTrip(next, second.html)
  const rows = load(third.html)('[clay-people] > data:not([cms-template])')
  assert.equal(rows.length, 1)
  assert.equal(rows.attr('value'), 'p-2')
  assert.equal(rows.text(), 'Sam')
})

test('a 14-card no-op write and a full rewrite both finish', () => {
  const rewritten = copy(BASE)
  rewritten.boardName = 'Launch Plan 2027'
  rewritten.lists.forEach((list, n) => { list.title = `${list.title} ${n}` })
  rewritten.lists.forEach((list) => list.cards.forEach((c) => { c.title = `${c.title} (v2)` }))
  rewritten.lists[4].cards.push(card('c-15', '15', 'Brand new'))
  rewritten.labelDefs.push({ id: 't-1', color: 'green', name: 'Idea' })
  rewritten.people.push({ id: 'p-1', name: 'Dana' })
  assert.equal(writeDocument(load, FIXTURE, rewritten).changed, true)

  const median = (run) => {
    const times = []
    for (let i = 0; i < 5; i++) {
      const started = process.hrtime.bigint()
      run()
      times.push(Number(process.hrtime.bigint() - started) / 1e6)
    }
    times.sort((a, b) => a - b)
    return times[2]
  }

  const noop = median(() => writeDocument(load, FIXTURE, BASE))
  const full = median(() => writeDocument(load, FIXTURE, rewritten))
  console.log(`kanban fixture: 14-card no-op write ${noop.toFixed(1)}ms, full rewrite ${full.toFixed(1)}ms`)
})
