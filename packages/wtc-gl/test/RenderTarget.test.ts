import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RenderTarget } from '../src/core/RenderTarget'
import { Texture } from '../src/core/Texture'
import type { Renderer } from '../src/core/Renderer'
import { createMockRenderer, type MockGL } from './mockGL'

describe('RenderTarget depth and stencil', () => {
  let gl: MockGL
  let renderer: Renderer

  beforeEach(() => {
    ;({ gl, renderer } = createMockRenderer())
    renderer.isWebgl2 = true
  })

  it('defaults to a 24-bit depth texture', () => {
    const target = new RenderTarget(gl, { width: 4, height: 4 })

    expect(target.depthTexture!.internalFormat).toBe(gl.DEPTH_COMPONENT24)
    expect(target.depthTexture!.type).toBe(gl.UNSIGNED_INT)
    expect(target.depthBuffer).toBe(null)
    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      target.target,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      target.depthTexture!.texture,
      0
    )
  })

  it('honours depthFormat', () => {
    const target = new RenderTarget(gl, {
      depthFormat: gl.DEPTH_COMPONENT32F
    })
    expect(target.depthTexture!.internalFormat).toBe(gl.DEPTH_COMPONENT32F)
    expect(target.depthTexture!.type).toBe(gl.FLOAT)
  })

  it('shares a depth-stencil texture when stencil is on', () => {
    const target = new RenderTarget(gl, { stencil: true })

    expect(target.depthTexture!.format).toBe(gl.DEPTH_STENCIL)
    expect(target.depthTexture!.internalFormat).toBe(gl.DEPTH24_STENCIL8)
    expect(target.depthTexture!.type).toBe(gl.UNSIGNED_INT_24_8)
    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      target.target,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.TEXTURE_2D,
      target.depthTexture!.texture,
      0
    )
  })

  it('uses a renderbuffer when depthTexture is false', () => {
    const target = new RenderTarget(gl, {
      width: 4,
      height: 2,
      stencil: true,
      depthTexture: false
    })

    expect(target.depthTexture).toBe(null)
    expect(gl.renderbufferStorage).toHaveBeenCalledWith(
      gl.RENDERBUFFER,
      gl.DEPTH24_STENCIL8,
      4,
      2
    )
    expect(gl.framebufferRenderbuffer).toHaveBeenCalledWith(
      target.target,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      target.depthBuffer
    )

    target.remove()
    expect(gl.deleteRenderbuffer).toHaveBeenCalledWith(target.depthBuffer)
  })

  it('uses a stencil renderbuffer when there is no depth', () => {
    const target = new RenderTarget(gl, { depth: false, stencil: true })

    expect(target.depthTexture).toBe(null)
    expect(gl.renderbufferStorage).toHaveBeenCalledWith(
      gl.RENDERBUFFER,
      gl.STENCIL_INDEX8,
      expect.any(Number),
      expect.any(Number)
    )
    expect(gl.framebufferRenderbuffer).toHaveBeenCalledWith(
      target.target,
      gl.STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      target.depthBuffer
    )
  })

  it('creates no depth buffer when depth and stencil are off', () => {
    const target = new RenderTarget(gl, { depth: false })
    expect(target.depthTexture).toBe(null)
    expect(gl.createRenderbuffer).not.toHaveBeenCalled()
  })

  it('attaches a depth texture passed in, and leaves it on remove', () => {
    const depth = new Texture(gl, { width: 4, height: 4 })
    const remove = vi.spyOn(depth, 'remove')
    const target = new RenderTarget(gl, { depthTexture: depth })

    expect(target.depthTexture).toBe(depth)
    target.remove()
    expect(remove).not.toHaveBeenCalled()
  })

  it('recreates the renderbuffer after context loss', () => {
    const target = new RenderTarget(gl, { depthTexture: false })
    const buffer = target.depthBuffer
    const canvas = gl.canvas as unknown as EventTarget

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))

    expect(target.depthBuffer).not.toBe(buffer)
    expect(gl.framebufferRenderbuffer).toHaveBeenLastCalledWith(
      target.target,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      target.depthBuffer
    )
  })
})
