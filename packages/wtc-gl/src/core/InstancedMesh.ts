import type { Mat4 } from 'wtc-math'

import type { WTCGLBounds, WTCGLRenderingContext } from '../types'
import { Mesh } from './Mesh'
import type { Program } from './Program'
import type { Camera } from './Camera'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'
import { sharedAttribute } from '../geometry/sharedAttribute'

export interface InstancedMeshOptions {
  /** The geometry each instance draws. It isn't changed. */
  geometry: Geometry
  /** A program that reads `instanceMatrix`, such as `LitProgram({ instanced: true })`. */
  program: Program
  /** How many instances there's room for. */
  count: number
  /** @default gl.TRIANGLES */
  mode?: GLenum
  /** Cull each instance against the camera. @default true */
  frustumCulled?: boolean
  /** @default 0 */
  renderOrder?: number
}

type FrustumPlane = Camera['frustum'][string]

/**
 * Many copies of one geometry in a single draw call, each with its own
 * matrix and colour.
 *
 * Set them with `setMatrixAt(i, matrix)` and `setColourAt(i, colour)`; they
 * upload on the next draw. `count` draws only the first instances, up to the
 * `capacity` it was made with. Matrices start as the identity and colours as
 * white.
 *
 * The program reads the per-instance values from two attributes:
 * `in mat4 instanceMatrix` and `in vec3 instanceColour`. `LitProgram` and
 * `NormalProgram` do with `instanced: true`. In a custom vertex shader,
 * transform by `instanceMatrix` before the model-view matrix.
 *
 * The geometry is shared, not changed: the instanced mesh draws from its
 * buffers through a geometry of its own, so the same geometry can also be
 * drawn by an ordinary mesh, and removing this one never deletes them. Call
 * `update()` after the geometry's attributes or index change.
 *
 * With `frustumCulled`, each instance is tested against the camera every
 * draw, from the geometry's bounds, and only the ones in view are drawn and
 * uploaded. Nothing is uploaded when neither the instances nor the visible
 * set changed. `cullCamera` culls against another camera than the one
 * drawing, for example to show one camera's view from another. The mesh as a
 * whole is never culled, and transparent instances aren't sorted among
 * themselves.
 */
export class InstancedMesh extends Mesh {
  /** The geometry each instance draws. */
  readonly source: Geometry
  /** How many instances there's room for. */
  readonly capacity: number
  /** Each instance's matrix, 16 values apiece, in `Mat4` field order. */
  readonly matrices: Float32Array
  /** Each instance's colour, 3 values apiece. */
  readonly colours: Float32Array
  /**
   * The camera instances are culled against, when not the one drawing.
   */
  cullCamera: Camera | null = null

  #count: number
  #dirty = true
  // The visible instances, packed together for the GPU
  #packedMatrices: Float32Array
  #packedColours: Float32Array
  #visible: Uint32Array
  #visibleCount = -1
  #bounds: WTCGLBounds | undefined
  #sharedKeys: string[] = []
  #planes: FrustumPlane[] = []

  constructor(
    gl: WTCGLRenderingContext,
    {
      geometry,
      program,
      count,
      mode = gl.TRIANGLES,
      frustumCulled = true,
      renderOrder = 0
    }: InstancedMeshOptions
  ) {
    if (!geometry) throw new Error('InstancedMesh: a geometry is required')
    if (!(count > 0)) throw new Error('InstancedMesh: count must be above 0')

    const matrices = new Float32Array(count * 16)
    for (let i = 0; i < count; i++) {
      matrices[i * 16] = 1
      matrices[i * 16 + 5] = 1
      matrices[i * 16 + 10] = 1
      matrices[i * 16 + 15] = 1
    }
    const colours = new Float32Array(count * 3).fill(1)

    const attributes: Record<string, GeometryAttribute> = {}
    for (const key in geometry.attributes) {
      attributes[key] = sharedAttribute(geometry.attributes[key])
    }
    attributes.instanceMatrix = new GeometryAttribute({
      size: 16,
      instanced: 1,
      data: matrices
    })
    attributes.instanceColour = new GeometryAttribute({
      size: 3,
      instanced: 1,
      data: colours
    })

    super(gl, {
      geometry: new Geometry(gl, attributes),
      program,
      mode,
      frustumCulled,
      renderOrder
    })

    this.source = geometry
    this.capacity = count
    this.#count = count
    this.matrices = matrices
    this.colours = colours
    this.#packedMatrices = new Float32Array(matrices.length)
    this.#packedColours = new Float32Array(colours.length)
    this.#visible = new Uint32Array(count)
    this.#readSource()

    this.addBeforeRender(({ camera }) => {
      this.#followSourceBuffers()
      const cullWith = this.frustumCulled ? (this.cullCamera ?? camera) : null
      if (cullWith) this.cull(cullWith)
      else this.#drawAll()
    })
  }

