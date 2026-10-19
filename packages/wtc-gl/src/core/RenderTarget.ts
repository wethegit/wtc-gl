import type { WTCGLRenderingContext } from '../types'

import { Texture, type TextureData } from './Texture'

export interface RenderTargetOptions {
  data: TextureData | null
  width: number
  height: number
  target: GLenum
  colour: number
  depth: boolean
  stencil: boolean
  depthTexture: Texture | null | boolean
  depthFormat: GLenum
  wrapS: GLenum
  wrapT: GLenum
  minFilter: GLenum
  magFilter: GLenum
  type: GLenum
  format: GLenum
  internalFormat: GLenum
  unpackAlignment: 1 | 2 | 4 | 8
  premultiplyAlpha: boolean
  generateMipmaps: boolean
}

/**
 * Create a render target. A render target allows you to render a scene to a texture, instead of to screen. And can be used to either render a different view for composition to a scene, or to create advanced post processing effects.
 */
export class RenderTarget {
  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext
  /**
   * The WebGL frame buffer object to render to.
   */
  buffer: WebGLFramebuffer
  /**
   * The texture array. If you supply only one colour, you can just output this as you normally would with gl_FragColor, otherwise you need to output one at a time with gl_FragData[x]
   */
  textures: Texture[]
  /**
   * The depth (or depth-stencil) texture, if the depth buffer is a texture.
   */
  depthTexture: Texture | null = null
  /**
   * The depth and/or stencil renderbuffer, used when the depth buffer isn't a
   * texture or there's only a stencil buffer.
   */
  depthBuffer: WebGLRenderbuffer | null = null

  // The context generation this target was created for
  #contextVersion: number
  // The internal format and attachment point of `depthBuffer`
  #depthBufferFormat: GLenum = 0
  #depthAttachment: GLenum = 0
  // Whether the depth texture was created here, so is deleted by `remove`
  #ownsDepthTexture = false

  /**
   * The width of the target.
   */
  width: number
  /**
   * The height of the target.
   */
  height: number

  /**
   * Whether to render a depth buffer.
   */
  depth: boolean
  /**
   * Whether to render a stencil buffer.
   */
  stencil: boolean

  /**
   * A GLEnum representing the binding point for the texture / buffer.
   * @default gl.FRAMEBUFFER
   */
  target: GLenum

  /**
   * Create a render target object.
   * @param {WTCGLRenderingContext} gl - The WTCGL Rendering context
   * @param __namedParameters - The parameters to initialise the renderer.
   * @param width - The width of the render target.
   * @param height - The height of the render target.
   * @param target - The binding point for the frame buffers.
   * @param colour - The number of colour attachments to create.
   * @param depth - Whether to create a depth buffer
   * @param stencil - Whether to create a stencil buffer. With `depth`, the
   * two share a `DEPTH24_STENCIL8` texture or renderbuffer.
   * @param depthTexture - Whether the depth buffer is a texture you can
   * sample (`true`), a renderbuffer (`false`), or a `Texture` to use. A
   * stencil buffer on its own is always a renderbuffer.
   * @param depthFormat - The depth buffer's internal format. Defaults to
   * `DEPTH_COMPONENT24` (`DEPTH24_STENCIL8` with `stencil`).
   * @param wrapS - Wrapping
   * @param wrapT - Wrapping
   * @param minFilter - The filter to use when rendering smaller
   * @param magFilter - The filter to use when enlarging
   * @param type - The texture type. Typically one of gl.UNSIGNED_BYTE, gl.FLOAT, gl.HALF_FLOAT
   * @param format - The texture format.
   * @param internalFormat - the texture internalFormat.
   * @param unpackAlignment - The unpack alignment for pixel stores.
   * @param premultiplyAlpha - Whether to use premultiplied alpha for stored textures.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      data,
      width = gl.canvas.width,
      height = gl.canvas.height,
      target = gl.FRAMEBUFFER,
      colour = 1,
      depth = true,
      stencil = false,
      depthTexture = true,
      depthFormat,
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      minFilter = gl.LINEAR,
      magFilter = minFilter,
      type = gl.UNSIGNED_BYTE,
      format = gl.RGBA,
      internalFormat = format,
      unpackAlignment = 4,
      premultiplyAlpha = false,
      generateMipmaps = false
    }: Partial<RenderTargetOptions> = {}
  ) {
    this.gl = gl
    this.width = width
    this.height = height
    this.depth = depth
    this.stencil = stencil
    this.buffer = this.gl.createFramebuffer()!
    this.target = target

    if (type === gl.HALF_FLOAT) internalFormat = gl.RGBA16F

    this.textures = []

    // create required num of color textures
    for (let i = 0; i < colour; i++) {
      this.textures.push(
        new Texture(gl, {
          data,
          width,
          height,
          wrapS,
          wrapT,
          minFilter,
          magFilter,
          type,
          format,
          internalFormat,
          unpackAlignment,
          premultiplyAlpha,
          flipY: false,
          generateMipmaps
        })
      )
    }

    this.#depthAttachment =
      depth && stencil
        ? gl.DEPTH_STENCIL_ATTACHMENT
        : depth
          ? gl.DEPTH_ATTACHMENT
          : gl.STENCIL_ATTACHMENT

    if (depthTexture instanceof Texture) {
      this.depthTexture = depthTexture
    } else if (depth && depthTexture) {
      const internalFormat =
        depthFormat ?? (stencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT24)
      this.depthTexture = new Texture(gl, {
        width,
        height,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
        generateMipmaps: false,
        format: stencil ? gl.DEPTH_STENCIL : gl.DEPTH_COMPONENT,
        internalFormat,
        type: getDepthType(gl, internalFormat, stencil)
      })
      this.#ownsDepthTexture = true
    } else if (depth || stencil) {
      this.#depthBufferFormat = !depth
        ? gl.STENCIL_INDEX8
        : (depthFormat ??
          (stencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT24))
    }

    this.#attach()

    this.#contextVersion = gl.renderer.contextVersion
    gl.renderer.track(this)
  }

  /**
   * Upload the textures and attach them to the framebuffer.
   */
  #attach() {
    // Bind through the renderer so its cached framebuffer state stays in sync
    this.gl.renderer.bindFramebuffer({
      target: this.target,
      buffer: this.buffer
    })

