import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// hyper-morph references `document` / `document.activeElement` / `document.body`
// directly, so we install jsdom globals before importing it.
const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.DOMParser = dom.window.DOMParser
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.Document = dom.window.Document
globalThis.HTMLInputElement = dom.window.HTMLInputElement
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement
globalThis.HTMLOptionElement = dom.window.HTMLOptionElement
globalThis.HTMLHeadElement = dom.window.HTMLHeadElement
globalThis.HTMLTemplateElement = dom.window.HTMLTemplateElement

const { morphForm } = await import('../src/cms/morph.js')
const { widgetHandles } = await import('../src/cms/widget-handles.js')

function makeFormRoot(innerHTML) {
  const root = document.createElement('div')
  root.innerHTML = innerHTML
  document.body.innerHTML = ''
  document.body.appendChild(root)
  return root
}

function makeFragment(htmlChildren) {
  const tpl = document.createElement('template')
  tpl.innerHTML = htmlChildren
  return tpl.content
}

test('morphForm — replaces child text without destroying matching elements', () => {
  const root = makeFormRoot('<div data-hha-path="a">A</div><div data-hha-path="b">B</div>')
  const firstChildBefore = root.firstChild

  morphForm(root, makeFragment('<div data-hha-path="a">A</div><div data-hha-path="b">C</div>'))

  // First child is the same node instance (morphed in place).
  assert.equal(root.firstChild, firstChildBefore)
  assert.equal(root.childNodes.length, 2)
  assert.equal(root.children[0].textContent, 'A')
  assert.equal(root.children[1].textContent, 'C')
})

test('morphForm — fires destroy on removed row with a registered handle', () => {
  const root = makeFormRoot('')
  const rowA = document.createElement('div')
  rowA.setAttribute('data-hha-path', 'a')
  rowA.textContent = 'A'
  const rowB = document.createElement('div')
  rowB.setAttribute('data-hha-path', 'b')
  rowB.textContent = 'B'
  root.appendChild(rowA)
  root.appendChild(rowB)

  let destroyACalls = 0
  let destroyBCalls = 0
  widgetHandles.set(rowA, { destroy: () => destroyACalls++ })
  widgetHandles.set(rowB, { destroy: () => destroyBCalls++ })

  // New fragment omits rowB.
  morphForm(root, makeFragment('<div data-hha-path="a">A</div>'))

  assert.equal(destroyACalls, 0, 'surviving row should NOT fire destroy')
  assert.equal(destroyBCalls, 1, 'removed row fires destroy exactly once')
})

test('morphForm — onWidgetRemoved caller hook fires after destroy', () => {
  const root = makeFormRoot('<div data-hha-path="a">A</div>')
  const removedNodes = []

  morphForm(root, makeFragment(''), {
    onWidgetRemoved: (node) => removedNodes.push(node),
  })

  assert.equal(removedNodes.length, 1)
  assert.equal(removedNodes[0].getAttribute('data-hha-path'), 'a')
})

test('morphForm — handle without destroy does not throw', () => {
  const root = makeFormRoot('<div data-hha-path="x">X</div>')
  widgetHandles.set(root.firstChild, {}) // handle object exists, no destroy
  assert.doesNotThrow(() => morphForm(root, makeFragment('')))
})
