import { vi, type Mock } from 'vitest'

import { Renderer } from '../src/core/Renderer'
import type { WTCGLRenderingContext } from '../src/types'

export type MockGL = WTCGLRenderingContext & Record<string, Mock>

/**
 * A stand-in for a WebGL2 context, so the library can run under Node.
 *
 * - Upper-case properties (`gl.FLOAT`, `gl.TRIANGLES`) are GL constants. The
 *   real values are used where the library switches on literal numbers
 *   (uniform types); anything else gets a unique stable number.
 * - Any other property is a `vi.fn()` that returns an empty object, so
 *   `createBuffer()` and friends hand back distinct handles. The same mock is
 *   returned each time, so tests can assert on calls.
 * - `overrides` replaces any of the above.
 */
export function createMockGL(overrides: Record<string, unknown> = {}): MockGL {
  const constants: Record<string, number> = {
    FLOAT: 5126,
    INT: 5124,
    BOOL: 35670,
    FLOAT_VEC2: 35664,
    FLOAT_VEC3: 35665,
    FLOAT_VEC4: 35666,
    FLOAT_MAT4: 35676,
    SAMPLER_2D: 35678,
    LINK_STATUS: 35714
  }
  let nextConstant = 0x10000

  const canvas = { width: 300, height: 150, style: {} }
  const target: Record<string | symbol, unknown> = {
    canvas,
    getShaderInfoLog: vi.fn(() => ''),
    getProgramInfoLog: vi.fn(() => ''),
    getProgramParameter: vi.fn(
      (_program: unknown, pname: number) => pname === constants.LINK_STATUS
    ),
    getParameter: vi.fn(() => 16),
    getExtension: vi.fn(() => null),
    isContextLost: vi.fn(() => false),
    ...overrides
  }

  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop]
      // Don't look like a promise if something awaits the context
      if (typeof prop !== 'string' || prop === 'then') return undefined
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) {
        constants[prop] ??= nextConstant++
        return constants[prop]
      }
      t[prop] = vi.fn(() => ({}))
      return t[prop]
    }
  }) as MockGL
}

/**
 * Create a `Renderer` backed by a mock context. Returns the renderer and its
 * `gl`, which is the mock with `renderer` attached.
 */
export function createMockRenderer(overrides: Record<string, unknown> = {}) {
  const gl = createMockGL(overrides)
  const canvas = gl.canvas as unknown as Record<string, unknown>
  canvas.getContext = () => gl
  const renderer = new Renderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    dpr: 1
  })
  return { renderer, gl: renderer.gl as MockGL }
}
