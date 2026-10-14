import type { WTCGLRenderingContext } from '../types'

import { Texture, type TextureOptions } from './Texture'

// HTMLMediaElement.HAVE_CURRENT_DATA, as a literal so this works without a window
const HAVE_CURRENT_DATA = 2

export interface VideoTextureOptions extends Partial<
  Omit<TextureOptions, 'image' | 'data'>
> {
  video: HTMLVideoElement
}

/**
 * A texture that follows a video. It uploads a new frame only when the video
 * presents one (using `requestVideoFrameCallback`), so there's no need to set
 * `needsUpdate` every frame. Where `requestVideoFrameCallback` isn't
 * supported, it uploads every time it's used while the video is playing.
 *
 * Until the video has a frame, the texture is a single transparent pixel.
 * Mipmaps are off by default, as regenerating them for every frame is costly.
 */
export class VideoTexture extends Texture {
  /**
   * The video being followed.
   */
  video: HTMLVideoElement

  #frameCallback = 0
  #hasFrameCallback: boolean

  /**
   * Create a video texture.
   * @param gl - The WTCGL rendering context.
   * @param __namedParameters - Texture options, plus the video to follow.
   * @param video - The video element. It doesn't need to have loaded yet.
   */
  constructor(
    gl: WTCGLRenderingContext,
    { video, generateMipmaps = false, ...options }: VideoTextureOptions
  ) {
    super(gl, { ...options, generateMipmaps })
    this.video = video
    this.#hasFrameCallback = 'requestVideoFrameCallback' in video
    if (this.#hasFrameCallback) this.#requestFrame()
  }

  #requestFrame() {
    this.#frameCallback = this.video.requestVideoFrameCallback(() => {
      this.needsUpdate = true
      this.#requestFrame()
    })
  }

  /**
   * Upload the current frame if there's a new one, then bind the texture.
   * Called when the uniform is bound.
   * @param textureUnit The texture unit to update against.
   */
  update(textureUnit = 0) {
    if (!this.image) {
      // Setting the image makes the next update upload it
      if (this.video.readyState >= HAVE_CURRENT_DATA) this.image = this.video
    } else if (!this.#hasFrameCallback && !this.video.paused) {
      this.needsUpdate = true
    }
    super.update(textureUnit)
  }

  /**
   * Stop following the video and delete the texture.
   */
  remove() {
    if (this.#hasFrameCallback)
      this.video.cancelVideoFrameCallback(this.#frameCallback)
    super.remove()
  }
}
