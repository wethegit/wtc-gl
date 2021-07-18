import { Renderer } from './Renderer'
import { Texture } from './Texture'
import { Vec3 } from 'wtc-math'

export interface WTCGLBlendFunction {
  src?: GLenum
  dst?: GLenum
  srcAlpha?: GLenum
  dstAlpha?: GLenum
}

export interface WTCGLBlendEquation {
  modeRGB?: GLenum
  modeAlpha?: GLenum
}

export interface WTCGLActiveInfo extends WebGLActiveInfo {
  uniformName?: string
  isStructArray?: boolean
  isStruct?: boolean
  structIndex?: number
  structProperty?: string
}

export type WTCGLUniformValue =
  | Texture
  | Texture[]
  | number[]
  | string
  | number
  | boolean
  | Float32Array
export type WTCGLUniformMap = Map<WTCGLActiveInfo, WebGLUniformLocation>
export type WTCGLRendererUniformMap = Map<
  WebGLUniformLocation,
  WTCGLUniformValue
>
export type WTCGLAttributeMap = Map<WTCGLActiveInfo, GLint>

export interface WTCGLRendererState {
  blendFunc: WTCGLBlendFunction
  blendEquation: WTCGLBlendEquation
  cullFace: GLenum | null
  frontFace: GLenum | null
  depthMask: boolean
  depthFunc: GLenum | null
  premultiplyAlpha: boolean
  flipY: boolean
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