  /** How many instances are drawn, from the first. At most `capacity`. */
  get count(): number {
    return this.#count
  }
  set count(value: number) {
    this.#count = Math.max(0, Math.min(this.capacity, Math.floor(value)))
    this.#dirty = true
  }

  /** Set instance `i`'s matrix, copied from `matrix`. */
  setMatrixAt(i: number, matrix: Mat4): void {
    const o = this.#offset(i, 16)
    const m = this.matrices
    m[o] = matrix.a11
    m[o + 1] = matrix.a12
    m[o + 2] = matrix.a13
    m[o + 3] = matrix.a14
    m[o + 4] = matrix.a21
    m[o + 5] = matrix.a22
    m[o + 6] = matrix.a23
    m[o + 7] = matrix.a24
    m[o + 8] = matrix.a31
    m[o + 9] = matrix.a32
    m[o + 10] = matrix.a33
    m[o + 11] = matrix.a34
    m[o + 12] = matrix.a41
    m[o + 13] = matrix.a42
    m[o + 14] = matrix.a43
    m[o + 15] = matrix.a44
    this.#dirty = true
  }

  /** Copy instance `i`'s matrix into `out`. */
  getMatrixAt(i: number, out: Mat4): Mat4 {
    const o = this.#offset(i, 16)
    const m = this.matrices
    out.a11 = m[o]
    out.a12 = m[o + 1]
    out.a13 = m[o + 2]
    out.a14 = m[o + 3]
    out.a21 = m[o + 4]
    out.a22 = m[o + 5]
    out.a23 = m[o + 6]
    out.a24 = m[o + 7]
    out.a31 = m[o + 8]
    out.a32 = m[o + 9]
    out.a33 = m[o + 10]
    out.a34 = m[o + 11]
    out.a41 = m[o + 12]
    out.a42 = m[o + 13]
    out.a43 = m[o + 14]
    out.a44 = m[o + 15]
    return out
  }

  /** Set instance `i`'s colour. */
  setColourAt(i: number, colour: ArrayLike<number>): void {
    const o = this.#offset(i, 3)
    this.colours[o] = colour[0]
    this.colours[o + 1] = colour[1]
    this.colours[o + 2] = colour[2]
    this.#dirty = true
  }

  /** Copy instance `i`'s colour into `out`. */
  getColourAt<T extends number[] | Float32Array>(i: number, out: T): T {
    const o = this.#offset(i, 3)
    out[0] = this.colours[o]
    out[1] = this.colours[o + 1]
    out[2] = this.colours[o + 2]
    return out
  }

