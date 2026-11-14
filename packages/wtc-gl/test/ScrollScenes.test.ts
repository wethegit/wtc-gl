import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Drawable } from '../src/core/Drawable'
import { ScrollImage } from '../src/recipes/ScrollRenderer/ScrollImage'
import { ScrollHTML } from '../src/recipes/ScrollRenderer/ScrollHTML'
import { createMockRenderer } from './mockGL'

/**
 * Just enough of a DOM node for the scroll scenes: a parent, children in
 * order, insertBefore/appendChild/replaceWith/remove and listeners.
 */
class FakeNode {
  tag: string
  parentNode: FakeNode | null = null
  children: FakeNode[] = []
  style: Record<string, string> = {}
  listeners: Record<string, (() => void)[]> = {}
  constructor(tag = 'div') {
    this.tag = tag
  }
  get nextSibling(): FakeNode | null {
    const siblings = this.parentNode?.children ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }
  get isConnected(): boolean {
    let root = this.parentNode
    while (root?.parentNode) root = root.parentNode
    return this === body || root === body
  }
  insertBefore(node: FakeNode, before: FakeNode | null) {
    node.remove()
    node.parentNode = this
    const i = before ? this.children.indexOf(before) : -1
    if (i < 0) this.children.push(node)
    else this.children.splice(i, 0, node)
    return node
  }
  appendChild(node: FakeNode) {
    return this.insertBefore(node, null)
  }
  replaceWith(node: FakeNode) {
    this.parentNode?.insertBefore(node, this)
    this.remove()
  }
  remove() {
    if (!this.parentNode) return
    const siblings = this.parentNode.children
    siblings.splice(siblings.indexOf(this), 1)
    this.parentNode = null
  }
  setAttribute() {}
  getContext() {
    return null
  }
  getBoundingClientRect() {
    return { width: 200, height: 100 }
  }
  addEventListener(type: string, fn: () => void) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn)
  }
}

let body: FakeNode
const observed: unknown[] = []

beforeEach(() => {
  body = new FakeNode('body')
  observed.length = 0
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal('document', {
    body,
    createElement: (tag: string) => new FakeNode(tag)
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(element: unknown) {
        observed.push(element)
      }
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const asElement = (node: FakeNode) => node as unknown as HTMLElement

describe('ScrollImage.destroy', () => {
  it('stops waiting for the image and deletes its texture', () => {
    const { gl } = createMockRenderer()
    const image = Object.assign(new FakeNode('img'), {
      complete: false,
      naturalWidth: 0
    })
    body.appendChild(image)
    const scene = new ScrollImage({
      gl,
      element: asElement(image),
      scene: new Drawable(gl)
    })
    expect(image.listeners.load).toHaveLength(1)
    const remove = vi.spyOn(scene.texture, 'remove')
    scene.destroy()
    expect(image.listeners.load).toHaveLength(0)
    expect(remove).toHaveBeenCalled()
  })
})

describe('ScrollHTML', () => {
  it('tracks a placeholder when it captures the element itself, and puts the element back', () => {
    const { gl } = createMockRenderer()
    const section = body.appendChild(new FakeNode('section'))
    const before = section.appendChild(new FakeNode('p'))
    const card = section.appendChild(new FakeNode('div'))
    const after = section.appendChild(new FakeNode('p'))

    const scene = new ScrollHTML({
      gl,
      element: asElement(card),
      scene: new Drawable(gl)
    })
    // The card moved into the capture canvas; a placeholder holds its place
    // and is what the scene follows
    const placeholder = section.children[1]
    expect(card.parentNode).not.toBe(section)
    expect(section.children).toEqual([before, placeholder, after])
    expect(scene.element).toBe(placeholder)
    expect(observed).toEqual([placeholder])

    const remove = vi.spyOn(scene.texture, 'remove')
    scene.destroy()
    expect(section.children).toEqual([before, card, after])
    expect(remove).toHaveBeenCalled()
  })

  it('returns a separate element to where it was', () => {
    const { gl } = createMockRenderer()
    const anchor = body.appendChild(new FakeNode('div'))
    const list = body.appendChild(new FakeNode('ul'))
    const first = list.appendChild(new FakeNode('li'))
    const card = list.appendChild(new FakeNode('li'))
    const last = list.appendChild(new FakeNode('li'))

    const scene = new ScrollHTML({
      gl,
      element: asElement(anchor),
      htmlElement: asElement(card),
      scene: new Drawable(gl)
    })
    expect(scene.element).toBe(anchor)
    expect(list.children).toEqual([first, last])

    scene.destroy()
    expect(list.children).toEqual([first, card, last])
  })
})
