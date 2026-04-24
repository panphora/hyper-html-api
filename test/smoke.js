describe('hyper-html-api', () => {
  it('exposes the HyperHtmlApi global', () => {
    window.HyperHtmlApi.should.be.an('object')
    window.HyperHtmlApi.should.have.property('engine')
    window.HyperHtmlApi.should.have.property('cms')
    window.HyperHtmlApi.should.have.property('upgrade')
  })
})
