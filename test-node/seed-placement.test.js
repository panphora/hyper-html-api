import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { JSDOM } from 'jsdom'

import { apply, extract, findRulesIn } from '../src/engine/index.js'
import { applyData, extractData } from '../src/dom-api.js'
import { writeDocument } from '../src/write.js'
import { EmptyListInsert } from '../src/engine/errors.js'
import cheerioAdapter from '../src/adapters/cheerio.js'
import domAdapter from '../src/adapters/dom.js'

// A list that grows from zero clones a seed and then has to place the row where
// the list lives. An inline seed knows its own list; an external seed needs the
// selector to name the container. These pin both, plus the two shapes the
// destination and the seed lookup got wrong: a selector whose last ">" trails a
// descendant or sibling combinator, and a stripped ":scope >" that let any seed
// in any ancestor answer for this list.

const OPT = { templateAttr: 'cms-template' }
const tag = (rules) =>
  `<script type="application/json" data-rules-name="api" data-rules-version="1">${JSON.stringify(rules)}</script>`

function cheerioCtx(html) {
  const $ = cheerio.load(html)
  return {
    adapter: cheerioAdapter,
    root: $.root(),
    el: (selector) => $(selector),
    all: (selector) => $(selector).toArray(),
    text: (el) => $(el).text().trim(),
    attr: (el, name) => $(el).attr(name),
  }
}

function jsdomCtx(html) {
  const doc = new JSDOM(html).window.document
  return {
    adapter: domAdapter,
    root: doc,
    el: (selector) => doc.querySelector(selector),
    all: (selector) => [...doc.querySelectorAll(selector)],
    text: (el) => el.textContent.trim(),
    attr: (el, name) => el.getAttribute(name),
  }
}

const envs = [
  { label: 'cheerio', make: cheerioCtx },
  { label: 'jsdom', make: jsdomCtx },
]

const readCheerio = (html) => {
  const $ = cheerio.load(html)
  const { rules } = findRulesIn(cheerioAdapter, $.root(), 'api')
  return extract(cheerioAdapter, $.root(), rules)
}

