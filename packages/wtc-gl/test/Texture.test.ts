import { beforeEach, describe, expect, it, vi } from 'vitest'

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
