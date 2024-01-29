import type { WTCGLRenderingContext } from '../types'
import type { Renderer, RenderOptions } from '../core/Renderer'
import { RenderTarget } from '../core/RenderTarget'

export interface FramebufferOptions {
  name: string
  width: number
  height: number
  dpr: number
  tiling: number
  texdepth: number
  minFilter: GLenum
  magFilter: GLenum
  premultiplyAlpha: boolean
  data: Float32Array | null
  depth: boolean
  generateMipmaps: boolean
}

export class Framebuffer {
  static TEXTYPE_FLOAT = 0
  static TEXTYPE_UNSIGNED_BYTE = 1
  static TEXTYPE_HALF_FLOAT_OES = 2
  static IMAGETYPE_REGULAR = 0
  static IMAGETYPE_TILING = 1
  static IMAGETYPE_MIRROR = 2

  gl: WTCGLRenderingContext

  name: string

  depth: boolean

  #readFB: RenderTarget
  #writeFB: RenderTarget
  #width: number
  #height: number
  #pxRatio: number
  #tiling: number = Framebuffer.IMAGETYPE_REGULAR
  #texdepth: number = Framebuffer.TEXTYPE_UNSIGNED_BYTE
  #data: Float32Array | null

  minFilter
  magFilter
  premultiplyAlpha
  generateMipmaps

  constructor(
    gl: WTCGLRenderingContext,
    {
      name = 'FBO',
      width = 512,
      height = 512,
      dpr = Math.min(window.devicePixelRatio, 2),
      tiling = Framebuffer.IMAGETYPE_REGULAR,
      texdepth = Framebuffer.TEXTYPE_UNSIGNED_BYTE,
      minFilter = gl.LINEAR,
      magFilter = minFilter,
      premultiplyAlpha = false,
      data = null,
      depth = true,
      generateMipmaps = false
    }: Partial<FramebufferOptions> = {}
  ) {
    this.gl = gl

    this.name = name
    this.dpr = dpr
    this.tiling = tiling
    this.texdepth = texdepth
    this.data = data
    this.depth = depth

    this.minFilter = minFilter
    this.magFilter = magFilter
    this.premultiplyAlpha = premultiplyAlpha

    this.generateMipmaps = generateMipmaps

    this.resize(width, height)
  }
  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.#readFB = this.createFrameBuffer()
    this.#writeFB = this.createFrameBuffer()
  }
  createFrameBuffer() {
    const t = this.type

    const internalFormat = t === this.gl.FLOAT ? this.gl.RGBA32F : this.gl.RGBA

    const FB = new RenderTarget(this.gl, {
      data: this.data,
      width: this.width * this.dpr,
      height: this.height * this.dpr,
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      wrapS: this.wrap,
      wrapT: this.wrap,
      type: this.type,
      internalFormat: internalFormat,
      premultiplyAlpha: this.premultiplyAlpha,
      depth: this.depth,
      generateMipmaps: this.generateMipmaps
    })
    return FB
  }

  swap() {
    const temp = this.#readFB
    this.#readFB = this.#writeFB
    this.#writeFB = temp
  }

  render(
    renderer: Renderer,
    { scene, camera, update = true, clear, viewport }: RenderOptions
  ) {
    renderer.render({
      scene,
      camera,
      target: this.#writeFB,
      update,
      clear,
      viewport
    })
    if (this.generateMipmaps) {
      // this.gl.bindTexture(this.gl.TEXTURE_2D, this.#writeFB.texture)
      this.gl.generateMipmap(this.gl.TEXTURE_2D)
    }

    this.swap()
  }

  get wrap() {
    switch (this.#tiling) {
      case Framebuffer.IMAGETYPE_REGULAR:
        return this.gl.CLAMP_TO_EDGE
      case Framebuffer.IMAGETYPE_TILING:
        return this.gl.MIRRORED_REPEAT
      case Framebuffer.IMAGETYPE_MIRROR:
        return this.gl.REPEAT
    }
  }

  get type() {
    switch (this.#texdepth) {
      case Framebuffer.TEXTYPE_FLOAT:
        return this.gl.FLOAT
      case Framebuffer.TEXTYPE_UNSIGNED_BYTE:
        return this.gl.UNSIGNED_BYTE
      case Framebuffer.TEXTYPE_HALF_FLOAT_OES: {
        const e = this.gl.getExtension('OES_texture_half_float')
        // console.log(e.HALF_FLOAT_OES)
        // t = this.renderer.isWebgl2 ? this.ctx.HALF_FLOAT : e.HALF_FLOAT_OES;
        return e?.HALF_FLOAT_OES || this.gl.HALF_FLOAT
      }
    }
  }

  get read() {
    return this.#readFB
  }

  get write() {
    return this.#writeFB
  }

  set data(value) {
    if (value instanceof Float32Array) this.#data = value
  }
  get data() {
    return this.#data || null
  }

  set width(value) {
    if (value > 0) this.#width = value
  }
  get width() {
    return this.#width || 1
  }

  set height(value) {
    if (value > 0) this.#height = value
  }
  get height() {
    return this.#height || 1
  }

  set pxRatio(value) {
    if (value > 0) this.#pxRatio = value
  }
  get pxRatio() {
    return this.#pxRatio || 1
  }

  set dpr(value) {
    if (value > 0) this.#pxRatio = value
  }
  get dpr() {
    return this.#pxRatio || 1
  }

  set tiling(value) {
    if (
      [
        Framebuffer.IMAGETYPE_REGULAR,
        Framebuffer.IMAGETYPE_TILING,
        Framebuffer.IMAGETYPE_MIRROR
      ].indexOf(value) > -1
    )
      this.#tiling = value
  }
  get tiling() {
    return this.#tiling
  }

  set texdepth(value) {
    if (
      [
        Framebuffer.TEXTYPE_FLOAT,
        Framebuffer.TEXTYPE_UNSIGNED_BYTE,
        Framebuffer.TEXTYPE_HALF_FLOAT_OES
      ].indexOf(value) > -1
    )
      this.#texdepth = value
  }
  get texdepth() {
    return this.#texdepth
  }
}