for (const env of envs) {
  test(`seed placement [${env.label}] — ".groups > ul li" clones into the seed's own ul`, () => {
    const rules = { items: ['.groups > ul li', '.'] }
    const html = tag(rules) + '<section class="groups"><ul><li cms-template>seed</li></ul></section>'
    const ctx = env.make(html)

    apply(ctx.adapter, ctx.root, rules, { items: ['new'] }, OPT)

    assert.deepEqual(ctx.all('.groups > ul > li:not([cms-template])').map(ctx.text), ['new'])
    assert.deepEqual(ctx.all('.groups > ul > li').map(ctx.text), ['new', 'seed'], 'the seed keeps its place')
    assert.equal(ctx.all('.groups > li').length, 0, 'nothing landed in the section itself')
    assert.deepEqual(extract(ctx.adapter, ctx.root, rules, OPT), { items: ['new'] })
  })

  test(`seed placement [${env.label}] — ".groups > ul + ol li" clones into the seed's own ol`, () => {
    const rules = { items: ['.groups > ul + ol li', '.'] }
    const html = tag(rules) + '<section class="groups"><ul></ul><ol><li cms-template>seed</li></ol></section>'
    const ctx = env.make(html)

    apply(ctx.adapter, ctx.root, rules, { items: ['new'] }, OPT)

    assert.deepEqual(ctx.all('.groups > ol > li:not([cms-template])').map(ctx.text), ['new'])
    assert.equal(ctx.all('.groups > ul > li').length, 0)
    assert.deepEqual(extract(ctx.adapter, ctx.root, rules, OPT), { items: ['new'] })
  })

  test(`seed placement [${env.label}] — ".card > .tag" keeps an inline seed's own parent`, () => {
    const rules = { tags: ['.card > .tag', { name: '.' }] }
    const html = tag(rules) + '<div class="card"><h3>T</h3><span class="tag" cms-template></span></div>'
    const ctx = env.make(html)
    const cardEl = ctx.el('.card')

    apply(ctx.adapter, cardEl, rules, { tags: [{ name: 'x' }] }, OPT)

    assert.deepEqual(ctx.all('.card > .tag:not([cms-template])').map(ctx.text), ['x'])
    assert.deepEqual(extract(ctx.adapter, cardEl, rules, OPT), { tags: [{ name: 'x' }] })
  })

  test(`seed placement [${env.label}] — "ul > li" writes into the seed's list, not the empty ul beside it`, () => {
    const rules = { todos: ['ul > li', { text: '.' }] }
    const html = tag(rules) + '<ul class="todos"><li cms-template></li></ul><nav><ul class="menu"></ul></nav>'
    const ctx = env.make(html)

    apply(ctx.adapter, ctx.root, rules, { todos: [{ text: 'a' }] }, OPT)

    assert.deepEqual(ctx.all('ul.todos > li:not([cms-template])').map(ctx.text), ['a'])
    assert.equal(ctx.all('ul.menu > li').length, 0)
    assert.deepEqual(extract(ctx.adapter, ctx.root, rules, OPT), { todos: [{ text: 'a' }] })
  })

  test(`seed placement [${env.label}] — ":scope > p" does not clone a p seed from another list`, () => {
    const html =
      tag({ people: ['#people > p', { name: '.' }] }) +
      '<div id="people"><p class="person" data-role="owner" cms-template></p></div>' +
      '<div id="board"><section><h4>Steps</h4></section></div>'
    const ctx = env.make(html)
    const section = ctx.el('#board > section')

    assert.throws(
      () => apply(ctx.adapter, section, { items: [':scope > p', { text: '.' }] }, { items: [{ text: 'step one' }] }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['items'])
        return true
      },
    )
    assert.equal(ctx.all('#board > section > p').length, 0, 'the person seed stayed where it was')
    assert.equal(ctx.all('#people > p[cms-template]').length, 1)
  })

  test(`seed placement [${env.label}] — ":scope > p" uses the checklist's own seed when one exists`, () => {
    const rules = { items: [':scope > p', { text: '.' }] }
    const html =
      tag(rules) +
      '<div id="people"><p class="person" data-role="owner" cms-template></p></div>' +
      '<div id="board"><section class="checklist"><h4>Steps</h4></section></div>' +
      '<div id="api-seeds" hidden cms-template><section class="checklist" cms-template><h4></h4><p data-role="step" cms-template></p></section></div>'
    const ctx = env.make(html)
    const section = ctx.el('#board > section.checklist')

    apply(ctx.adapter, section, rules, { items: [{ text: 'step one' }] }, OPT)

    const row = ctx.el('#board > section.checklist > p:not([cms-template])')
    assert.equal(ctx.text(row), 'step one')
    assert.equal(ctx.attr(row, 'data-role'), 'step', 'cloned from the checklist item seed, not the person seed')
    assert.deepEqual(extract(ctx.adapter, section, rules, OPT), { items: [{ text: 'step one' }] })
  })

  test(`seed placement [${env.label}] — ":scope > div" never clones the seed bank`, () => {
    const html =
      tag({ steps: ['section#c', { notes: [':scope > div', { t: '.t' }] }] }) +
      '<section id="c"><h4>Steps</h4></section>' +
      '<div id="api-seeds" hidden cms-template><div class="note" cms-template><p class="t"></p></div></div>'
    const ctx = env.make(html)
    const section = ctx.el('section#c')

    assert.throws(
      () => apply(ctx.adapter, section, { notes: [':scope > div', { t: '.t' }] }, { notes: [{ t: 'hello' }] }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['notes'])
        return true
      },
    )
    assert.equal(ctx.all('section#c > div').length, 0)
    assert.equal(ctx.all('#api-seeds > div.note[cms-template]').length, 1)
    assert.equal(ctx.all('#api-seeds > div.note > p').length, 1)
  })

  test(`seed placement [${env.label}] — a descendant-only selector with an external seed refuses instead of guessing`, () => {
    const rules = { items: ['.list li', { name: '.n' }] }
    const html =
      tag(rules) +
      '<div class="list" id="live"></div>' +
      '<div id="api-seeds" hidden cms-template><div class="list"><li class="label" cms-template><b class="name"></b></li></div></div>'
    const ctx = env.make(html)

    assert.throws(
      () => apply(ctx.adapter, ctx.root, rules, { items: [{ name: 'x' }] }, OPT),
      (err) => {
        assert.ok(err instanceof EmptyListInsert)
        assert.deepEqual(err.path, ['items'])
        assert.match(err.message, /names no container/)
        return true
      },
    )
    assert.equal(ctx.all('#live li').length, 0)
  })
}

test('a ".groups > ul li" write lands in the list through writeDocument and applyData alike', () => {
  const rules = { items: ['.groups > ul li', '.'] }
  const html = tag(rules) + '<section class="groups"><ul><li cms-template>seed</li></ul></section>'
  const data = { items: ['new'] }

  const written = writeDocument(cheerio.load, html, data)
  const $ = cheerio.load(written.html)
  assert.deepEqual($('.groups > ul > li:not([cms-template])').toArray().map((el) => $(el).text().trim()), ['new'])
  assert.deepEqual(readCheerio(written.html), data)

  const document = new JSDOM(html).window.document
  applyData(document, data)
  assert.deepEqual([...document.querySelectorAll('.groups > ul > li:not([cms-template])')].map((el) => el.textContent.trim()), ['new'])
  assert.deepEqual(extractData(document), data)
})

test('a ".groups > ul + ol li" write lands in the ol through writeDocument and applyData alike', () => {
  const rules = { items: ['.groups > ul + ol li', '.'] }
  const html = tag(rules) + '<section class="groups"><ul></ul><ol><li cms-template>seed</li></ol></section>'
  const data = { items: ['new'] }

  const written = writeDocument(cheerio.load, html, data)
  const $ = cheerio.load(written.html)
  assert.deepEqual($('.groups > ol > li:not([cms-template])').toArray().map((el) => $(el).text().trim()), ['new'])
  assert.deepEqual(readCheerio(written.html), data)

  const document = new JSDOM(html).window.document
  applyData(document, data)
  assert.deepEqual([...document.querySelectorAll('.groups > ol > li:not([cms-template])')].map((el) => el.textContent.trim()), ['new'])
  assert.deepEqual(extractData(document), data)
})
