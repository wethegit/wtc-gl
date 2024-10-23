import { Vec3 } from 'wtc-math'

import { Renderer } from './core/Renderer'
import { Texture } from './core/Texture'
import { Uniform } from './core/Uniform'

export interface WTCGLUniformArray {
  [index: string]: Uniform
}

/**
 * Represents a collection of all of the properties that make up a complete blending function.
 * @interface
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
 * Represents an extention of the standard Web GL active info for uniforms and attributes.
 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLActiveInfo) for more information on WebGLActiveInfo.
 * @interface
 * @extends WebGLActiveInfo
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
 */
export type WTCGLUniformValue =
  | Texture
  | Texture[]
  | number[]
  | string
  | number
  | boolean
  | Float32Array
/**
 * Represents a map of uniforms returned from a program.
 */
export type WTCGLUniformMap = Map<WTCGLActiveInfo, WebGLUniformLocation>
/**
 * Represents a map of uniform locations to values. Used for caching uniforms in renderer state.
 */
export type WTCGLRendererUniformMap = Map<
  WebGLUniformLocation,
  WTCGLUniformValue
>
/**
 * Represents an map of attributes to attribute locations.
 */
export type WTCGLAttributeMap = Map<WTCGLActiveInfo, GLint>

/**
 * Represents the cached state of the renderer. All of these properties can be considered "in use".
 * @interface
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
   * Either gl.CCW or gl.CW
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
    x: number | null
    y: number | null
    width: number | null
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
   * The anisotropic filtering level for the texture.
   */
  anisotropy: number
}

/**
 * An object defining the boundary of the geometry.
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
 */
export type WTCGLGeometryAttributeCollection = {
  [key: string]: WTCGLGeometryAttribute
}
/**
 * Represents a geometry attribute.
 * @interface
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
  buffer: WebGLBuffer

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
   * Update an attribute for rendering
   *@param {WTCGLRenderingContext} gl - The WTCGL rendering context.
   */
  updateAttribute(gl: WTCGLRenderingContext): void
}

/**
 * A simple extension of [WebGLRenderingContext](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext) that supplies a couple of convenient variables.
 * @interface
 */
export type WTCGLRenderingContext = Omit<
  WebGL2RenderingContext,
  'createVertexArray' | 'bindVertexArray'
> & {
  /**
   * The WTCGL Renderer object
   */
  renderer: Renderer
  /**
   * The HTML canvas element. Supplied here because the in-built interface doesn't contain it.
   */
  canvas: HTMLCanvasElement

  HALF_FLOAT: number
  RGBA16F: number
  RGBA32F: number
  TRANSFORM_FEEDBACK: GLenum
  TRANSFORM_FEEDBACK_BUFFER: GLenum
  SEPARATE_ATTRIBS: GLenum

  createVertexArray(): WebGLVertexArrayObject
  bindVertexArray(vertexArray?: WebGLVertexArrayObject | null): void
}

/**
 * A list of enabled extensions.
 * @interface
 */
export interface WTCGLExtensions {
  EXT_color_buffer_float?: string
  OES_texture_float_linear?: string
  OES_texture_float?: string
  OES_texture_half_float?: string
  OES_texture_half_float_linear?: string
  OES_element_index_uint?: string
  OES_standard_derivatives?: string
  EXT_sRGB?: string
  WEBGL_depth_texture?: string
  WEBGL_draw_buffers?: string
}

/**
 * A list of hardware limit values.
 */
export interface WTCGLRendererParams {
  maxTextureUnits: number
  maxAnisotropy: number
}
