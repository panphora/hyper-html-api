import { extractData, applyData, engine } from '/src/data.js'

// Browser coverage for the data sugar (extractData / applyData) and its
// autodetect rule. Mirrors the bind.js style: build DOM with mount(), assert
// with chai. The sugar is a thin wrapper over engine.bind().get()/.set(), so
// these focus on the polymorphic arg handling + the one/many/zero-tag rule.
//
// autodetect() counts rules tags across the whole document (it resolves to
// root.ownerDocument, exactly like resolveRules), so each test must clean up
// its mounted nodes or a leftover tag would make a later autodetect ambiguous.

const mounted = []
function mount(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  mounted.push(host)
  return host
}
afterEach(() => {
  while (mounted.length) mounted.pop().remove()
})

const API_TAG =
  '<script type="application/json" data-rules-name="api" data-rules-version="1">{"title":"h1","items":".item[]"}</script>'

const COLLECTION_TAG =
  '<script type="application/json" data-rules-name="collection" data-rules-version="1">{"name":".cname"}</script>'

describe('extractData (read)', () => {
  it('extractData(root, "name") reads via a named rule scoped to the root', () => {
    const host = mount(`${API_TAG}<h1>Hello</h1><span class="item">a</span><span class="item">b</span>`)
    const data = extractData(host, 'api')
    data.should.deep.equal({ title: 'Hello', items: ['a', 'b'] })
  })

  it('extractData("name") defaults the root to document', () => {
    mount(`${API_TAG}<h1>Doc</h1>`)
    const data = extractData('api')
    data.title.should.equal('Doc')
  })

  it('extractData(root, {inline}) accepts an inline rules object', () => {
    const host = mount('<h1>Inline</h1>')
    const data = extractData(host, { heading: 'h1' })
    data.should.deep.equal({ heading: 'Inline' })
  })

  it('extractData(root) autodetects the single rules tag in scope', () => {
    const host = mount(`${API_TAG}<h1>Auto</h1>`)
    const data = extractData(host)
    data.title.should.equal('Auto')
  })

  it('extractData() with no args uses document + autodetect', () => {
    mount(`${API_TAG}<h1>NoArgs</h1>`)
    const data = extractData()
    data.title.should.equal('NoArgs')
  })
})

describe('applyData (write-into-DOM)', () => {
  it('applyData(root, data, "name") writes into the DOM and returns root', () => {
    const host = mount(`${API_TAG}<h1></h1>`)
    const returned = applyData(host, { title: 'Written' }, 'api')
    returned.should.equal(host)
    host.querySelector('h1').textContent.should.equal('Written')
  })

  it('applyData(root, data) autodetects the single rules tag', () => {
    const host = mount(`${API_TAG}<h1></h1>`)
    applyData(host, { title: 'AutoWrite' })
    host.querySelector('h1').textContent.should.equal('AutoWrite')
  })

  it('applyData(root, data, {inline}) accepts an inline rules object', () => {
    const host = mount('<h1></h1>')
    applyData(host, { heading: 'InlineWrite' }, { heading: 'h1' })
    host.querySelector('h1').textContent.should.equal('InlineWrite')
  })

  it('round-trips: applyData then extractData yields the same data', () => {
    const host = mount(`${API_TAG}<h1></h1>`)
    applyData(host, { title: 'RoundTrip', items: [] }, 'api')
    extractData(host, 'api').title.should.equal('RoundTrip')
  })

  it('throws when the first argument is not a DOM root', () => {
    chai.expect(() => applyData('api', { title: 'x' })).to.throw(/needs a DOM root/)
  })
})

describe('autodetect edges (source omitted)', () => {
  it('throws a distinct "no rules tag" error when zero tags are in scope', () => {
    const host = mount('<h1>none</h1>')
    chai.expect(() => extractData(host)).to.throw(/no rules tag found/)
  })

  it('throws an "ambiguous" error when multiple tags are in scope', () => {
    const host = mount(`${API_TAG}${COLLECTION_TAG}<h1>two</h1>`)
    chai.expect(() => extractData(host)).to.throw(/multiple rules tags/)
  })

  it('a named source still works when multiple tags are present', () => {
    const host = mount(`${API_TAG}${COLLECTION_TAG}<h1>Named</h1><span class="cname">Bob</span>`)
    extractData(host, 'api').title.should.equal('Named')
    extractData(host, 'collection').should.deep.equal({ name: 'Bob' })
  })
})

describe('engine is still exposed from the lean entry', () => {
  it('engine.bind(...).get() matches extractData', () => {
    const host = mount(`${API_TAG}<h1>EngineParity</h1>`)
    const viaEngine = engine.bind(host, 'api').get()
    const viaSugar = extractData(host, 'api')
    viaEngine.should.deep.equal(viaSugar)
  })
})
