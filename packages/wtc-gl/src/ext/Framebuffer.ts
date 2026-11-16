import type { WTCGLRenderingContext } from '../types'
import type { Renderer, RenderOptions } from '../core/Renderer'
import { RenderTarget } from '../core/RenderTarget'

/**
 * Options passed to the {@link Framebuffer} constructor.
 * @category Core
 */
export interface FramebufferOptions {
  /**
   * A name, for telling framebuffers apart when debugging.
   * @default 'FBO'
   */
  name: string
  /**
   * The width in CSS pixels. The targets are `width * dpr` pixels wide.
   * @default 512
   */
  width: number
  /**
   * The height in CSS pixels. The targets are `height * dpr` pixels high.
   * @default 512
   */
  height: number
  /**
   * The device pixel ratio the width and height are scaled by.
   * @default Math.min(devicePixelRatio, 2)
   */
  dpr: number
  /**
   * How the textures wrap: one of the `Framebuffer.IMAGETYPE_*` constants.
   * @default Framebuffer.IMAGETYPE_REGULAR
   */
  tiling: number
  /**
   * The texture data type: one of the `Framebuffer.TEXTYPE_*` constants.
   * @default Framebuffer.TEXTYPE_UNSIGNED_BYTE
   */
  texdepth: number
  /**
   * The texture minification filter.
   * @default gl.LINEAR
   */
  minFilter: GLenum
  /**
   * The texture magnification filter. Defaults to `minFilter`.
   * @default minFilter
   */
  magFilter: GLenum
  /**
   * Whether the textures premultiply alpha.
   * @default false
   */
  premultiplyAlpha: boolean
  /**
   * Initial texture data, for seeding a simulation.
   * @default null
   */
  data: Float32Array | null
  /**
   * Whether the targets have a depth buffer.
   * @default true
   */
  depth: boolean
  /**
   * Whether mipmaps are generated for the written texture after each render.
   * @default false
   */
  generateMipmaps: boolean
}

/**
 * A pair of render targets that swap after each render, for ping-pong effects
 * such as feedback and GPU simulations. `render` draws into `write` and then
 * swaps, so `read` always holds the latest frame.
 * @category Core
 */
export class Framebuffer {
  /** `texdepth` for 32-bit float textures (`gl.FLOAT`, `RGBA32F`). */
  static TEXTYPE_FLOAT = 0
  /** `texdepth` for 8-bit textures (`gl.UNSIGNED_BYTE`). */
  static TEXTYPE_UNSIGNED_BYTE = 1
  /** `texdepth` for 16-bit float textures (`gl.HALF_FLOAT`). */
  static TEXTYPE_HALF_FLOAT = 2
  /**
   * @deprecated Use `TEXTYPE_HALF_FLOAT`.
   */
  static TEXTYPE_HALF_FLOAT_OES = 2
  /** `tiling` that clamps to the edge (`gl.CLAMP_TO_EDGE`). */
  static IMAGETYPE_REGULAR = 0
  /** `tiling` that repeats (`gl.REPEAT`). */
  static IMAGETYPE_TILING = 1
  /** `tiling` that repeats mirrored (`gl.MIRRORED_REPEAT`). */
  static IMAGETYPE_MIRROR = 2

  /** The WebGL context the targets belong to. */
  gl: WTCGLRenderingContext

  /** A name, for telling framebuffers apart when debugging. */
  name: string

  /** Whether the targets have a depth buffer. */
  depth: boolean

  #readFB: RenderTarget
  #writeFB: RenderTarget
  #width = 512
  #height = 512
  #pxRatio = 1
  #tiling: number = Framebuffer.IMAGETYPE_REGULAR
  #texdepth: number = Framebuffer.TEXTYPE_UNSIGNED_BYTE
  #data: Float32Array | null = null

  /** The texture minification filter. */
  minFilter
  /** The texture magnification filter. */
  magFilter
  /** Whether the textures premultiply alpha. */
  premultiplyAlpha
  /** Whether mipmaps are generated for the written texture after each render. */
  generateMipmaps

