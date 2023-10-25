import { WTCGLRenderingContext, WTCGLGeometryAttribute } from '../types'

/**
 * Class representing a geometry attribute. A discrete piece of data used to render some geometry.
 **/
class GeometryAttribute implements WTCGLGeometryAttribute {
  /**
   * The size of each element in the attribute. For example if you're describing 3D vectors, this would be 3.
   * */
  size: number = 1
  /**
   * How big a stride should this attribute have. Should be 0 for all attributes that are uncombined.
   */
  stride: number = 0
  /**
   * How many bytes to offset when passing in the buffer
   */
  offset: number = 0
  /**
   * the number of elements in the attribute
   */
  count: number
  /**
   * The divisor, used in instanced attributes
   */
  divisor: number = 0
  /**
   * The number of instances for this attribute
   */
  instanced: number

  /**
   * A typed array of data for the attribute
   */
  data: Float32Array | Float64Array | Uint16Array | Uint32Array
  /**
   * The WebGL buffer containing the static attribute data
   */
  buffer: WebGLBuffer

  /**
   * default gl.UNSIGNED_SHORT for 'index', gl.FLOAT for others
   */
  type: GLenum
  /**
   * gl.ELEMENT_ARRAY_BUFFER or gl.ARRAY_BUFFER depending on whether this is an index attribute or not
   */
  target: GLenum

  /**
   * whether integer data values should be normalized into a certain range when being cast to a float.
   */
  normalized: boolean

  /**
   * whether this attribute needs an update. Set after the attribute changes to have it recast to memory
   */
  needsUpdate: boolean = false

  /**
   * Create a geometry attribute
   * @param {Object} __namedParameters - The parameters for the attribute
   * @param {number} size - The size of the attribute elements, this will determine the type of attribute in the shader.
   * @param {number} stride - How many bytes to stride by in instances of combined attributes
   * @param {number} offset - How many bytes to offset the attribute.
   * @param {number} instanced - The number of instances this attribute has
   * @param {GLenum} type - FLOAT, UNSIGNED_SHORT, or UNSIGNED_INT
   * @param {boolean} normalized - whether integer data values should be normalized into a certain range when being cast to a float.
   */
  constructor({
    size = 1,
    stride = 0,
    offset = 0,
    instanced = 0,
    count = null,
    type,
    normalized = false,
    data
  }: {
    size?: number
    stride?: number
    offset?: number
    count?: number
    instanced?: number
    type?: GLenum
    normalized?: boolean
    data?: Float32Array | Float64Array | Uint16Array | Uint32Array
  } = {}) {
    this.size = size
    this.stride = stride
    this.offset = offset
    this.instanced = instanced
    this.data = data
    this.type =
      type ||
      (this.data.constructor === Float32Array
        ? window.WebGLRenderingContext.FLOAT
        : this.data.constructor === Uint16Array
        ? window.WebGLRenderingContext.UNSIGNED_SHORT
        : window.WebGLRenderingContext.UNSIGNED_INT)
    this.normalized = normalized

    this.count = count || stride ? data.byteLength / stride : data.length / size
    this.divisor = instanced || 0
  }
  /**
   * Udpate an attribute for rendering
   * @param {WTCGLRenderingContext} gl - The WTCGL rendering context.
   */
  updateAttribute(gl: WTCGLRenderingContext): void {
    if (gl.renderer.state.boundBuffer !== this.buffer) {
      gl.bindBuffer(this.target, this.buffer)
      gl.renderer.state.boundBuffer = this.buffer
    }
    gl.bufferData(this.target, this.data, gl.STATIC_DRAW)
    this.needsUpdate = false
  }
}

export { GeometryAttribute }
