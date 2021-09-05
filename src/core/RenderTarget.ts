import { WTCGLRenderingContext } from '../types'

import { Texture } from './Texture'

/**
 * Create a render target. A render target allows you to render a scene to a texture, instead of to screen. And can be used to either render a different view for composition to a scene, or to create advanced post processing effects.
 */
class RenderTarget {
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
   * The depth buffer.
   */
  depthBuffer: WebGLFramebuffer
  /**
   * The stencil buffer.
   */
  stencilBuffer: WebGLFramebuffer
  /**
   * The depth-stencil buffer.
   */
  depthStencilBuffer: WebGLFramebuffer
  /**
   * The depth texture.
   */
  depthTexture: Texture | null

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
   * @param stencil - Whether to create a stencil buffer
   * @param wrapS - Wrapping
   * @param wrapT - Wrapping
   * @param minFilter - The filter to use when rendering smaller
   * @param magFilter - The filter to use when enlarging
   * @param type - The texture type. Typically one of gl.UNSIGNED_BYTE, gl.FLOAT, ext.HALF_FLOAT_OES
   * @param format - The texture format.
   * @param internalFormat - the texture internalFormat.
   * @param unpackAlignment - The unpack alignment for pixel stores.
   * @param premultiplyAlpha - Whether to use premultiplied alpha for stored textures.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      width = gl.canvas.width,
      height = gl.canvas.height,
      target = gl.FRAMEBUFFER,
      colour = 1,
      depth = true,
      stencil = false,
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      minFilter = gl.LINEAR,
      magFilter = minFilter,
      type = gl.UNSIGNED_BYTE,
      format = gl.RGBA,
      internalFormat = format,
      unpackAlignment = 4,
      premultiplyAlpha = false
    }: {
      width?: number
      height?: number
      target?: GLenum
      colour?: number
      depth?: boolean
      stencil?: boolean
      depthTexture?: Texture | null | boolean
      wrapS?: GLenum
      wrapT?: GLenum
      minFilter?: GLenum
      magFilter?: GLenum
      type?: GLenum
      format?: GLenum
      internalFormat?: GLenum
      unpackAlignment?: 1 | 2 | 4 | 8
      premultiplyAlpha?: boolean
    } = {}
  ) {
    this.gl = gl
    this.width = width
    this.height = height
    this.depth = depth
    this.buffer = this.gl.createFramebuffer()
    this.target = target
    this.gl.bindFramebuffer(this.target, this.buffer)
    
    const e = gl.getExtension('OES_texture_half_float')
    if (type === e?.HALF_FLOAT_OES || type === this.gl.HALF_FLOAT) {
      if (gl.renderer.isWebgl2) {
        internalFormat = this.gl.RGBA16F
      }
    }

    this.textures = []
    const drawBuffers = []

    // create and attach required num of color textures
    for (let i = 0; i < colour; i++) {
      this.textures.push(
        new Texture(gl, {
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
          generateMipmaps: false
        })
      )
      this.textures[i].update()
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.COLOR_ATTACHMENT0 + i,
        this.gl.TEXTURE_2D,
        this.textures[i].texture,
        0 /* level */
      )
      drawBuffers.push(this.gl.COLOR_ATTACHMENT0 + i)
    }

    // For multi-render targets shader access
    if (drawBuffers.length > 1) this.gl.renderer.drawBuffers(drawBuffers)

    // Render buffers
    if (depth && !stencil) {
      this.depthBuffer = this.gl.createRenderbuffer()
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthBuffer)
      this.gl.renderbufferStorage(
        this.gl.RENDERBUFFER,
        this.gl.DEPTH_COMPONENT16,
        width,
        height
      )
      this.gl.framebufferRenderbuffer(
        this.target,
        this.gl.DEPTH_ATTACHMENT,
        this.gl.RENDERBUFFER,
        this.depthBuffer
      )
    }

    if (stencil && !depth) {
      this.stencilBuffer = this.gl.createRenderbuffer()
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.stencilBuffer)
      this.gl.renderbufferStorage(
        this.gl.RENDERBUFFER,
        this.gl.STENCIL_INDEX8,
        width,
        height
      )
      this.gl.framebufferRenderbuffer(
        this.target,
        this.gl.STENCIL_ATTACHMENT,
        this.gl.RENDERBUFFER,
        this.stencilBuffer
      )
    }

    if (depth && stencil) {
      this.depthStencilBuffer = this.gl.createRenderbuffer()
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthStencilBuffer)
      this.gl.renderbufferStorage(
        this.gl.RENDERBUFFER,
        this.gl.DEPTH_STENCIL,
        width,
        height
      )
      this.gl.framebufferRenderbuffer(
        this.target,
        this.gl.DEPTH_STENCIL_ATTACHMENT,
        this.gl.RENDERBUFFER,
        this.depthStencilBuffer
      )
    }

    this.gl.bindFramebuffer(this.target, null)
  }

  /**
   * Returns the first texture, for the majority os use cases.
   */
  get texture() {
    return this.textures[0]
  }
}

export { RenderTarget }
