import type { WTCGLTextureState, WTCGLRenderingContext } from '../types'

const emptyPixel = new Uint8Array(4)

let ID = 1

/**
 * Sources that can be uploaded as an image. `ImageBitmap` ignores `flipY` and
 * `premultiplyAlpha`; set `imageOrientation` and `premultiplyAlpha` in
 * `createImageBitmap` instead.
 * @category Core
 */
export type TextureImage =
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas

/**
 * Typed arrays that can be uploaded as texture data. The array type has to
 * match `type`, e.g. `Uint8Array` with `gl.UNSIGNED_BYTE`, `Float32Array`
 * with `gl.FLOAT`, `Uint16Array` with `gl.HALF_FLOAT` or `gl.UNSIGNED_SHORT`.
 * @category Core
 */
export type TextureData =
  | Float32Array
  | Uint8Array
  | Uint8ClampedArray
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array

type ImageTypes = TextureImage

/**
 * Options for `Texture.fromURL`: texture options, and a signal to abort.
 * @category Core
 */
export type TextureLoadOptions = Partial<TextureOptions> & {
  /** Aborts the fetch when signalled. */
  signal?: AbortSignal
}

/**
 * Options for creating a {@link Texture}.
 * @category Core
 */
export interface TextureOptions {
  /** The image to upload, or six images (+X, -X, +Y, -Y, +Z, -Z) for a cube map. */
  image: ImageTypes | ImageTypes[]
  /** Typed array data for a data texture. Needs `width` and `height`. */
  data: TextureData | null
  /** The binding point, e.g. `gl.TEXTURE_2D` or `gl.TEXTURE_CUBE_MAP`. @default gl.TEXTURE_2D */
  target: GLenum
  /** The data type of the pixels, e.g. `gl.UNSIGNED_BYTE`, `gl.FLOAT` or `gl.HALF_FLOAT`. @default gl.UNSIGNED_BYTE */
  type: GLenum
  /** The format of the pixel data. @default gl.RGBA */
  format: GLenum
  /** The format the texture is stored in on the GPU, e.g. `gl.RGBA32F`. @default the same as `format` */
  internalFormat: GLenum
  /** Horizontal wrapping: `gl.CLAMP_TO_EDGE`, `gl.REPEAT` or `gl.MIRRORED_REPEAT`. @default gl.CLAMP_TO_EDGE */
  wrapS: GLenum
  /** Vertical wrapping: `gl.CLAMP_TO_EDGE`, `gl.REPEAT` or `gl.MIRRORED_REPEAT`. @default gl.CLAMP_TO_EDGE */
  wrapT: GLenum
  /** Whether to generate mipmaps after each upload. @default true */
  generateMipmaps: boolean
  /** The filter used when the texture is drawn smaller. @default gl.NEAREST_MIPMAP_LINEAR with mipmaps, otherwise gl.LINEAR */
  minFilter: GLenum
  /** The filter used when the texture is drawn larger. @default gl.LINEAR */
  magFilter: GLenum
  /** Whether to premultiply the colour by alpha on upload. Ignored for `ImageBitmap`s. @default false */
  premultiplyAlpha: boolean
  /** The row alignment of the pixel data, in bytes. @default 4 */
  unpackAlignment: 1 | 2 | 4 | 8
  /** Whether to flip the image vertically on upload. Ignored for `ImageBitmap`s. @default true for gl.TEXTURE_2D, otherwise false */
  flipY: boolean
  /** The anisotropic filtering level, capped at the device's maximum. 0 turns it off. @default 0 */
  anisotropy: number
  /** For a depth texture, the comparison a `sampler2DShadow` makes, or null for none. @default null */
  compareFunc: GLenum | null
  /** The mipmap level the image is uploaded to. @default 0 */
  level: number
  /** The width in pixels, for data textures and render targets. Images set their own. */
  width: number
  /** The height in pixels, for data textures and render targets. Images set their own. @default the same as `width` */
  height: number
}

/**
 * A texture class contains image data for use in a shader. Along with the image data, the texture contains state variable that determine how secondary conditions, like wrapping and interpolation work.
 * @category Core
 */
export class Texture {
  /**
   * A unique ID for the texture object, allows us to determine whether a texture has already been bound or not.
   */
  id: number

  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext

  /**
   * The image representing the texture. Can be an HTML image, video or
   * canvas, an `ImageBitmap` or an `OffscreenCanvas`.
   */
  image?: ImageTypes | ImageTypes[]
  /**
   * Typed array data for a data texture. Needs `width` and `height`.
   */
  data: TextureData | null = null

