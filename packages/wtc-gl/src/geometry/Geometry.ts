import { Vec3 } from 'wtc-math'

import type {
  WTCGLRenderingContext,
  WTCGLGeometryAttributeCollection,
  WTCGLGeometryAttribute,
  WTCGLBounds
} from '../types'
import { Program } from '../core/Program'
import { GeometryAttribute } from './GeometryAttribute'

let ID = 1

// To stop inifinite warnings
let isBoundsWarned = false
let isNormalsWarned = false

// Components past `size` are 0, so 2D positions don't read into the next vertex
const originArrayToVec3 = function (
  a: number[] | Float32Array | Float64Array | Uint16Array | Uint32Array,
  o: number = 0,
  size: number = 3
): Vec3 {
  return new Vec3(a[o], size > 1 ? a[o + 1] : 0, size > 2 ? a[o + 2] : 0)
}

// The context generation each attribute's buffer was last rebuilt for
const restoredAttributes = new WeakMap<WTCGLGeometryAttribute, number>()

// Where a vertex array points one attribute, so it can be re-pointed when the
// attribute's buffer is swapped
interface AttributeBinding {
  attr: WTCGLGeometryAttribute
  location: number
  type: GLenum
  buffer: WebGLBuffer | null
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

  // The context generation this geometry's buffers were created for
  #contextVersion: number
  // The renderer's currentGeometry key for each attribute order, built once
  // rather than on every draw
  #geometryKeys: { [attributeOrder: string]: string } = {}
  // The attribute bindings recorded in each vertex array, by attribute order
  #bindings: { [attributeOrder: string]: AttributeBinding[] } = {}
  // The index buffer recorded in each vertex array, by attribute order
  #indexBuffers: { [attributeOrder: string]: WebGLBuffer | null } = {}

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
  isInstanced = false
  /**
   * An object defining the boundary of the geometry
   */
  bounds?: WTCGLBounds

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

    this.VAOs = {}

    // Unbind existing VAOs
    this.gl.renderer.bindVertexArray(null)

    // Initialise the draw range and instance count with default values
    this.drawRange = { start: 0, count: 0 }
    this.instancedCount = 0

    // Initialise the attribute buffers
    for (const key in attributes) {
      this.addAttribute(key, attributes[key])
    }

