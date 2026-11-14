import { Vec3 } from 'wtc-math'

import { Renderer } from './core/Renderer'
import { Texture } from './core/Texture'
import { Uniform } from './core/Uniform'

/**
 * A map of uniform names to `Uniform` objects, as passed to a `Program`.
 * @category Types
 */
export interface WTCGLUniformArray {
  [index: string]: Uniform
}

/**
 * Represents a collection of all of the properties that make up a complete blending function.
 * @interface
 * @category Types
 */
export interface WTCGLBlendFunction {
  /**
   * The source blend function
   */
  src: GLenum
  /**
   * The destination blend function
   */
  dst: GLenum
  /**
   * The source blend function for alpha blending
   */
  srcAlpha?: GLenum
  /**
   * The destination blend function for alpha blending
   */
  dstAlpha?: GLenum
}

/**
 * Represents a collection of modes used to make up a blend equation.
 * @interface
 * @category Types
 */
export interface WTCGLBlendEquation {
  /**
   * The mode to blend when using RGB
   */
  modeRGB: GLenum
  /**
   * The mode to blend when using RGBA
   */
  modeAlpha: GLenum
}

/**
 * Representes an extention of the standard Web GL active info for uniforms and attributes.
 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLActiveInfo) for more information on WebGLActiveInfo.
 * @interface
 * @extends WebGLActiveInfo
 * @category Types
 */
export interface WTCGLActiveInfo extends WebGLActiveInfo {
  /**
   * The uniform name, used for associating active info with WTCGLUniform objects
   */
  uniformName?: string
  /**
   * If a uniform location points to a structure array.
   */
  isStructArray?: boolean
  /**
   * If the uniform points to a structure.
   */
  isStruct?: boolean
  /**
   * The index within the structure.
   */
  structIndex?: number
  /**
   * The property within the structure to target.
   */
  structProperty?: string
}

/**
 * Represents a value that can be bound to a uniform.
 * @category Types
 */
export type WTCGLUniformValue =
  Texture | Texture[] | number[] | string | number | boolean | Float32Array
/**
 * A resource that can rebuild its GL objects after the WebGL context is
 * restored. See `Renderer.track`.
 * @category Types
 */
export interface WTCGLRestorable {
  /**
   * Recreate the resource's GL objects on the new context.
   */
  restoreContext(): void
}
/**
 * Represents a map of uniforms returned from a program.
 * @category Types
 */
export type WTCGLUniformMap = Map<WTCGLActiveInfo, WebGLUniformLocation>
/**
 * Represents a map of uniform locations to values. Used for caching uniforms in renderer state.
 * @category Types
 */
export type WTCGLRendererUniformMap = Map<
  WebGLUniformLocation,
  WTCGLUniformValue
>
/**
 * Represents an map of attributes to attribute locations.
 * @category Types
 */
export type WTCGLAttributeMap = Map<WTCGLActiveInfo, GLint>

/**
 * Represents the cached state of the renderer. All of these properties can be considered "in use".
 * @interface
 * @category Types
 */
