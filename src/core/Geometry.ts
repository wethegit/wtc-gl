import {
  WTCGLRendererState,
  WTCGLRenderingContext,
  WTCGLGeometryAttributeCollection,
  WTCGLGeometryAttribute,
  WTCGLBounds
} from './types'
import { Vec3 } from 'wtc-math'
import { Program } from './Program'

const tempVec3 = new Vec3()

let ID = 1

// To stop inifinite warnings
let isBoundsWarned = false

const originArrayToVec3 = function (
  a: number[] | Float32Array | Float64Array | Uint16Array | Uint32Array,
  o: number = 0
): Vec3 {
  return new Vec3(a[o], a[o + 1], a[o + 2])
}

/**
 * Class representing some Geometry.
 **/
export class Geometry {
  /**
   * The unique ID of the Geometry.
   */
  id: number
  /**
   * The WTCGL rendering context.
   */
  gl: WTCGLRenderingContext

  /**
   * The WTCGL attribute collection that describes this geometry.
   */
  attributes: WTCGLGeometryAttributeCollection

  /**
   * An array of vertex array objects that represent the different attributes.
   */
  VAOs: { [key: string]: WebGLVertexArrayObject }
  /**
   * The range of supplied elements to draw.
   */
  drawRange: { start: number; count: number }
  /**
   * The number of instances to draw.
   */
  instancedCount: number

  /**
   * A boolean indicating whether the geometry is an instanced geometry or not.
   */
  isInstanced: boolean
  /**
   * An object defining the boundary of the geometry
   */
  bounds: WTCGLBounds

  /**
   * An object defining all of the rendering state properties.
   */
  glState: WTCGLRendererState

  /**
   * Create a geometry object.
   * @param {WTCGLRenderingContext} gl - The WTCGL Rendering context
   * @param {WTCGLGeometryAttributeCollection} attributes - A collection of attributes for the geometry. Typically includes vertex positions in 2 or 3d, normals etc.
   */
  constructor(
    gl: WTCGLRenderingContext,
    attributes: WTCGLGeometryAttributeCollection = {}
  ) {
    if (!gl.canvas) console.error('gl not passed as first argument to Geometry')
    this.gl = gl
    this.attributes = attributes
    this.id = ID++

    // Store one VAO per program attribute locations order
    this.VAOs = {}

    this.drawRange = { start: 0, count: 0 }
    this.instancedCount = 0

    // Unbind current VAO so that new buffers don't get added to active mesh
    this.gl.renderer.bindVertexArray(null)
    this.gl.renderer.currentGeometry = null

    // Alias for state store to avoid redundant calls for global state
    this.glState = this.gl.renderer.state

    // create the buffers
    for (let key in attributes) {
      this.addAttribute(key, attributes[key])
    }
  }

  /**
   * Add an attribute
   * @param {string} key - The key for the attribute
   * @param {WTCGLGeometryAttribute} attr - The Geometry attribute, basically the data to be injected
   */
  addAttribute(key: string, attr: WTCGLGeometryAttribute): void {
    this.attributes[key] = attr

    // Set options
    attr.size = attr.size || 1
    attr.type =
      attr.type ||
      (attr.data.constructor === Float32Array
        ? this.gl.FLOAT
        : attr.data.constructor === Uint16Array
        ? this.gl.UNSIGNED_SHORT
        : this.gl.UNSIGNED_INT) // Uint32Array
    attr.target =
      key === 'index' ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER
    attr.normalized = attr.normalized || false
    attr.stride = attr.stride || 0
    attr.offset = attr.offset || 0
    attr.count =
      attr.count ||
      (attr.stride
        ? attr.data.byteLength / attr.stride
        : attr.data.length / attr.size)
    attr.divisor = attr.instanced || 0
    attr.needsUpdate = false

    if (!attr.buffer) {
      attr.buffer = this.gl.createBuffer()

      // Push data to buffer
      this.updateAttribute(attr)
    }

    // Update geometry counts. If indexed, ignore regular attributes
    if (attr.divisor) {
      this.isInstanced = true
      if (
        this.instancedCount &&
        this.instancedCount !== attr.count * attr.divisor
      ) {
        console.warn(
          'geometry has multiple instanced buffers of different length'
        )
        this.instancedCount = Math.min(
          this.instancedCount,
          attr.count * attr.divisor
        )
        return
      }
      this.instancedCount = attr.count * attr.divisor
    } else if (key === 'index') {
      this.drawRange.count = attr.count
    } else if (!this.attributes.index) {
      this.drawRange.count = Math.max(this.drawRange.count, attr.count)
    }
  }