    this.#contextVersion = gl.renderer.contextVersion
    gl.renderer.track(this)
  }

  /**
   * Recreate the buffers and vertex arrays after the WebGL context has been
   * restored. Called by the renderer.
   */
  restoreContext(): void {
    const version = this.gl.renderer.contextVersion
    if (this.#contextVersion === version) return
    this.#contextVersion = version

    // The old VAOs belonged to the lost context; they're recreated on draw
    this.VAOs = {}
    this.#bindings = {}
    this.#indexBuffers = {}

    for (const key in this.attributes) {
      const attr = this.attributes[key]
      // Whatever owns an external buffer restores it
      if (attr.external) continue
      // Attributes can be shared between geometries; only rebuild once
      if (restoredAttributes.get(attr) === version) continue
      restoredAttributes.set(attr, version)

      attr.buffer = this.gl.createBuffer()
      attr.updateAttribute(this.gl)
    }
  }

  /**
   * Add an attribute
   * @param {string} key - The key for the attribute
   * @param {WTCGLGeometryAttribute} attr - The Geometry attribute, basically the data to be injected
   */
  addAttribute(key: string, attr: WTCGLGeometryAttribute): void {
    // Vertex arrays record the attribute objects they were built with, so a
    // new or replaced attribute needs them rebuilt. The index is re-bound on
    // draw.
    if (key !== 'index' && this.attributes[key] !== attr) this.#dropVAOs()

    this.attributes[key] = attr

    // Attribute options
    attr.target =
      key === 'index' ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER
    attr.count =
      attr.count ||
      (attr.stride
        ? attr.data.byteLength / attr.stride
        : attr.data.length / attr.size)
    attr.needsUpdate = false

    if (!attr.buffer && !attr.external) {
      attr.buffer = this.gl.createBuffer()

      // Push data to the buffer
      attr.updateAttribute(this.gl)
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
   * Replace the index after construction. The old index buffer isn't
   * deleted, because attributes can be shared between geometries; delete it
   * yourself if nothing else uses it. To change indices in place at the same
   * length, edit `attributes.index.data` and set `needsUpdate` instead.
   * @param {WTCGLGeometryAttribute | Uint16Array | Uint32Array} index - The new index attribute, or the index data to wrap in one
   */
  setIndex(index: WTCGLGeometryAttribute | Uint16Array | Uint32Array): void {
    const attr = ArrayBuffer.isView(index)
      ? new GeometryAttribute({ data: index })
      : index

    // Uploading binds ELEMENT_ARRAY_BUFFER, which would overwrite the index
    // recorded in whatever vertex array is bound, possibly another geometry's
    this.gl.renderer.bindVertexArray(null)
    this.addAttribute('index', attr)
    // A start offset into the old index means nothing in the new one
    this.drawRange.start = 0
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
    this.VAOs[program.attributeOrder] = this.gl.createVertexArray()!
    this.gl.renderer.bindVertexArray(this.VAOs[program.attributeOrder])
    this.bindAttributes(program)
  }

  /**
   * Binds all attributes as derived from the program to attribute objects supplied to the geometry
   * @param {Program} program - The program to use to determine attribute locations
   */
  bindAttributes(program: Program): void {
    const bindings: AttributeBinding[] = []

    // Link all attributes to program using gl.vertexAttribPointer
    program.attributeLocations.forEach((location, { name, type }) => {
      // If geometry missing a required shader attribute
      if (!this.attributes[name]) {
        console.warn(`active attribute ${name} not being supplied`)
        return
      }

      const attr = this.attributes[name]
      this.#pointAttribute(attr, location, type)
      bindings.push({ attr, location, type, buffer: attr.buffer })
    })

    this.#bindings[program.attributeOrder] = bindings

    // Bind indices if geometry indexed
    if (this.attributes.index) {
      const { buffer } = this.attributes.index
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffer)
      this.#indexBuffers[program.attributeOrder] = buffer
    }
  }

  /**
   * Point the bound vertex array's attribute at `attr`'s buffer.
   */
  #pointAttribute(
    attr: WTCGLGeometryAttribute,
    location: number,
    type: GLenum
  ): void {
    this.gl.bindBuffer(attr.target, attr.buffer)
    this.gl.renderer.state.boundBuffer = attr.buffer

    // For matrix attributes, buffer needs to be defined per column
    let numLoc = 1
    if (type === 35674) numLoc = 2 // mat2
    if (type === 35675) numLoc = 3 // mat3
    if (type === 35676) numLoc = 4 // mat4

    const size = attr.size / numLoc
    const stride = numLoc === 1 ? 0 : numLoc * numLoc * 4
    const offset = numLoc === 1 ? 0 : numLoc * 4

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
      this.gl.vertexAttribDivisor(location + i, attr.divisor)
    }
  }

  /**
   * Draw the geometry
   * @param {Object} __namedParameters - The parameters to be used for the draw command
   * @param {Program} program - The Program object to draw to
   * @param {GLenum} mode - The mode to draw the object in
   */
  #updateAttribute = (_: unknown, { name }: { name: string }) => {
    const attr = this.attributes[name]
    if (attr && attr.needsUpdate) attr.updateAttribute(this.gl)
  }

  draw({
    program,
    mode = this.gl.TRIANGLES
  }: {
    program: Program
    mode: GLenum
  }): void {
    const order = program.attributeOrder
    const key = (this.#geometryKeys[order] ??= `${this.id}_${order}`)
    if (this.gl.renderer.currentGeometry !== key) {
      if (!this.VAOs[order]) this.createVAO(program)
      this.gl.renderer.bindVertexArray(this.VAOs[order], key)
    }

    // Re-point any attribute whose buffer has been swapped since the vertex
    // array was built, such as a TransformFeedback output
    const bindings = this.#bindings[order]
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i]
      if (binding.attr.buffer === binding.buffer) continue
      this.#pointAttribute(binding.attr, binding.location, binding.type)
      binding.buffer = binding.attr.buffer
    }

    // The vertex array records the index buffer too, so re-bind it if it's
    // been swapped
    const index = this.attributes.index
    if (index && index.buffer !== this.#indexBuffers[order]) {
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, index.buffer)
      this.#indexBuffers[order] = index.buffer
    }

    // Check if any attributes need updating. A stored callback, so this
    // doesn't allocate a closure on every draw.
    program?.attributeLocations.forEach(this.#updateAttribute)

    // drawRange.start counts indices; the draw call needs a byte offset
    const indexOffset = index
      ? index.offset + this.drawRange.start * index.data.BYTES_PER_ELEMENT
      : 0

    if (this.isInstanced) {
      if (index) {
        this.gl.drawElementsInstanced(
          mode,
          this.drawRange.count,
          index.type,
          indexOffset,
          this.instancedCount
        )
      } else {
        this.gl.drawArraysInstanced(
          mode,
          this.drawRange.start,
          this.drawRange.count,
          this.instancedCount
        )
      }
    } else {
      if (index) {
        this.gl.drawElements(
          mode,
          this.drawRange.count,
          index.type,
          indexOffset
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
  getPosition(): WTCGLGeometryAttribute | undefined {
    const attr = this.attributes.position
    // An external attribute's data is only its starting values, so it can't
    // be measured
    if (attr?.data && !attr.external) return attr
    if (isBoundsWarned) return
    isBoundsWarned = true
    console.warn(
      'No position data to compute bounds from (external positions must be given bounds explicitly)'
    )
    return
  }

  /**
   * Computes the bounding box of the geometry. If no attribute is provided to compue with, try to use the position attribute array by default.
   * @param {WTCGLGeometryAttribute} attr - The attribute array to compute the bounding box off
   */
  computeBoundingBox(attr?: WTCGLGeometryAttribute): WTCGLBounds | undefined {
    if (!attr) attr = this.getPosition()
    if (!attr) return
    const array = attr.data
    // offset and stride are in bytes, as GL expects; convert to array indices
    const bytes = array.BYTES_PER_ELEMENT
    const offset = (attr.offset || 0) / bytes
    const stride = (attr.stride || 0) / bytes || attr.size

    const bounds = (this.bounds ??= {
      min: new Vec3(),
      max: new Vec3(),
      center: new Vec3(),
      scale: new Vec3(),
      radius: Infinity
    })

    const min = bounds.min
    const max = bounds.max
    const center = bounds.center
    const scale = bounds.scale

    min.reset(Infinity, Infinity, Infinity)
    max.reset(-Infinity, -Infinity, -Infinity)

    // 2D positions (size 2) have z = 0
    const size = attr.size
    for (let i = offset, l = array.length; i < l; i += stride) {
      const x = array[i]
      const y = size > 1 ? array[i + 1] : 0
      const z = size > 2 ? array[i + 2] : 0

      min.x = Math.min(x, min.x)
      min.y = Math.min(y, min.y)
      min.z = Math.min(z, min.z)

      max.x = Math.max(x, max.x)
      max.y = Math.max(y, max.y)
      max.z = Math.max(z, max.z)
    }

    scale.resetToVector(max.subtractNew(min))
    center.resetToVector(min.addNew(max).scale(0.5))

    return bounds
  }

  /**
   * Computes the bounding sphere of the geometry. If no attribute is provided to compue with, try to use the position attribute array by default.
   * @param {WTCGLGeometryAttribute} attr - The attribute array to compute the bounding box off
   */
  computeBoundingSphere(attr?: WTCGLGeometryAttribute | null): void {
    if (!attr) attr = this.getPosition()
    if (!attr) return
    const array = attr.data
    // offset and stride are in bytes, as GL expects; convert to array indices
    const bytes = array.BYTES_PER_ELEMENT
    const offset = (attr.offset || 0) / bytes
    const stride = (attr.stride || 0) / bytes || attr.size

    const bounds = this.bounds ?? this.computeBoundingBox(attr)
    if (!bounds) return

    let maxRadiusSq = 0
    for (let i = offset, l = array.length; i < l; i += stride) {
      const point = originArrayToVec3(array, i, attr.size)
      maxRadiusSq = Math.max(
        maxRadiusSq,
        bounds.center.subtractNew(point).lengthSquared
      )
    }

    bounds.radius = Math.sqrt(maxRadiusSq)
  }

  /**
   * Compute area-weighted vertex normals from the positions, assuming the
   * geometry is drawn as TRIANGLES. Indexed geometry gets smooth normals
   * across shared vertices; non-indexed geometry gets one normal per face.
   * Writes into the existing normal attribute when it can, otherwise adds one.
   */
  computeVertexNormals(): void {
    const position = this.attributes.position
    // An external attribute's data is only its starting values
    if (!position?.data || position.external) {
      if (isNormalsWarned) return
      isNormalsWarned = true
      console.warn(
        "No position data to compute normals from (external positions can't be read back)"
      )
      return
    }

    const array = position.data
    // offset and stride are in bytes, as GL expects; convert to array indices
    const bytes = array.BYTES_PER_ELEMENT
    const offset = (position.offset || 0) / bytes
    const stride = (position.stride || 0) / bytes || position.size
    const size = position.size
    const count = position.count

    const existing = this.attributes.normal
    const reuse =
      existing &&
      !existing.external &&
      existing.size === 3 &&
      !existing.stride &&
      !existing.offset &&
      existing.data instanceof Float32Array &&
      existing.data.length === count * 3
    const normals = reuse
      ? (existing.data as Float32Array).fill(0)
      : new Float32Array(count * 3)

    const index = this.attributes.index
    const indices = index?.data
    const start = index ? (index.offset || 0) / index.data.BYTES_PER_ELEMENT : 0
    const total = index ? index.count : count

    for (let i = 0; i + 2 < total; i += 3) {
      const a = indices ? indices[start + i] : i
      const b = indices ? indices[start + i + 1] : i + 1
      const c = indices ? indices[start + i + 2] : i + 2

      // 2D positions (size 2) have z = 0
      const pa = offset + a * stride
      const pb = offset + b * stride
      const pc = offset + c * stride
      const ax = array[pa]
      const ay = size > 1 ? array[pa + 1] : 0
      const az = size > 2 ? array[pa + 2] : 0
      const abx = array[pb] - ax
      const aby = (size > 1 ? array[pb + 1] : 0) - ay
      const abz = (size > 2 ? array[pb + 2] : 0) - az
      const acx = array[pc] - ax
      const acy = (size > 1 ? array[pc + 1] : 0) - ay
      const acz = (size > 2 ? array[pc + 2] : 0) - az

      // The cross product's length is twice the face's area, so adding it
      // unnormalised weights each face by its area
      const nx = aby * acz - abz * acy
      const ny = abz * acx - abx * acz
      const nz = abx * acy - aby * acx

      normals[a * 3] += nx
      normals[a * 3 + 1] += ny
      normals[a * 3 + 2] += nz
      normals[b * 3] += nx
      normals[b * 3 + 1] += ny
      normals[b * 3 + 2] += nz
      normals[c * 3] += nx
      normals[c * 3 + 1] += ny
      normals[c * 3 + 2] += nz
    }

    // Vertices only on degenerate faces, or on none, stay 0, 0, 0
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2])
      if (!length) continue
      normals[i] /= length
      normals[i + 1] /= length
      normals[i + 2] /= length
    }

    if (reuse) existing.needsUpdate = true
    else
      this.addAttribute(
        'normal',
        new GeometryAttribute({ size: 3, data: normals })
      )
  }

  /**
   * Delete the vertex arrays so they're rebuilt on the next draw.
   */
  #dropVAOs(): void {
    for (const key in this.VAOs) {
      this.gl.deleteVertexArray(this.VAOs[key])
      delete this.VAOs[key]
    }
    this.#bindings = {}
    this.#indexBuffers = {}
    // currentGeometry may still name a deleted vertex array, which would make
    // draw() skip building a new one
    this.gl.renderer.bindVertexArray(null)
  }

  /**
   * Remoce all of the vertex array objects and buffers from memory
   */
  remove(): void {
    this.#dropVAOs()
    for (const key in this.attributes) {
      const attr = this.attributes[key]
      if (!attr.external) this.gl.deleteBuffer(attr.buffer)
      delete this.attributes[key]
    }
    this.gl.renderer.untrack(this)
  }
}