  /**
   * @param gl - The WebGL context.
   * @param options - The size, format and filtering of the targets.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      name = 'FBO',
      width = 512,
      height = 512,
      dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2),
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

    this.width = width
    this.height = height
    this.#readFB = this.createFrameBuffer()
    this.#writeFB = this.createFrameBuffer()
  }
  /**
   * Set a new size and recreate both targets, deleting the old ones. Their
   * contents are lost, and other settings changed since are applied.
   * @param width - The width in CSS pixels.
   * @param height - The height in CSS pixels.
   */
  resize(width: number, height: number) {
    this.width = width
    this.height = height
    // Free the previous targets, otherwise every resize leaks two of them
    this.remove()
    this.#readFB = this.createFrameBuffer()
    this.#writeFB = this.createFrameBuffer()
  }
  /**
   * Make a render target with the current settings. Used for the read and
   * write targets; it isn't kept or swapped.
   * @returns The new render target.
   */
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

  /** Swap the read and write targets. */
  swap() {
    const temp = this.#readFB
    this.#readFB = this.#writeFB
    this.#writeFB = temp
  }

  /**
   * Render a scene into the write target, generate its mipmaps if
   * `generateMipmaps` is set, then swap, so the result is in `read`.
   * @param renderer - The renderer to draw with.
   * @param options - The scene and camera. Only `scene`, `camera`, `update`
   *   (default `true`), `clear` and `viewport` are passed on.
   */
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
      // generateMipmap acts on the bound texture, so bind the one just written
      this.#writeFB.texture.bind()
      this.gl.generateMipmap(this.gl.TEXTURE_2D)
    }

    this.swap()
  }

  /**
   * Delete both render targets and their textures.
   */
  remove() {
    this.#readFB?.remove()
    this.#writeFB?.remove()
  }

  /** The GL wrap mode for the current `tiling`. */
  get wrap() {
    switch (this.#tiling) {
      case Framebuffer.IMAGETYPE_REGULAR:
        return this.gl.CLAMP_TO_EDGE
      case Framebuffer.IMAGETYPE_TILING:
        return this.gl.REPEAT
      case Framebuffer.IMAGETYPE_MIRROR:
        return this.gl.MIRRORED_REPEAT
    }
  }

  /** The GL texture type for the current `texdepth`. */
  get type() {
    switch (this.#texdepth) {
      case Framebuffer.TEXTYPE_FLOAT:
        return this.gl.FLOAT
      case Framebuffer.TEXTYPE_UNSIGNED_BYTE:
        return this.gl.UNSIGNED_BYTE
      case Framebuffer.TEXTYPE_HALF_FLOAT:
        return this.gl.HALF_FLOAT
    }
  }

  /** The target holding the last rendered frame, to sample from. */
  get read() {
    return this.#readFB
  }

  /** The target the next render draws into. */
  get write() {
    return this.#writeFB
  }

  /** Set the initial texture data. Anything but a `Float32Array` is ignored. */
  set data(value) {
    if (value instanceof Float32Array) this.#data = value
  }
  /** The initial texture data the targets are made with, or null. */
  get data() {
    return this.#data || null
  }

  /** Set the width in CSS pixels. Values of 0 or less are ignored. */
  set width(value) {
    if (value > 0) this.#width = value
  }
  /** The width in CSS pixels. */
  get width() {
    return this.#width || 1
  }

  /** Set the height in CSS pixels. Values of 0 or less are ignored. */
  set height(value) {
    if (value > 0) this.#height = value
  }
  /** The height in CSS pixels. */
  get height() {
    return this.#height || 1
  }

  /** Set the pixel ratio. The same as setting `dpr`. */
  set pxRatio(value) {
    if (value > 0) this.#pxRatio = value
  }
  /** The pixel ratio. The same as `dpr`. */
  get pxRatio() {
    return this.#pxRatio || 1
  }

  /** Set the device pixel ratio. Values of 0 or less are ignored. */
  set dpr(value) {
    if (value > 0) this.#pxRatio = value
  }
  /** The device pixel ratio the width and height are scaled by. */
  get dpr() {
    return this.#pxRatio || 1
  }

  /** Set the wrap mode. Values other than the `IMAGETYPE_*` constants are ignored. */
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
  /** How the textures wrap: one of the `IMAGETYPE_*` constants. */
  get tiling() {
    return this.#tiling
  }

  /** Set the data type. Values other than the `TEXTYPE_*` constants are ignored. */
  set texdepth(value) {
    if (
      [
        Framebuffer.TEXTYPE_FLOAT,
        Framebuffer.TEXTYPE_UNSIGNED_BYTE,
        Framebuffer.TEXTYPE_HALF_FLOAT
      ].indexOf(value) > -1
    )
      this.#texdepth = value
  }
  /** The texture data type: one of the `TEXTYPE_*` constants. */
  get texdepth() {
    return this.#texdepth
  }
}