  /**
   * Udpate an attribute for rendering
   * @param {WTCGLGeometryAttribute} attr - The attribute to be updated in mem
   */
  updateAttribute(attr: WTCGLGeometryAttribute): void {
    if (this.glState.boundBuffer !== attr.buffer) {
      this.gl.bindBuffer(attr.target, attr.buffer)
      this.glState.boundBuffer = attr.buffer
    }
    this.gl.bufferData(attr.target, attr.data, this.gl.STATIC_DRAW)
    attr.needsUpdate = false
  }

  /**
   * Sets up the draw range, used to determined which properties are drawn
   * @param {number} start - The start of the range
   * @param {number} count - The number of properties to draw
   */
  setDrawRange(start: number, count: number): void {
    this.drawRange.start = start
    this.drawRange.count = count
  }

  /**
   * Sets up the number of instances to draw
   * @param {number} value - The number of geometry instances to draw
   */
  setInstancedCount(value: number): void {
    this.instancedCount = value
  }

  /**
   * Create a new vertex array object bind Attributes to it
   * @param {Program} program - The program to use to determine attribute locations
   */
  createVAO(program: Program): void {
    // The reason for keying it using the program's attributeOrder is in order to make sure that we're using the appropriate vertex array if we're sharing this geometry between multiple programs
    this.VAOs[program.attributeOrder] = this.gl.renderer.createVertexArray()
    this.gl.renderer.bindVertexArray(this.VAOs[program.attributeOrder])
    this.bindAttributes(program)
  }

  /**
   * Binds all attributes as derived from the program to attribute objects supplied to the geometry
   * @param {Program} program - The program to use to determine attribute locations
   */
  bindAttributes(program: Program): void {
    // Link all attributes to program using gl.vertexAttribPointer
    program.attributeLocations.forEach((location, { name, type }) => {
      // If geometry missing a required shader attribute
      if (!this.attributes[name]) {
        console.warn(`active attribute ${name} not being supplied`)
        return
      }

      const attr = this.attributes[name]

      this.gl.bindBuffer(attr.target, attr.buffer)
      this.glState.boundBuffer = attr.buffer

      // For matrix attributes, buffer needs to be defined per column
      let numLoc = 1
      if (type === 35674) numLoc = 2 // mat2
      if (type === 35675) numLoc = 3 // mat3
      if (type === 35676) numLoc = 4 // mat4

      const size = attr.size / numLoc
      const stride = numLoc === 1 ? 0 : numLoc * numLoc * numLoc
      const offset = numLoc === 1 ? 0 : numLoc * numLoc

      for (let i = 0; i < numLoc; i++) {
        this.gl.vertexAttribPointer(
          location + i,
          size,
          attr.type,
          attr.normalized,
          attr.stride + stride,
          attr.offset + i * offset
        )
        this.gl.enableVertexAttribArray(location + i)

        // For instanced attributes, divisor needs to be set.
        // For firefox, need to set back to 0 if non-instanced drawn after instanced. Else won't render
        this.gl.renderer.vertexAttribDivisor(location + i, attr.divisor)
      }
    })

    // Bind indices if geometry indexed
    if (this.attributes.index)
      this.gl.bindBuffer(
        this.gl.ELEMENT_ARRAY_BUFFER,
        this.attributes.index.buffer
      )
  }