  /**
   * The WebGL texture object containing the data and state for WebGL
   */
  texture: WebGLTexture

  /**
   * The width of the texture. 0 until known.
   */
  width = 0
  /**
   * The height of the texture. 0 until known.
   */
  height = 0

  /**
   * The binding point for the texture.
   * @default gl.TEXTURE_2D
   */
  target: GLenum
  /**
   * The texture type. Typically one of gl.UNSIGNED_BYTE, gl.FLOAT, gl.HALF_FLOAT
   * @default gl.UNSIGNED_BYTE
   */
  type: GLenum
  /**
   * The texture format.
   * @default gl.RGBA
   */
  format: GLenum
  /**
   * the texture internal format.
   * @default gl.RGBA
   */
  internalFormat: GLenum
  /**
   * The filter to use when rendering smaller.
   */
  minFilter: GLenum
  /**
   * The filter to use when rendering larger.
   */
  magFilter: GLenum
  /**
   * Wrapping. Normally one of gl.CLAMP_TO_EDGE, gl.REPEAT, gl.MIRRORED REPEAT
   * @default gl.CLAMP_TO_EDGE
   */
  wrapS: GLenum
  /**
   * Wrapping. Normally one of gl.CLAMP_TO_EDGE, gl.REPEAT, gl.MIRRORED REPEAT
   * @default gl.CLAMP_TO_EDGE
   */
  wrapT: GLenum

  /**
   * Whether to generate mipmaps for this texture. WebGL2 can mipmap textures
   * of any size.
   * @default true
   */
  generateMipmaps: boolean
  /**
   * Whether the texture is interpolated as having premultiplied alpha.
   * @default false
   */
  premultiplyAlpha: boolean
  /**
   * Whether to flip the Y direction of the texture
   */
  flipY: boolean

  /**
   * The unpack alignment for pixel stores.
   */
  unpackAlignment: 1 | 2 | 4 | 8
  /**
   * The anistropic filtering level for the texture.
   * @default 0
   */
  anisotropy: number
  /**
   * For a depth texture, compare against a reference value when sampled
   * instead of returning the depth: `gl.LEQUAL`, `gl.LESS` and so on. A
   * shader reads it with a `sampler2DShadow`, and LINEAR filtering then
   * gives 2×2 percentage-closer filtering for free. Null for no comparison.
   * @default null
   */
  compareFunc: GLenum | null
  /**
   * A GLint specifying the level of detail. Level 0 is the base image level and level n is the nth mipmap reduction level. Only relevant if we have mipmaps.
   * @default 0
   */
  level: number

  /**
   * The image store
   */
  store: {
    /** The image last uploaded, compared with `image` to see if it changed. */
    image?: ImageTypes | ImageTypes[]
  }
  /**
   * Texture state, contains the basic texture properties.
   */
  state: WTCGLTextureState

  /**
   * Whether the texture needs an update in memory
   */
  needsUpdate: boolean

  // The context generation this texture was created for
  #contextVersion: number

