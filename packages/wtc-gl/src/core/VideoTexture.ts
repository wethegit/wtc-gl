import type { WTCGLRenderingContext } from '../types'

import { Texture, type TextureOptions } from './Texture'

// HTMLMediaElement.HAVE_CURRENT_DATA, as a literal so this works without a window
const HAVE_CURRENT_DATA = 2

/**
 * Options for creating a {@link VideoTexture}: texture options other than
 * `image` and `data`, plus the video to follow. Unlike a plain texture,
 * `generateMipmaps` defaults to false.
 * @category Core
 */
export interface VideoTextureOptions extends Partial<
  Omit<TextureOptions, 'image' | 'data'>
> {
  /** The video element to follow. It doesn't need to have loaded yet. */
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
 * @category Core
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
   * @param options - Texture options, plus the video to follow; see {@link VideoTextureOptions}.
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
   * @param textureUnit - The texture unit to update against.
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