    const drawBuffers: GLenum[] = []
    this.textures.forEach((texture, i) => {
      texture.update()
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.COLOR_ATTACHMENT0 + i,
        this.gl.TEXTURE_2D,
        texture.texture,
        0 /* level */
      )
      drawBuffers.push(this.gl.COLOR_ATTACHMENT0 + i)
    })

    // For multi-render targets shader access
    if (drawBuffers.length > 1) this.gl.drawBuffers(drawBuffers)

    if (this.depthTexture) {
      this.depthTexture.update()
      this.gl.framebufferTexture2D(
        this.target,
        this.#depthAttachment,
        this.gl.TEXTURE_2D,
        this.depthTexture.texture,
        0 /* level */
      )
    } else if (this.#depthBufferFormat) {
      const gl = this.gl
      this.depthBuffer = gl.createRenderbuffer()!
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer)
      gl.renderbufferStorage(
        gl.RENDERBUFFER,
        this.#depthBufferFormat,
        this.width,
        this.height
      )
      gl.framebufferRenderbuffer(
        this.target,
        this.#depthAttachment,
        gl.RENDERBUFFER,
        this.depthBuffer
      )
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    }

    this.gl.renderer.bindFramebuffer({ target: this.target })
  }

  /**
   * Resize the target's textures and depth/stencil buffer in place, keeping
   * the same framebuffer and texture objects (so uniforms that hold them stay
   * valid). The contents are lost, and any `data` the textures were created
   * with is dropped. A depth texture passed in through `depthTexture` is
   * resized too, as the framebuffer needs every attachment to be one size.
   * @param width - The new width, in pixels.
   * @param height - The new height, in pixels.
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height

    const textures = this.depthTexture
      ? [...this.textures, this.depthTexture]
      : this.textures
    for (const texture of textures) {
      texture.width = width
      texture.height = height
      texture.data = null
      texture.needsUpdate = true
      // Reallocates the storage; the framebuffer attachment stays valid
      texture.update()
    }

    if (this.depthBuffer) {
      const gl = this.gl
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer)
      gl.renderbufferStorage(
        gl.RENDERBUFFER,
        this.#depthBufferFormat,
        width,
        height
      )
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    }
  }

  /**
   * Recreate the framebuffer and its textures after the WebGL context has
   * been restored. The contents are lost. Called by the renderer.
   */
  restoreContext(): void {
    if (this.#contextVersion === this.gl.renderer.contextVersion) return
    this.#contextVersion = this.gl.renderer.contextVersion

    this.textures.forEach((texture) => texture.restoreContext())
    this.depthTexture?.restoreContext()
    this.buffer = this.gl.createFramebuffer()!
    this.#attach()
  }

  /**
   * Returns the first texture, for the majority os use cases.
   */
  get texture() {
    return this.textures[0]
  }

  /**
   * Delete the framebuffer along with its colour textures and depth buffer. A
   * depth texture passed in through `depthTexture` is left alone. If the
   * target is currently bound, the canvas is bound in its place.
   */
  remove() {
    if (this.gl.renderer.state.framebuffer === this.buffer)
      this.gl.renderer.bindFramebuffer({ target: this.target })
    this.gl.deleteFramebuffer(this.buffer)
    this.textures.forEach((texture) => texture.remove())
    if (this.#ownsDepthTexture) this.depthTexture?.remove()
    if (this.depthBuffer) this.gl.deleteRenderbuffer(this.depthBuffer)
    this.gl.renderer.untrack(this)
  }
}

/**
 * The texture type a depth internal format needs.
 */
function getDepthType(
  gl: WTCGLRenderingContext,
  internalFormat: GLenum,
  stencil: boolean
): GLenum {
  switch (internalFormat) {
    case gl.DEPTH_COMPONENT32F:
      return gl.FLOAT
    case gl.DEPTH32F_STENCIL8:
      return gl.FLOAT_32_UNSIGNED_INT_24_8_REV
    case gl.DEPTH24_STENCIL8:
      return gl.UNSIGNED_INT_24_8
  }
  return stencil ? gl.UNSIGNED_INT_24_8 : gl.UNSIGNED_INT
}
