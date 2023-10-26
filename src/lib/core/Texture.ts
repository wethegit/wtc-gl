import {
  WTCGLRendererState,
  WTCGLTextureState,
  WTCGLRenderingContext
} from '../types'

const emptyPixel = new Uint8Array(4)

function isPowerOf2(value: number) {
  return (value & (value - 1)) === 0
}

let ID = 1

export interface TextureOptions {
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  data: Float32Array | null
  target: GLenum
  type: GLenum
  format: GLenum
  internalFormat: GLenum
  wrapS: GLenum
  wrapT: GLenum
  generateMipmaps: boolean
  minFilter: GLenum
  magFilter: GLenum
  premultiplyAlpha: boolean
  unpackAlignment: 1 | 2 | 4 | 8
  flipY: boolean
  anisotropy: number
  level: number
  width: number
  height: number
}

/**
 * A texture class contains image data for use in a shader. Along with the image data, the texture contains state variable that determine how secondary conditions, like wrapping and interpolation work.
 */
class Texture {
  /**
   * A unique ID for the texture object, allows us to determine whether a texture has already been bound or not.
   */
  id: number

  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext

  /**
   * The image element representing the texture. Can be an HTML image, video, or canvas
   */
  image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  data: Float32Array | null

  /**
   * The WebGL texture object containing the data and state for WebGL
   */
  texture: WebGLTexture

  /**
   * The width of the texture.
   */
  width: number
  /**
   * The height of the texture.
   */
  height: number

  /**
   * The binding point for the texture.
   * @default gl.TEXTURE_2D
   */
  target: GLenum
  /**
   * The texture type. Typically one of gl.UNSIGNED_BYTE, gl.FLOAT, ext.HALF_FLOAT_OES
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
   * Whether to generate mip maps for this texture. This requires that the texture be power of 2 in size
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
   * A GLint specifying the level of detail. Level 0 is the base image level and level n is the nth mipmap reduction level. Only relevant if we have mipmaps.
   * @default 0
   */
  level: number

  /**
   * The image store
   */
  store: {
    image?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
  }
  /**
   * A local reference to the renderer state
   */
  glState: WTCGLRendererState
  /**
   * Texture state, contains the basic texture properties.
   */
  state: WTCGLTextureState

  /**
   * Whether the texture needs an update in memory
   */
  needsUpdate: boolean

  /**
   * Create a render target object.
   * @param {WTCGLRenderingContext} gl - The WTCGL Rendering context
   * @param __namedParameters - The parameters to initialise the renderer.
   * @param target - The binding point for the frame buffers.
   * @param type - The texture type. Typically one of gl.UNSIGNED_BYTE, gl.FLOAT, ext.HALF_FLOAT_OES
   * @param format - The texture format.
   * @param internalFormat - the texture internalFormat.
   * @param wrapS - Wrapping
   * @param wrapT - Wrapping
   * @param generateMipmaps - Whether to generate mips for this texture
   * @param minFilter - The filter to use when rendering smaller
   * @param magFilter - The filter to use when enlarging
   * @param premultiplyAlpha - Whether to use premultiplied alpha for stored textures.
   * @param flipY - Whether to flip the Y component of the supplied image
   * @param anistropy - The anistropic filtering level for the texture.
   * @param unpackAlignment - The unpack alignment for pixel stores.
   * @param level - A GLint specifying the level of detail. Level 0 is the base image level and level n is the nth mipmap reduction level. Only relevant if we have mipmaps.
   * @param width - The width of the render target.
   * @param height - The height of the render target.
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
    this.level = level

    if (width) this.width = width

    if (height) this.height = height

    this.texture = this.gl.createTexture()!

    this.store = {
      image: null
    }

    // State store to avoid redundant calls for per-texture state
    this.state = {
      minFilter: this.gl.NEAREST_MIPMAP_LINEAR,
      magFilter: this.gl.LINEAR,
      wrapS: this.gl.REPEAT,
      wrapT: this.gl.REPEAT,
      anisotropy: 0
    }
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
   * @param textureUnit The texture unit to update against.
   * @returns
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
      this.gl.texParameterf(
        this.target,
        this.gl.renderer.getExtension('EXT_texture_filter_anisotropic')
          .TEXTURE_MAX_ANISOTROPY_EXT,
        this.anisotropy
      )
      this.state.anisotropy = this.anisotropy
    }

    if (this.image || this.data) {
      if (this.image && 'width' in this.image) {
        this.width = this.image.width
        this.height = this.image.height
      }

      if (this.target === this.gl.TEXTURE_CUBE_MAP) {
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
      } else {
        // Regular texture
        this.gl.texImage2D(
          this.target,
          this.level,
          this.internalFormat,
          this.format,
          this.type,
          this.image
        )
      }

      if (this.generateMipmaps) {
        // For WebGL1, if not a power of 2, turn off mips, set wrapping to clamp to edge and minFilter to linear
        if (
          !this.gl.renderer.isWebgl2 &&
          this.image &&
          (!isPowerOf2(this.image.width) || !isPowerOf2(this.image.height))
        ) {
          this.generateMipmaps = false
          this.wrapS = this.wrapT = this.gl.CLAMP_TO_EDGE
          this.minFilter = this.gl.LINEAR
        } else {
          this.gl.generateMipmap(this.target)
        }
      }
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
}

export { Texture }