  /**
   * Load an image from a URL into a texture. It's fetched, then decoded off
   * the main thread with `createImageBitmap`, which also does the flipping
   * and premultiplying (`flipY` and `premultiplyAlpha` here). Rejects if the
   * request fails.
   *
   * ```ts
   * const texture = await Texture.fromURL(gl, '/photo.jpg', { wrapS: gl.REPEAT })
   * ```
   * @param gl - The WTCGL rendering context.
   * @param url - Where the image is.
   * @param options - Texture options, plus a `signal` to abort the request.
   */
  static async fromURL(
    gl: WTCGLRenderingContext,
    url: string,
    { signal, ...options }: TextureLoadOptions = {}
  ): Promise<Texture> {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(
        `Texture.fromURL: ${url} failed with ${response.status} ${response.statusText}`
      )
    }
    return Texture.fromBlob(gl, await response.blob(), options)
  }

  /**
   * Decode an image blob into a texture, as `fromURL` does once it has
   * fetched one.
   * @param gl - The WTCGL rendering context.
   * @param blob - The encoded image, e.g. a PNG or JPEG.
   * @param options - Texture options.
   */
  static async fromBlob(
    gl: WTCGLRenderingContext,
    blob: Blob,
    options: Partial<TextureOptions> = {}
  ): Promise<Texture> {
    // Every 2D texture is flipped by default; an ImageBitmap has to be
    // flipped as it's decoded instead
    const { flipY = true, premultiplyAlpha = false } = options
    const image = await createImageBitmap(blob, {
      imageOrientation: flipY ? 'flipY' : 'from-image',
      premultiplyAlpha: premultiplyAlpha ? 'premultiply' : 'none',
      colorSpaceConversion: 'none'
    })
    return new Texture(gl, { ...options, image })
  }

  /**
   * Create a texture. Nothing is uploaded until it's first used.
   * @param gl - The WTCGL Rendering context
   * @param options - The texture's source and sampling settings; see {@link TextureOptions}.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      image,
      data,
      target = gl.TEXTURE_2D,
      type = gl.UNSIGNED_BYTE,
      format = gl.RGBA,
      internalFormat = format,
      wrapS = gl.CLAMP_TO_EDGE,
      wrapT = gl.CLAMP_TO_EDGE,
      generateMipmaps = true,
      minFilter = generateMipmaps ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR,
      magFilter = gl.LINEAR,
      premultiplyAlpha = false,
      unpackAlignment = 4,
      flipY = target == gl.TEXTURE_2D ? true : false,
      anisotropy = 0,
      compareFunc = null,
      level = 0,
      width, // used for RenderTargets or Data Textures
      height = width
    }: Partial<TextureOptions> = {}
  ) {
    this.gl = gl
    this.id = ID++

    if (image) this.image = image

    if (data) this.data = data

    this.target = target
    this.type = type
    this.format = format
    this.internalFormat = internalFormat
    this.minFilter = minFilter
    this.magFilter = magFilter
    this.wrapS = wrapS
    this.wrapT = wrapT
    this.generateMipmaps = generateMipmaps
    this.premultiplyAlpha = premultiplyAlpha
    this.unpackAlignment = unpackAlignment
    this.flipY = flipY
    this.anisotropy = Math.min(
      anisotropy,
      this.gl.renderer.parameters.maxAnisotropy
    )
    this.compareFunc = compareFunc
    this.level = level

    if (width) this.width = width

    if (height) this.height = height

    this.texture = this.gl.createTexture()!

    this.store = {
      image: undefined
    }

    // State store to avoid redundant calls for per-texture state
    this.state = defaultTextureState(gl)

    this.needsUpdate = true

    this.#contextVersion = gl.renderer.contextVersion
    gl.renderer.track(this)
  }

  /**
   * Recreate the WebGL texture after the context has been restored and
   * re-upload the image or data on next use. Called by the renderer.
   */
  restoreContext(): void {
    if (this.#contextVersion === this.gl.renderer.contextVersion) return
    this.#contextVersion = this.gl.renderer.contextVersion

    this.texture = this.gl.createTexture()!
    this.store.image = undefined
    this.state = defaultTextureState(this.gl)
    this.needsUpdate = true
  }

  /**
   * Bind the texture. Skips over if it's determined that the texture is already bound.
   */
  bind() {
    // Already bound to active texture unit
    if (
      this.gl.renderer.state.textureUnits[
        this.gl.renderer.state.activeTextureUnit
      ] === this.id
    )
      return
    this.gl.bindTexture(this.target, this.texture)
    this.gl.renderer.state.textureUnits[
      this.gl.renderer.state.activeTextureUnit
    ] = this.id
  }

  /**
   * Update the texture in graphics memory to the internal image and perform various state updates on an as-needs basis.
   * @param textureUnit - The texture unit to update against.
   */
  update(textureUnit = 0) {
    const needsUpdate = !(this.image === this.store.image && !this.needsUpdate)

    // Make sure that texture is bound to its texture unit
    if (
      needsUpdate ||
      this.gl.renderer.state.textureUnits[textureUnit] !== this.id
    ) {
      // set active texture unit to perform texture functions
      this.gl.renderer.activeTexture = textureUnit
      this.bind()
    }

    if (!needsUpdate) return
    this.needsUpdate = false

    if (this.flipY !== this.gl.renderer.state.flipY) {
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, this.flipY)
      this.gl.renderer.state.flipY = this.flipY
    }

    if (this.premultiplyAlpha !== this.gl.renderer.state.premultiplyAlpha) {
      this.gl.pixelStorei(
        this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        this.premultiplyAlpha
      )
      this.gl.renderer.state.premultiplyAlpha = this.premultiplyAlpha
    }

    if (this.unpackAlignment !== this.gl.renderer.state.unpackAlignment) {
      this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, this.unpackAlignment)
      this.gl.renderer.state.unpackAlignment = this.unpackAlignment
    }

    if (this.minFilter !== this.state.minFilter) {
      this.gl.texParameteri(
        this.target,
        this.gl.TEXTURE_MIN_FILTER,
        this.minFilter
      )
      this.state.minFilter = this.minFilter
    }

    if (this.magFilter !== this.state.magFilter) {
      this.gl.texParameteri(
        this.target,
        this.gl.TEXTURE_MAG_FILTER,
        this.magFilter
      )
      this.state.magFilter = this.magFilter
    }

    if (this.wrapS !== this.state.wrapS) {
      this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_S, this.wrapS)
      this.state.wrapS = this.wrapS
    }

    if (this.wrapT !== this.state.wrapT) {
      this.gl.texParameteri(this.target, this.gl.TEXTURE_WRAP_T, this.wrapT)
      this.state.wrapT = this.wrapT
    }

    if (this.anisotropy && this.anisotropy !== this.state.anisotropy) {
      const ext = this.gl.renderer.getExtension(
        'EXT_texture_filter_anisotropic'
      )
      if (ext)
        this.gl.texParameterf(
          this.target,
          ext.TEXTURE_MAX_ANISOTROPY_EXT,
          this.anisotropy
        )
      this.state.anisotropy = this.anisotropy
    }

    if (this.compareFunc !== this.state.compareFunc) {
      if (this.compareFunc === null) {
        this.gl.texParameteri(
          this.target,
          this.gl.TEXTURE_COMPARE_MODE,
          this.gl.NONE
        )
      } else {
        if (this.state.compareFunc === null) {
          this.gl.texParameteri(
            this.target,
            this.gl.TEXTURE_COMPARE_MODE,
            this.gl.COMPARE_REF_TO_TEXTURE
          )
        }
        this.gl.texParameteri(
          this.target,
          this.gl.TEXTURE_COMPARE_FUNC,
          this.compareFunc
        )
      }
      this.state.compareFunc = this.compareFunc
    }

    if (this.image || this.data) {
      // Checked by property rather than instanceof, because the HTML element
      // classes don't exist in workers
      const image = this.image
      if (image && !Array.isArray(image)) {
        if ('videoWidth' in image) {
          this.width = image.videoWidth
          this.height = image.videoHeight
        } else if ('naturalWidth' in image) {
          // `.width`/`.height` on HTMLImageElement reflect layout/CSS sizing, not
          // the source bitmap. Use natural dimensions so the full image uploads.
          this.width = image.naturalWidth
          this.height = image.naturalHeight
        } else {
          this.width = image.width
          this.height = image.height
        }
      }

      if (
        this.target === this.gl.TEXTURE_CUBE_MAP &&
        Array.isArray(this.image)
      ) {
        // For cube maps
        for (let i = 0; i < 6; i++) {
          this.gl.texImage2D(
            this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
            this.level,
            this.internalFormat,
            this.format,
            this.type,
            this.image[i]
          )
        }
      } else if (ArrayBuffer.isView(this.data)) {
        // Data texture
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.width,
          this.height,
          0,
          this.format,
          this.type,
          this.data
        )
      } else if (this.image && !Array.isArray(this.image)) {
        // Regular texture
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.width,
          this.height,
          0,
          this.format,
          this.type,
          this.image
        )
      }

      if (this.generateMipmaps) this.gl.generateMipmap(this.target)
    } else {
      if (this.target === this.gl.TEXTURE_CUBE_MAP) {
        // Upload empty pixel for each side while no image to avoid errors while image or video loading
        for (let i = 0; i < 6; i++) {
          this.gl.texImage2D(
            this.gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
            0,
            this.gl.RGBA,
            1,
            1,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            emptyPixel
          )
        }
      } else if (this.width) {
        // image intentionally left null for RenderTarget
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.width,
          this.height,
          0,
          this.format,
          this.type,
          null
        )
      } else {
        // Upload empty pixel if no image to avoid errors while image or video loading
        this.gl.texImage2D(
          this.target,
          0,
          this.gl.RGBA,
          1,
          1,
          0,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          emptyPixel
        )
      }
    }
    this.store.image = this.image
  }

  /**
   * Delete the WebGL texture and clear it from the renderer's texture-unit
   * cache. The texture can't be used after this.
   */
  remove() {
    const { textureUnits } = this.gl.renderer.state
    for (let i = 0; i < textureUnits.length; i++) {
      if (textureUnits[i] === this.id) textureUnits[i] = -1
    }
    this.gl.deleteTexture(this.texture)
    this.gl.renderer.untrack(this)
  }
}

/**
 * The parameters of a newly created WebGL texture.
 */
function defaultTextureState(gl: WTCGLRenderingContext): WTCGLTextureState {
  return {
    minFilter: gl.NEAREST_MIPMAP_LINEAR,
    magFilter: gl.LINEAR,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    anisotropy: 0,
    compareFunc: null
  }
}
