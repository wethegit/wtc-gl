import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Obj } from '../src/core/Object'
import { Mesh } from '../src/core/Mesh'
import { Program, type ProgramOptions } from '../src/core/Program'
import { Geometry } from '../src/geometry/Geometry'
import { RenderTarget } from '../src/core/RenderTarget'
import { Renderer } from '../src/core/Renderer'
import { createMockRenderer, type MockGL } from './mockGL'

describe('Renderer.getRenderList', () => {
  let gl: MockGL
  let renderer: Renderer
  let geometry: Geometry
  let scene: Obj

  const program = (options: Partial<ProgramOptions> = {}) =>
    new Program(gl, { vertex: '', fragment: '', ...options })

  const mesh = (p: Program, renderOrder = 0) => {
    const m = new Mesh(gl, { geometry, program: p, renderOrder })
    scene.addChild(m)
    return m
  }

  const list = (sort = true) =>
    renderer.getRenderList({ scene, frustumCull: false, sort })

  beforeEach(() => {
    ;({ gl, renderer } = createMockRenderer())
    geometry = new Geometry(gl, {})
    scene = new Obj()
  })

  it('orders opaque, then transparent, then UI', () => {
    const ui = mesh(program({ transparent: true, depthTest: false }))
    const transparent = mesh(program({ transparent: true }))
    const opaque = mesh(program())

    expect(list()).toEqual([opaque, transparent, ui])
  })

  it('draws transparent meshes without depth testing', () => {
    // Regression: these used to fall out of every list and never render
    const ui = mesh(program({ transparent: true, depthTest: false }))
    expect(list()).toContain(ui)
  })

  it('sorts by render order within a group', () => {
    const p = program()
    const late = mesh(p, 3)
    const early = mesh(p, 1)
    const middle = mesh(p, 2)

    expect(list()).toEqual([early, middle, late])
  })

  it('groups opaque meshes by program', () => {
    const p1 = program()
    const p2 = program()
    const a = mesh(p2)
    const b = mesh(p1)
    const c = mesh(p2)
    const d = mesh(p1)

    const result = list()
    // Meshes sharing a program are drawn together, saving program switches
    expect(result.slice(0, 2).every((m) => m.program === p1)).toBe(true)
    expect(result.slice(2).every((m) => m.program === p2)).toBe(true)
    expect(result).toHaveLength(4)
    expect(new Set(result)).toEqual(new Set([a, b, c, d]))
  })

  it('sorts transparent meshes back to front', () => {
    const p = program({ transparent: true })
    const near = mesh(p)
    const far = mesh(p)
    near.zDepth = 0.2
    far.zDepth = 0.8

    // No camera, so getRenderList keeps the zDepth values set here
    expect(list()).toEqual([far, near])
  })

  it('skips invisible nodes and their children', () => {
    const p = program()
    const visible = mesh(p)
    const hidden = mesh(p)
    const child = new Mesh(gl, { geometry, program: p })
    hidden.addChild(child)
    hidden.visible = false

    expect(list()).toEqual([visible])
  })

  it('keeps scene order when sorting is off', () => {
    const ui = mesh(program({ transparent: true, depthTest: false }))
    const opaque = mesh(program())

    expect(list(false)).toEqual([ui, opaque])
  })
})

describe('Renderer clearing', () => {
  let gl: MockGL
  let renderer: Renderer

  beforeEach(() => {
    // Real bit values, so the clear mask can be checked
    ;({ gl, renderer } = createMockRenderer({
      COLOR_BUFFER_BIT: 0x4000,
      DEPTH_BUFFER_BIT: 0x100,
      STENCIL_BUFFER_BIT: 0x400
    }))
  })

  it('sets the clear colour and keeps it across context loss', () => {
    renderer.clearColour = [0.1, 0.2, 0.3, 1]
    expect(gl.clearColor).toHaveBeenLastCalledWith(0.1, 0.2, 0.3, 1)
    expect(renderer.clearColour).toEqual([0.1, 0.2, 0.3, 1])

    vi.mocked(gl.clearColor).mockClear()
    const canvas = gl.canvas as unknown as EventTarget
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(gl.clearColor).toHaveBeenCalledWith(0.1, 0.2, 0.3, 1)
  })

  it('takes the clear colour as an option', () => {
    ;({ gl, renderer } = createMockRenderer())
    expect(renderer.clearColour).toEqual([0, 0, 0, 0])

    const canvas = gl.canvas as unknown as Record<string, unknown>
    const other = new Renderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      clearColour: [1, 0, 0, 1]
    })
    expect(other.clearColour).toEqual([1, 0, 0, 1])
    expect(gl.clearColor).toHaveBeenLastCalledWith(1, 0, 0, 1)
  })

  it("clears a render target's own depth and stencil buffers", () => {
    const target = new RenderTarget(gl, { stencil: true })
    renderer.render({ scene: new Obj(), target })
    expect(gl.clear).toHaveBeenLastCalledWith(0x4000 | 0x100 | 0x400)

    const flat = new RenderTarget(gl, { depth: false })
    renderer.render({ scene: new Obj(), target: flat })
    expect(gl.clear).toHaveBeenLastCalledWith(0x4000)

    // The canvas uses the renderer's settings (depth on, stencil off)
    renderer.render({ scene: new Obj() })
    expect(gl.clear).toHaveBeenLastCalledWith(0x4000 | 0x100)
  })
})

describe('Renderer context and extensions', () => {
  it('requires WebGL2', () => {
    const contexts: string[] = []
    const canvas = {
      getContext: (type: string) => {
        contexts.push(type)
        return null
      }
    } as unknown as HTMLCanvasElement

    expect(() => new Renderer({ canvas })).toThrow(/WebGL2/)
    expect(contexts).toEqual(['webgl2'])
  })

  it('looks each extension up once per context', () => {
    const ext = { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 1 }
    const { gl, renderer } = createMockRenderer({
      getExtension: vi.fn(() => ext)
    })
    // Already requested by the constructor, to read the max anisotropy
    expect(gl.getExtension).toHaveBeenCalledWith(
      'EXT_texture_filter_anisotropic'
    )
    vi.mocked(gl.getExtension).mockClear()

    expect(renderer.getExtension('EXT_texture_filter_anisotropic')).toBe(ext)
    expect(gl.getExtension).not.toHaveBeenCalled()

    // A restored context needs its extensions enabled again
    const canvas = gl.canvas as unknown as EventTarget
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(gl.getExtension).toHaveBeenCalledWith('EXT_color_buffer_float')
    expect(gl.getExtension).toHaveBeenCalledWith(
      'EXT_texture_filter_anisotropic'
    )
  })

  it('caches unsupported extensions as null', () => {
    const { gl, renderer } = createMockRenderer()
    vi.mocked(gl.getExtension).mockClear()

    expect(renderer.getExtension('WEBGL_multi_draw')).toBe(null)
    expect(renderer.getExtension('WEBGL_multi_draw')).toBe(null)
    expect(gl.getExtension).toHaveBeenCalledTimes(1)
  })

  it('tracks the bound geometry when binding a vertex array', () => {
    const { gl, renderer } = createMockRenderer()
    const vao = {} as WebGLVertexArrayObject

    renderer.bindVertexArray(vao, '1_a')
    expect(gl.bindVertexArray).toHaveBeenLastCalledWith(vao)
    expect(renderer.currentGeometry).toBe('1_a')

    // A VAO bound outside Geometry makes the next geometry draw rebind
    renderer.bindVertexArray(vao)
    expect(renderer.currentGeometry).toBe('')
  })
})
