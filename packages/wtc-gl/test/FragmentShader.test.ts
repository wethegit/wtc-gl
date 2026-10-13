import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FragmentShader } from '../src/recipes/FragmentShader'
import { createMockGL } from './mockGL'

describe('FragmentShader without a window', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds with only a canvas, as in a worker or under SSR', () => {
    // Vitest runs in Node, so there's no window or document here
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')

    const gl = createMockGL()
    const canvas = gl.canvas as unknown as Record<string, unknown>
    canvas.getContext = () => gl

    const shader = new FragmentShader({
      rendererProps: { canvas: canvas as unknown as HTMLCanvasElement }
    })

    expect(shader.renderer.dpr).toBe(1)
    expect([shader.dimensions.x, shader.dimensions.y]).toEqual([500, 500])
    shader.playing = false
  })
})