export interface WTCGLRendererState {
  /**
   * The blend function
   */
  blendFunc: WTCGLBlendFunction
  /**
   * The blend equation
   */
  blendEquation: WTCGLBlendEquation
  /**
   * Which face to cull. gl.CULL_FACE or null
   */
  cullFace: GLenum | null
  /**
   * A GLEnum representing the order to face vertices to use to determine whether what the "front" face of a polygon is.
   * Eother gl.CCW or gl.CW
   */
  frontFace: GLenum | null
  /**
   * Whether to write depth information.
   */
  depthMask: boolean
  /**
   * The function to use when depth testing.
   */
  depthFunc: GLenum | null
  /**
   * Whether to use premultiplied alpha.
   */
  premultiplyAlpha: boolean
  /**
   * Whether to flip the Y component of loaded textures in memory
   */
  flipY: boolean
  /**
   * The unpack alignment for pixel stores.
   */
  unpackAlignment: number
  /**
   * The currently bound framebuffer. Null if writing to screen.
   */
  framebuffer: unknown // TO DO Update with better type
  /**
   * An object representing the current viewport
   */
  viewport: {
    /** The x position, in pixels. */
    x: number | null
    /** The y position, in pixels. */
    y: number | null
    /** The width, in pixels. */
    width: number | null
    /** The height, in pixels. */
    height: number | null
  }
  /**
   * The scissor rect last set with `setScissor`
   */
  scissor: {
    /** The x position, in pixels. */
    x: number | null
    /** The y position, in pixels. */
    y: number | null
    /** The width, in pixels. */
    width: number | null
    /** The height, in pixels. */
    height: number | null
  }
  /**
   * The store of all texture units currently in memory and use.
   */
  textureUnits: number[]
  /**
   * The active texture unit being written to - used when initialising textures
   */
  activeTextureUnit: number
  /**
   * The current attribute buffer being written to.
   */
  boundBuffer: unknown // TO DO Update with better type
  /**
   * The cached uniform location map.
   */
  uniformLocations: WTCGLRendererUniformMap
}

/**
 * Texture state, contains the WebGL texture properties for a given texture.
 * @interface
 * @category Types
 */
export interface WTCGLTextureState {
  /**
   * The filter to use when rendering smaller.
   */
  minFilter: GLenum
  /**
   * The filter to use when enlarging.
   */
  magFilter: GLenum
  /**
   * Wrapping.
   */
  wrapS: GLenum
  /**
   * Wrapping.
   */
  wrapT: GLenum
  /**
   * The anistropic filtering level for the texture.
   */
  anisotropy: number
  /**
   * The depth comparison, or null when comparison is off.
   */
  compareFunc: GLenum | null
}

/**
 * An object defining the boundary of the geometry.
 * @category Types
 */
export type WTCGLBounds = {
  /**
   * A vector representing the minimum positions for each axis.
   */
  min: Vec3
  /**
   * A vector representing the maximum positions for each axis.
   */
  max: Vec3
  /**
   * A vector representing the avg center of the object.
   */
  center: Vec3
  /**
   * A vector representing the the scale of the object as defined by `max - min`.
   */
  scale: Vec3
  /**
   * The radius of the boundary of the object.
   */
  radius: number
}

/**
 * The collection of supplied attributes that define a geometry.
 * @category Types
 */
export type WTCGLGeometryAttributeCollection = {
  [key: string]: WTCGLGeometryAttribute
}
/**
 * Represents a geometry attribute.
 * @interface
 * @category Types
 */
export interface WTCGLGeometryAttribute {
  /**
   * The size of each element in the attribute. For example if you're describing 3D vectors, this would be 3.
   */
  size: number
  /**
   * How big a stride should this attribute have. Should be 0 for all attributes that are uncombined.
   */
  stride: number
  /**
   * How many bytes to offset when passing in the buffer.
   */
  offset: number
  /**
   * the number of elements in the attribute
   */
  count: number
  /**
   * The divisor, used in instanced attributes.
   */
  divisor: number
  /**
   * The number of instances for this attribute. If zero this object is determined to be non-instanced.
   */
  instanced: number

  /**
   * A typed array of data for the attribute.
   */
  data: Float32Array | Float64Array | Uint16Array | Uint32Array
  /**
   * The WebGL buffer containing the static attribute data.
   */
  buffer: WebGLBuffer | null
  /**
   * Whether the buffer is managed by something else, such as a
   * `TransformFeedback`. Geometry never uploads, recreates or deletes an
   * external attribute's buffer, and re-points its vertex arrays when the
   * buffer is swapped.
   */
  external?: boolean

