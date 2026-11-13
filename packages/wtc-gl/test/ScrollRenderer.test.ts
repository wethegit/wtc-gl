import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ScrollRenderer } from '../src/recipes/ScrollRenderer/ScrollRenderer'
import type { ScrollScene } from '../src/recipes/ScrollRenderer/ScrollScene'
import { createMockGL } from './mockGL'

// A page in absolute layout: an 800px viewport over `content` px of content,
// scrolled to `scrollY`
const page = { content: 3000, scrollY: 0 }
const VIEWPORT = 800

beforeEach(() => {
  page.content = 3000
  page.scrollY = 0
  vi.stubGlobal('window', {
    get scrollX() {
      return 0
    },
    get scrollY() {
      return page.scrollY
    }
  })
  vi.stubGlobal('document', {
    documentElement: { clientWidth: 1000, clientHeight: VIEWPORT },
    body: {
      // body.scrollHeight leaves out the canvas, which is positioned against
      // the document rather than the body
      get scrollHeight() {
        return page.content
      },
      getBoundingClientRect: () => ({ top: -page.scrollY })
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function createRenderer(overscan = 0.25) {
  const gl = createMockGL()
  const canvas = gl.canvas as unknown as Record<string, unknown>
  canvas.getContext = () => gl
  canvas.clientWidth = 1000
  const renderer = new ScrollRenderer({
    layout: 'absolute',
    overscan,
    rendererProps: { canvas: canvas as unknown as HTMLCanvasElement, dpr: 1 }
  })

  // A scene that records the offset it's given and draws nothing
  const glRect = vi.fn(() => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rect: {} as DOMRect
  }))
  renderer.addScene({
    visible: true,
    element: { classList: { add: () => {} } },
    glRect
  } as unknown as ScrollScene)

  return { renderer, canvas, glRect }
}

// The canvas's top in document coordinates, from its transform
const canvasTop = (canvas: Record<string, unknown>) => {
  const transform = (canvas.style as Record<string, string>).transform
  return Number(/translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(transform)![1])
}

const frame = (renderer: ScrollRenderer, t = 16) => {
  renderer.render(1)
  renderer.render(t)
}

describe('ScrollRenderer absolute layout', () => {
  it('sizes the canvas to the viewport plus an overscan band above and below', () => {
    const { renderer, canvas } = createRenderer()
    expect(renderer.overscanPx).toBe(200)
    expect((canvas.style as Record<string, string>).height).toBe('1200px')
    expect(renderer.renderer.dimensions.height).toBe(1200)
  })

  it('puts a full overscan band above the viewport mid-page', () => {
    const { renderer, canvas, glRect } = createRenderer()
    page.scrollY = 1000
    frame(renderer)

    expect(canvasTop(canvas)).toBe(800)
    // Scenes are offset by the band above the viewport
    expect(glRect).toHaveBeenLastCalledWith(1200, 1, 200)
  })

  it('never extends the canvas past the end of the content', () => {
    const { renderer, canvas, glRect } = createRenderer()
    // Scrolled to the bottom: the viewport ends at the content's end
    page.scrollY = page.content - VIEWPORT
    frame(renderer)

    // Moved up so its bottom meets the content's end, which leaves a bigger
    // band above the viewport, and scenes offset to match
    expect(canvasTop(canvas) + 1200).toBe(page.content)
    expect(canvasTop(canvas)).toBe(1800)
    expect(glRect).toHaveBeenLastCalledWith(1200, 1, 400)
  })

  it('only gives up the part of the lower band that can never be scrolled to', () => {
    const { renderer, canvas, glRect } = createRenderer()
    // 100px of content left below the viewport, less than the 200px band
    page.scrollY = page.content - VIEWPORT - 100
    frame(renderer)

    expect(canvasTop(canvas) + 1200).toBe(page.content)
    expect(glRect).toHaveBeenLastCalledWith(1200, 1, 300)
  })

  it('stays the same on repeated frames at the bottom', () => {
    const { renderer, canvas } = createRenderer()
    page.scrollY = page.content - VIEWPORT
    frame(renderer)
    const top = canvasTop(canvas)
    renderer.render(32)
    renderer.render(48)
    expect(canvasTop(canvas)).toBe(top)
  })

  it('still covers the viewport on a page shorter than it', () => {
    const { renderer, canvas, glRect } = createRenderer()
    page.content = 500
    frame(renderer)

    // Overflow within the viewport doesn't make the page scroll, so the
    // canvas may reach the viewport's bottom, but no further
    expect(canvasTop(canvas) + 1200).toBe(VIEWPORT)
    expect(glRect).toHaveBeenLastCalledWith(1200, 1, 400)
  })

  it('follows the content as it grows or shrinks', () => {
    const { renderer, canvas } = createRenderer()
    page.scrollY = 2200
    frame(renderer)
    expect(canvasTop(canvas) + 1200).toBe(3000)

    page.content = 5000
    renderer.render(32)
    expect(canvasTop(canvas)).toBe(2000)
  })
})
