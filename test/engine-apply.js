import { extract, apply, errors } from '/src/engine/index.js'
import domAdapter from '/src/adapters/dom.js'

function mount(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('engine.apply (DOM adapter, real browser)', () => {
  it('sets scalar text + round-trips via extract', () => {
    const root = mount('<h1 class="title">Old</h1>')
    const rules = { title: '.title' }
    apply(domAdapter, root, rules, { title: 'New' })
    extract(domAdapter, root, rules).title.should.equal('New')
  })

  it('object array: insert + remove + reorder round-trips', () => {
    const root = mount(
      '<ul>' +
        '<li class="item"><span class="name">A</span></li>' +
        '<li class="item"><span class="name">B</span></li>' +
        '<li class="item"><span class="name">C</span></li>' +
        '</ul>',
    )
    const rules = { items: ['.item', { name: '.name' }] }
    const next = [{ name: 'B' }, { name: 'D' }, { name: 'A' }]
    const origWarn = console.warn
    console.warn = () => {}
    try {
      apply(domAdapter, root, rules, { items: next })
    } finally {
      console.warn = origWarn
    }
    extract(domAdapter, root, rules).items.should.deep.equal(next)
  })

  it('boolean prop: @checked accepts true/false', () => {
    const root = mount('<input id="agree" type="checkbox">')
    const rules = { agree: '#agree@checked' }
    apply(domAdapter, root, rules, { agree: true })
    document
      .createElement('div')
      .appendChild(root)
    root.querySelector('#agree').checked.should.equal(true)
    apply(domAdapter, root, rules, { agree: false })
    root.querySelector('#agree').checked.should.equal(false)
  })

  it('EmptyListInsert: empty list + new non-empty throws', () => {
    const root = mount('<ul></ul>')
    const rules = { items: ['.item', { name: '.name' }] }
    let thrown = null
    try {
      apply(domAdapter, root, rules, { items: [{ name: 'A' }] })
    } catch (e) {
      thrown = e
    }
    should.exist(thrown)
    thrown.should.be.instanceof(errors.EmptyListInsert)
  })

  it('ShapeMismatch is thrown before any DOM mutation', () => {
    const root = mount('<div><h1 class="title">T</h1></div>')
    const before = root.innerHTML
    const rules = { title: '.title' }
    let thrown = null
    try {
      apply(domAdapter, root, rules, { title: { bad: 'shape' } })
    } catch (e) {
      thrown = e
    }
    should.exist(thrown)
    thrown.should.be.instanceof(errors.ShapeMismatch)
    root.innerHTML.should.equal(before)
  })
})