  /**
   * default gl.UNSIGNED_SHORT for 'index', gl.FLOAT for others.
   */
  type: GLenum
  /**
   * gl.ELEMENT_ARRAY_BUFFER or gl.ARRAY_BUFFER depending on whether this is an index attribute or not.
   */
  target: GLenum

  /**
   * Whether integer data values should be normalized into a certain range when being cast to a float.
   */
  normalized: boolean

  /**
   * Whether this attribute needs an update. Set after the attribute changes to have it recast to memory.
   */
  needsUpdate: boolean

  /**
   * Udpate an attribute for rendering
   *@param {WTCGLRenderingContext} gl - The WTCGL rendering context.
   */
  updateAttribute(gl: WTCGLRenderingContext): void
}

/**
 * A [WebGL2RenderingContext](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext) with a reference back to the renderer that owns it.
 * @interface
 * @category Types
 */
export type WTCGLRenderingContext = WebGL2RenderingContext & {
  /**
   * The WTCGL Renderer object
   */
  renderer: Renderer
  // The canvas, narrowed to an HTMLCanvasElement. Its doc comment comes from
  // WebGL2RenderingContext, as TypeDoc only takes one.
  canvas: HTMLCanvasElement
}

/**
 * The WebGL2 extensions `Renderer.getExtension` knows the types of. Any other
 * name can still be requested, but returns `unknown`.
 * @category Types
 */
export interface WTCGLExtensionMap {
  /** Rendering to 16- and 32-bit float colour buffers. Enabled by the renderer on creation. */
  EXT_color_buffer_float: EXT_color_buffer_float
  /** Rendering to 16-bit float colour buffers. */
  EXT_color_buffer_half_float: EXT_color_buffer_half_float
  /** Blending into 32-bit float colour buffers. */
  EXT_float_blend: EXT_float_blend
  /** BPTC compressed texture formats. */
  EXT_texture_compression_bptc: EXT_texture_compression_bptc
  /** RGTC compressed texture formats. */
  EXT_texture_compression_rgtc: EXT_texture_compression_rgtc
  /** Anisotropic texture filtering. */
  EXT_texture_filter_anisotropic: EXT_texture_filter_anisotropic
  /** Non-blocking shader compile and link status queries. */
  KHR_parallel_shader_compile: KHR_parallel_shader_compile
  /** Linear filtering of 32-bit float textures. Enabled by the renderer on creation. */
  OES_texture_float_linear: OES_texture_float_linear
  /** Rendering to several views (such as stereo eyes) in one draw call. */
  OVR_multiview2: OVR_multiview2
  /** ASTC compressed texture formats. */
  WEBGL_compressed_texture_astc: WEBGL_compressed_texture_astc
  /** ETC compressed texture formats. */
  WEBGL_compressed_texture_etc: WEBGL_compressed_texture_etc
  /** S3TC (DXT) compressed texture formats. */
  WEBGL_compressed_texture_s3tc: WEBGL_compressed_texture_s3tc
  /** S3TC (DXT) compressed texture formats in sRGB. */
  WEBGL_compressed_texture_s3tc_srgb: WEBGL_compressed_texture_s3tc_srgb
  /** The unmasked vendor and renderer strings of the GPU. */
  WEBGL_debug_renderer_info: WEBGL_debug_renderer_info
  /** The translated source of a shader, for debugging. */
  WEBGL_debug_shaders: WEBGL_debug_shaders
  /** Simulating context loss and restoration. */
  WEBGL_lose_context: WEBGL_lose_context
  /** Drawing several ranges of a buffer in one call. */
  WEBGL_multi_draw: WEBGL_multi_draw
}

/**
 * A list of hardware limit values.
 * @category Types
 */
export interface WTCGLRendererParams {
  /** The number of texture units available across all shader stages (`MAX_COMBINED_TEXTURE_IMAGE_UNITS`). */
  maxTextureUnits: number
  /** The highest anisotropic filtering level supported, or 0 without `EXT_texture_filter_anisotropic`. */
  maxAnisotropy: number
}
