import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { Texture, type TextureImage } from '../src/core/Texture'
import { VideoTexture } from '../src/core/VideoTexture'
import { createMockRenderer, type MockGL } from './mockGL'

describe('Texture sources', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('uploads integer typed-array data', () => {
    const data = new Uint8Array(2 * 2 * 4)
    const texture = new Texture(gl, {
      data,
      width: 2,
      height: 2,
      generateMipmaps: false
    })
    texture.update()

    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      2,
      2,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    )
  })

  it('sizes ImageBitmap and OffscreenCanvas sources from width and height', () => {
    // Neither class exists in Node; the texture only reads width and height
    const bitmap = { width: 8, height: 4 } as unknown as TextureImage
    const texture = new Texture(gl, { image: bitmap, generateMipmaps: false })
    texture.update()

    expect([texture.width, texture.height]).toEqual([8, 4])
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      8,
      4,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bitmap
    )
  })
})

describe('VideoTexture', () => {
  let gl: MockGL

  const fakeVideo = (props: Record<string, unknown> = {}) => {
    const video = {
      readyState: 0,
      paused: false,
      videoWidth: 16,
      videoHeight: 9,
      frame: undefined as undefined | (() => void),
      requestVideoFrameCallback: vi.fn((cb: () => void) => {
        video.frame = cb
        return 7
      }),
      cancelVideoFrameCallback: vi.fn(),
      ...props
    }
    return video
  }

  // texImage2D calls that uploaded the video itself
  const videoUploads = (video: object) =>
    vi
      .mocked(gl.texImage2D)
      .mock.calls.filter((call) => (call as unknown[]).includes(video))

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('waits for the first frame, then uploads only on new frames', () => {
    const video = fakeVideo()
    const texture = new VideoTexture(gl, {
      video: video as unknown as HTMLVideoElement
    })

    // No data yet: an empty pixel, not the video
    texture.update()
    expect(texture.image).toBeUndefined()
    expect(videoUploads(video)).toHaveLength(0)

    video.readyState = 2
    texture.update()
    expect(videoUploads(video)).toHaveLength(1)
    expect([texture.width, texture.height]).toEqual([16, 9])

    // Same frame: no upload
    texture.update()
    expect(videoUploads(video)).toHaveLength(1)

    video.frame!()
    texture.update()
    expect(videoUploads(video)).toHaveLength(2)
  })

  it('uploads on every use while playing when frame callbacks are missing', () => {
    const video = {
      readyState: 4,
      paused: false,
      videoWidth: 16,
      videoHeight: 9
    }
    const texture = new VideoTexture(gl, {
      video: video as unknown as HTMLVideoElement
    })

    texture.update()
    texture.update()
    expect(videoUploads(video)).toHaveLength(2)

    video.paused = true
    texture.update()
    expect(videoUploads(video)).toHaveLength(2)
  })

  it('turns mipmaps off by default and cancels its callback on remove', () => {
    const video = fakeVideo()
    const texture = new VideoTexture(gl, {
      video: video as unknown as HTMLVideoElement
    })

    expect(texture.generateMipmaps).toBe(false)
    expect(texture.minFilter).toBe(gl.LINEAR)

    texture.remove()
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(7)
  })
})

describe('Texture compareFunc', () => {
  const compareCalls = (gl: MockGL) =>
    (gl.texParameteri as unknown as Mock).mock.calls.filter(
      ([, pname]: number[]) =>
        pname === gl.TEXTURE_COMPARE_MODE || pname === gl.TEXTURE_COMPARE_FUNC
    )

  it('leaves comparison off by default', () => {
    const { gl } = createMockRenderer()
    const texture = new Texture(gl, { width: 2, generateMipmaps: false })
    texture.update()
    expect(texture.compareFunc).toBe(null)
    expect(compareCalls(gl)).toEqual([])
  })

  it('turns on depth comparison once', () => {
    const { gl } = createMockRenderer()
    const texture = new Texture(gl, {
      width: 2,
      generateMipmaps: false,
      format: gl.DEPTH_COMPONENT,
      internalFormat: gl.DEPTH_COMPONENT24,
      type: gl.UNSIGNED_INT,
      compareFunc: gl.LEQUAL
    })
    texture.update()
    texture.needsUpdate = true
    texture.update()
    expect(compareCalls(gl)).toEqual([
      [gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE],
      [gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]
    ])

    texture.compareFunc = null
    texture.needsUpdate = true
    texture.update()
    const calls = compareCalls(gl)
    expect(calls[calls.length - 1]).toEqual([
      gl.TEXTURE_2D,
      gl.TEXTURE_COMPARE_MODE,
      gl.NONE
    ])
  })

  it('sets it again after the context is restored', () => {
    const { gl, renderer } = createMockRenderer()
    const texture = new Texture(gl, {
      width: 2,
      generateMipmaps: false,
      compareFunc: gl.LESS
    })
    texture.update()
    const canvas = gl.canvas as unknown as EventTarget
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(renderer.contextVersion).toBe(1)
    texture.update()
    expect(
      compareCalls(gl).filter(
        ([, p]: number[]) => p === gl.TEXTURE_COMPARE_FUNC
      )
    ).toHaveLength(2)
  })
})
