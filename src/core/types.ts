import { Renderer } from './Renderer'
import { Texture } from './Texture'
import { Vec3 } from 'wtc-math'

/**
 * Represents a collection of all of the properties that make up a complete blending function.
 * @interface
 */
export interface WTCGLBlendFunction {
  /**
   * The source blend function
   */
  src?: GLenum
  /**
   * The destination blend function
   */
  dst?: GLenum
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
  modeRGB?: GLenum
  /**
   * The mode to blend when using RGBA
   */
  modeAlpha?: GLenum
}

/**
 * Representes an extention of the standard Web GL active info for uniforms and attributes.
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
  framebuffer: any // TO DO Update with better type
  viewport: {
    x: number | null
    y: number | null
    width: number | null
    height: number | null
  }
  textureUnits: any // TO DO Update with better type
  activeTextureUnit: number
  boundBuffer: any // TO DO Update with better type
  uniformLocations: WTCGLRendererUniformMap
}

export interface WTCGLTextureState {
  minFilter: GLenum
  magFilter: GLenum
  wrapS: GLenum
  wrapT: GLenum
  anisotropy: number
}

export type WTCGLBounds = {
  min: Vec3
  max: Vec3
  center: Vec3
  scale: Vec3
  radius: number
}

export type WTCGLGeometryAttributeCollection = {
  [key: string]: WTCGLGeometryAttribute
}
export interface WTCGLGeometryAttribute {
  size: number
  stride: number
  offset: number
  count: number
  divisor: number
  instanced: number

  data: Float32Array | Float64Array | Uint16Array | Uint32Array
  buffer: WebGLBuffer

  type: GLenum
  target: GLenum

  normalized: boolean

  needsUpdate: boolean

  updateAttribute(gl: WTCGLRenderingContext): void
}

export interface WTCGLRenderingContext extends WebGLRenderingContext {
  renderer?: Renderer
  canvas: HTMLCanvasElement
}

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

export interface WTCGLRendererParams {
  maxTextureUnits: number
  maxAnisotropy: number
}
