import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Obj } from '../src/core/Object'
import { Program } from '../src/core/Program'
import { Texture } from '../src/core/Texture'
import { RenderTarget } from '../src/core/RenderTarget'
import { TransformFeedback } from '../src/core/TransformFeedback'
import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import type { Renderer } from '../src/core/Renderer'
import { createMockRenderer, type MockGL } from './mockGL'

const attribute = () =>
  new GeometryAttribute({
    size: 3,
    data: new Float32Array(9),
    type: 5126 // FLOAT, so the attribute doesn't reach for window
  })

describe('Context loss', () => {
  let gl: MockGL
  let renderer: Renderer
  let canvas: EventTarget

  const lose = () => {
    const event = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(event)
    return event
  }
  const restore = () => canvas.dispatchEvent(new Event('webglcontextrestored'))

  beforeEach(() => {
    ;({ gl, renderer } = createMockRenderer())
    canvas = gl.canvas as unknown as EventTarget
  })

  it('asks the browser to restore and skips rendering while lost', () => {
    const onContextLost = vi.fn()
    renderer.onContextLost = onContextLost

    const event = lose()
    expect(event.defaultPrevented).toBe(true)
    expect(renderer.contextLost).toBe(true)
    expect(onContextLost).toHaveBeenCalledTimes(1)

    renderer.render({ scene: new Obj() })
    expect(gl.clear).not.toHaveBeenCalled()
  })

  it('resets the renderer state and calls onContextRestored', () => {
    const onContextRestored = vi.fn()
    renderer.onContextRestored = onContextRestored
    renderer.state.uniformLocations.set({}, 1)
    renderer.currentProgram = 5

    lose()
    restore()

    expect(renderer.contextLost).toBe(false)
    expect(renderer.contextVersion).toBe(1)
    expect(renderer.state.uniformLocations.size).toBe(0)
    expect(renderer.currentProgram).toBe(-1)
    expect(onContextRestored).toHaveBeenCalledTimes(1)

    renderer.render({ scene: new Obj() })
    expect(gl.clear).toHaveBeenCalled()
  })

  it('recompiles programs', () => {
    const program = new Program(gl, { vertex: 'v', fragment: 'f' })
    const before = program.program

    lose()
    restore()

    expect(program.program).not.toBe(before)
    expect(program.linked).toBe(true)
    expect(gl.shaderSource).toHaveBeenLastCalledWith(expect.anything(), 'f')
  })

  it('recreates textures and re-uploads them on next use', () => {
    // Texture.update checks the image type with instanceof
    for (const name of [
      'HTMLVideoElement',
      'HTMLImageElement',
      'HTMLCanvasElement'
    ])
      vi.stubGlobal(name, class {})

    const texture = new Texture(gl, { data: new Float32Array(4), width: 1 })
    texture.update()
    const before = texture.texture
    expect(texture.needsUpdate).toBe(false)

    lose()
    restore()

    expect(texture.texture).not.toBe(before)
    expect(texture.needsUpdate).toBe(true)

    vi.mocked(gl.texImage2D).mockClear()
    texture.update()
    expect(gl.texImage2D).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it('recreates geometry buffers and vertex arrays', () => {
    const geometry = new Geometry(gl, { position: attribute() })
    const before = geometry.attributes.position.buffer
    geometry.VAOs.someProgram = {}
    vi.mocked(gl.bufferData).mockClear()

    lose()
    restore()

    expect(geometry.attributes.position.buffer).not.toBe(before)
    expect(gl.bufferData).toHaveBeenCalledTimes(1)
    expect(geometry.VAOs).toEqual({})
  })

  it('only rebuilds a shared attribute once', () => {
    const shared = attribute()
    new Geometry(gl, { position: shared })
    new Geometry(gl, { position: shared })
    vi.mocked(gl.createBuffer).mockClear()

    lose()
    restore()

    expect(gl.createBuffer).toHaveBeenCalledTimes(1)
  })

  it('recreates render targets with their textures attached', () => {
    const target = new RenderTarget(gl, { width: 4, height: 4 })
    const buffer = target.buffer
    const texture = target.texture.texture
    vi.mocked(gl.framebufferTexture2D).mockClear()

    lose()
    restore()

    expect(target.buffer).not.toBe(buffer)
    expect(target.texture.texture).not.toBe(texture)
    // Colour and depth
    expect(gl.framebufferTexture2D).toHaveBeenCalledTimes(2)
    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      target.target,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      target.texture.texture,
      0
    )
    // Left bound to the canvas
    expect(renderer.state.framebuffer).toBe(null)
  })

  it('rebuilds transform feedback after relinking its program', () => {
    const program = new Program(gl, { vertex: 'v', fragment: 'f' })
    const tf = new TransformFeedback(gl, {
      program,
      transformFeedbacks: {
        a_position: { size: 3, data: new Float32Array(9), varying: 'v' }
      }
    })
    const VAOs = tf.VAOs

    lose()
    restore()

    expect(tf.VAOs[0]).not.toBe(VAOs[0])
    expect(gl.bindAttribLocation).toHaveBeenLastCalledWith(
      program.program,
      0,
      'a_position'
    )
  })

  it('skips bindAttribLocation for a raw WebGLProgram after restore', () => {
    const program = new Program(gl, { vertex: 'v', fragment: 'f' })
    new TransformFeedback(gl, {
      program: program.program,
      transformFeedbacks: {
        a_position: { size: 3, data: new Float32Array(9), varying: 'v' }
      }
    })
    vi.mocked(gl.bindAttribLocation).mockClear()
    vi.mocked(gl.createVertexArray).mockClear()

    lose()
    restore()

    expect(gl.createVertexArray).toHaveBeenCalledTimes(2)
    expect(gl.bindAttribLocation).not.toHaveBeenCalled()
  })

  it('does not restore removed resources', () => {
    const program = new Program(gl, { vertex: 'v', fragment: 'f' })
    const texture = new Texture(gl)
    program.remove()
    texture.remove()
    vi.mocked(gl.createProgram).mockClear()
    vi.mocked(gl.createTexture).mockClear()

    lose()
    restore()

    expect(gl.createProgram).not.toHaveBeenCalled()
    expect(gl.createTexture).not.toHaveBeenCalled()
  })

  it('stops listening once disposed', () => {
    renderer.dispose()
    lose()
    expect(renderer.contextLost).toBe(false)
  })
})
