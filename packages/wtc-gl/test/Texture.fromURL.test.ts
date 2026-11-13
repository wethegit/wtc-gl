import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Texture } from '../src/core/Texture'
import { createMockRenderer } from './mockGL'

const bitmap = { width: 4, height: 2, close: () => {} }
let createImageBitmap: ReturnType<typeof vi.fn>
let fetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  createImageBitmap = vi.fn(async () => bitmap)
  fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    blob: async () => new Blob([new Uint8Array([1, 2, 3])])
  }))
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  vi.stubGlobal('fetch', fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Texture.fromURL', () => {
  it('fetches and decodes an image into a texture', async () => {
    const { gl } = createMockRenderer()
    const texture = await Texture.fromURL(gl, '/a.png', {
      wrapS: gl.REPEAT,
      generateMipmaps: false
    })
    expect(fetch).toHaveBeenCalledWith('/a.png', { signal: undefined })
    expect(texture).toBeInstanceOf(Texture)
    expect(texture.image).toBe(bitmap)
    expect(texture.wrapS).toBe(gl.REPEAT)
    expect(texture.generateMipmaps).toBe(false)
  })

  it('flips and premultiplies in createImageBitmap', async () => {
    const { gl } = createMockRenderer()
    await Texture.fromURL(gl, '/a.png')
    expect(createImageBitmap.mock.calls[0][1]).toEqual({
      imageOrientation: 'flipY',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none'
    })

    await Texture.fromURL(gl, '/a.png', {
      flipY: false,
      premultiplyAlpha: true
    })
    expect(createImageBitmap.mock.calls[1][1]).toMatchObject({
      imageOrientation: 'from-image',
      premultiplyAlpha: 'premultiply'
    })
  })

  it('passes the abort signal to fetch', async () => {
    const { gl } = createMockRenderer()
    const controller = new AbortController()
    await Texture.fromURL(gl, '/a.png', { signal: controller.signal })
    expect(fetch).toHaveBeenCalledWith('/a.png', { signal: controller.signal })
  })

  it('rejects when the request fails', async () => {
    const { gl } = createMockRenderer()
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })
    await expect(Texture.fromURL(gl, '/missing.png')).rejects.toThrow(/404/)
  })
})

describe('Texture.fromBlob', () => {
  it('decodes a blob it is given', async () => {
    const { gl } = createMockRenderer()
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    const texture = await Texture.fromBlob(gl, blob, { flipY: false })
    expect(createImageBitmap.mock.calls[0][0]).toBe(blob)
    expect(createImageBitmap.mock.calls[0][1].imageOrientation).toBe(
      'from-image'
    )
    expect(texture.image).toBe(bitmap)
  })
})
