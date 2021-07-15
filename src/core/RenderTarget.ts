import { WTCGLRenderingContext } from './types'

// TODO: multi target rendering
// TODO: test stencil and depth
// TODO: destroy
// TODO: blit on resize?
import { Texture } from './Texture'

class RenderTarget {
  gl: WTCGLRenderingContext
  buffer: WebGLFramebuffer
  textures: Texture[]
  texture: Texture
  depthBuffer: WebGLFramebuffer
  stencilBuffer: WebGLFramebuffer
  depthStencilBuffer: WebGLFramebuffer
  depthTexture: Texture | null

  width: number
  height: number

  depth: boolean
  stencil: boolean

  target: GLenum

  constructor(
    gl: WTCGLRenderingContext,
    {
      width = gl.canvas.width,
      height = gl.canvas.height,
      target = gl.FRAMEBUFFER,
      colour = 1, // number of color attachments
      depth = true,
      stencil = false,
      depthTexture = null, // note - stencil breaks
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      minFilter = gl.LINEAR,
      magFilter = minFilter,
      type = gl.UNSIGNED_BYTE,
      format = gl.RGBA,
      internalFormat = format,
      unpackAlignment,
      premultiplyAlpha
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

    // alias for majority of use cases
    this.texture = this.textures[0]

    // note depth textures break stencil - so can't use together
    if (
      depthTexture &&
      (this.gl.renderer.isWebgl2 ||
        this.gl.renderer.getExtension('WEBGL_depth_texture'))
    ) {
      this.depthTexture = new Texture(gl, {
        width,
        height,
        minFilter: this.gl.NEAREST,
        magFilter: this.gl.NEAREST,
        format: this.gl.DEPTH_COMPONENT,
        internalFormat: gl.renderer.isWebgl2
          ? this.gl.DEPTH_COMPONENT16
          : this.gl.DEPTH_COMPONENT,
        type: this.gl.UNSIGNED_INT
      })
      this.depthTexture.update()
      this.gl.framebufferTexture2D(
        this.target,
        this.gl.DEPTH_ATTACHMENT,
        this.gl.TEXTURE_2D,
        this.depthTexture.texture,
        0 /* level */
      )
    } else {
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
    }

    this.gl.bindFramebuffer(this.target, null)
  }
}

export { RenderTarget }