  /**
   * Draw the geometry
   * @param {Object} __namedParameters - The parameters to be used for the draw command
   * @param {Program} program - The Program object to draw to
   * @param {GLenum} mode - The mode to draw the object in
   */
  draw({
    program,
    mode = this.gl.TRIANGLES
  }: {
    program?: Program
    mode: GLenum
  }): void {
    if (
      this.gl.renderer.currentGeometry !==
      `${this.id}_${program.attributeOrder}`
    ) {
      if (!this.VAOs[program.attributeOrder]) this.createVAO(program)
      this.gl.renderer.bindVertexArray(this.VAOs[program.attributeOrder])
      this.gl.renderer.currentGeometry = `${this.id}_${program.attributeOrder}`
    }

    // Check if any attributes need updating
    program.attributeLocations.forEach((location, { name }) => {
      const attr = this.attributes[name]
      if (attr.needsUpdate) this.updateAttribute(attr)
    })

    if (this.isInstanced) {
      if (this.attributes.index) {
        this.gl.renderer.drawElementsInstanced(
          mode,
          this.drawRange.count,
          this.attributes.index.type,
          this.attributes.index.offset + this.drawRange.start * 2,
          this.instancedCount
        )
      } else {
        this.gl.renderer.drawArraysInstanced(
          mode,
          this.drawRange.start,
          this.drawRange.count,
          this.instancedCount
        )
      }
    } else {
      if (this.attributes.index) {
        this.gl.drawElements(
          mode,
          this.drawRange.count,
          this.attributes.index.type,
          this.attributes.index.offset + this.drawRange.start * 2
        )
      } else {
        this.gl.drawArrays(mode, this.drawRange.start, this.drawRange.count)
      }
    }
  }

  /**
   * Returns the position atribute array
   * @returns {WTCGLGeometryAttribute}
   */
  getPosition(): WTCGLGeometryAttribute {
    const attr = this.attributes.position
    if (attr.data) return attr
    if (isBoundsWarned) return
    isBoundsWarned = true
    console.warn('No position buffer data found to compute bounds')
    return
  }

  /**
   * Computes the bounding box of the geometry. If no attribute is provided to compue with, try to use the position attribute array by default.
   * @param {WTCGLGeometryAttribute} attr - The attribute array to compute the bounding box off
   */
  computeBoundingBox(attr: WTCGLGeometryAttribute | null): void {
    if (!attr) attr = this.getPosition()
    const array = attr.data
    const offset = attr.offset || 0
    const stride = attr.stride || attr.size

    if (!this.bounds) {
      this.bounds = {
        min: new Vec3(),
        max: new Vec3(),
        center: new Vec3(),
        scale: new Vec3(),
        radius: Infinity
      }
    }

    const min = this.bounds.min
    const max = this.bounds.max
    const center = this.bounds.center
    const scale = this.bounds.scale

    min.reset(Infinity, Infinity, Infinity)
    max.reset(-Infinity, -Infinity, -Infinity)

    // TODO: check size of position (eg triangle with Vec2)
    for (let i = offset, l = array.length; i < l; i += stride) {
      const x = array[i]
      const y = array[i + 1]
      const z = array[i + 2]

      min.x = Math.min(x, min.x)
      min.y = Math.min(y, min.y)
      min.z = Math.min(z, min.z)

      max.x = Math.max(x, max.x)
      max.y = Math.max(y, max.y)
      max.z = Math.max(z, max.z)
    }

    scale.resetToVector(max.subtractNew(min))
    center.resetToVector(min.addNew(max).scale(0.5))
  }

  /**
   * Computes the bounding sphere of the geometry. If no attribute is provided to compue with, try to use the position attribute array by default.
   * @param {WTCGLGeometryAttribute} attr - The attribute array to compute the bounding box off
   */
  computeBoundingSphere(attr?: WTCGLGeometryAttribute | null): void {
    if (!attr) attr = this.getPosition()
    const array = attr.data
    const offset = attr.offset || 0
    const stride = attr.stride || attr.size

    if (!this.bounds) this.computeBoundingBox(attr)

    let maxRadiusSq = 0
    for (let i = offset, l = array.length; i < l; i += stride) {
      originArrayToVec3(array, i)
      maxRadiusSq = Math.max(
        maxRadiusSq,
        this.bounds.center.subtractNew(tempVec3).lengthSquared
      )
    }

    this.bounds.radius = Math.sqrt(maxRadiusSq)
  }

  /**
   * Remoce all of the vertex array objects and buffers from memory
   */
  remove(): void {
    for (let key in this.VAOs) {
      this.gl.renderer.deleteVertexArray(this.VAOs[key])
      delete this.VAOs[key]
    }
    for (let key in this.attributes) {
      this.gl.deleteBuffer(this.attributes[key].buffer)
      delete this.attributes[key]
    }
  }
}