  /**
   * Draw only the instances `camera` can see. Called before each draw when
   * `frustumCulled` is on, with `cullCamera` or the drawing camera. The
   * camera's matrices should be up to date, as they are while rendering.
   */
  cull(camera: Camera): void {
    camera.updateFrustum()
    const planes = this.#planes
    const f = camera.frustum
    planes[0] = f.xNeg
    planes[1] = f.xPos
    planes[2] = f.yNeg
    planes[3] = f.yPos
    planes[4] = f.zNeg
    planes[5] = f.zPos

    const bounds = this.#bounds
    const visible = this.#visible
    let n = 0
    let changed = this.#dirty

    if (!bounds) {
      // Bounds can't be measured (an external position): draw them all
      for (let i = 0; i < this.#count; i++) {
        if (visible[n] !== i) changed = true
        visible[n++] = i
      }
    } else {
      const cx = bounds.center.x
      const cy = bounds.center.y
      const cz = bounds.center.z
      const w = this.worldMatrix
      const worldScale = Math.sqrt(
        Math.max(
          w.a11 * w.a11 + w.a12 * w.a12 + w.a13 * w.a13,
          w.a21 * w.a21 + w.a22 * w.a22 + w.a23 * w.a23,
          w.a31 * w.a31 + w.a32 * w.a32 + w.a33 * w.a33
        )
      )
      const m = this.matrices

      for (let i = 0; i < this.#count; i++) {
        const o = i * 16
        // The bounds centre through the instance, then the mesh
        const lx = m[o] * cx + m[o + 4] * cy + m[o + 8] * cz + m[o + 12]
        const ly = m[o + 1] * cx + m[o + 5] * cy + m[o + 9] * cz + m[o + 13]
        const lz = m[o + 2] * cx + m[o + 6] * cy + m[o + 10] * cz + m[o + 14]
        const x = w.a11 * lx + w.a21 * ly + w.a31 * lz + w.a41
        const y = w.a12 * lx + w.a22 * ly + w.a32 * lz + w.a42
        const z = w.a13 * lx + w.a23 * ly + w.a33 * lz + w.a43
        // A bound on the scale of the two together
        const scale = Math.sqrt(
          Math.max(
            m[o] * m[o] + m[o + 1] * m[o + 1] + m[o + 2] * m[o + 2],
            m[o + 4] * m[o + 4] + m[o + 5] * m[o + 5] + m[o + 6] * m[o + 6],
            m[o + 8] * m[o + 8] + m[o + 9] * m[o + 9] + m[o + 10] * m[o + 10]
          )
        )
        const radius = bounds.radius * scale * worldScale

        // The six planes, inline: passing doubles to a function call would
        // box them, which allocates per instance
        let inside = true
        for (let p = 0; p < 6; p++) {
          const normal = planes[p].pos
          if (
            normal.x * x + normal.y * y + normal.z * z + planes[p].constant <
            -radius
          ) {
            inside = false
            break
          }
        }
        if (!inside) continue
        if (visible[n] !== i) changed = true
        visible[n++] = i
      }
    }

    const matrixAttr = this.geometry.attributes.instanceMatrix
    const colourAttr = this.geometry.attributes.instanceColour
    if (matrixAttr.data !== this.#packedMatrices) changed = true
    if (n !== this.#visibleCount) changed = true

    if (changed) {
      const pm = this.#packedMatrices
      const pc = this.#packedColours
      const m = this.matrices
      const c = this.colours
      for (let k = 0; k < n; k++) {
        const i = visible[k]
        for (let j = 0; j < 16; j++) pm[k * 16 + j] = m[i * 16 + j]
        pc[k * 3] = c[i * 3]
        pc[k * 3 + 1] = c[i * 3 + 1]
        pc[k * 3 + 2] = c[i * 3 + 2]
      }
      matrixAttr.data = pm
      colourAttr.data = pc
      matrixAttr.needsUpdate = true
      colourAttr.needsUpdate = true
    }

    this.#visibleCount = n
    this.#dirty = false
    this.geometry.setInstancedCount(n)
  }

  /**
   * Draw from the source geometry again after its attributes or index
   * change.
   */
  update(): void {
    for (const key in this.source.attributes) {
      this.geometry.addAttribute(
        key,
        sharedAttribute(this.source.attributes[key])
      )
    }
    this.#readSource()
    this.#dirty = true
  }

  /** Every instance up to `count`, straight from the arrays. */
  #drawAll() {
    const matrixAttr = this.geometry.attributes.instanceMatrix
    const colourAttr = this.geometry.attributes.instanceColour
    if (this.#dirty || matrixAttr.data !== this.matrices) {
      matrixAttr.data = this.matrices
      colourAttr.data = this.colours
      matrixAttr.needsUpdate = true
      colourAttr.needsUpdate = true
    }
    // So culling packs again if it's turned back on
    this.#visibleCount = -1
    this.#dirty = false
    this.geometry.setInstancedCount(this.#count)
  }

  /** The source's attribute names and bounds. */
  #readSource() {
    this.#sharedKeys = Object.keys(this.source.attributes)
    const position = this.source.attributes.position
    if (!this.source.bounds && position && !position.external) {
      this.source.computeBoundingSphere()
    }
    this.#bounds = this.source.bounds
  }

  /** Re-point any buffer the source recreated, as after a lost context. */
  #followSourceBuffers() {
    const keys = this.#sharedKeys
    for (let i = 0; i < keys.length; i++) {
      const own = this.geometry.attributes[keys[i]]
      const source = this.source.attributes[keys[i]]
      if (own && source && own.buffer !== source.buffer) {
        own.buffer = source.buffer
      }
    }
  }

  #offset(i: number, size: number) {
    if (!(i >= 0 && i < this.capacity)) {
      throw new RangeError(
        `InstancedMesh: instance ${i} is outside 0–${this.capacity - 1}`
      )
    }
    return i * size
  }
}
