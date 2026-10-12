import { Vec3 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

/**
 * Points for a line: a flat list of xyz triples, or `Vec3`s.
 */
export type LinePoints = Float32Array | number[] | Vec3[]

/**
 * Width along a line, as a multiple of the line's width. `t` runs from 0 at
 * the first point to 1 at the last; `i` is the point's index.
 */
export type LineWidthCallback = (t: number, i: number) => number

export interface LineGeometryOptions {
  points: LinePoints
  /**
   * Join the last point back to the first.
   */
  closed: boolean
  width: LineWidthCallback
  attributes: Record<string, GeometryAttribute>
}

const ATTRIBUTES: [name: string, size: number][] = [
  ['position', 3],
  ['prev', 3],
  ['next', 3],
  ['side', 1],
  ['uv', 2],
  ['lineDistance', 1],
  ['width', 1]
]

/**
 * Geometry for a thick line, extruded in the vertex shader (see `Line`).
 * Each point becomes two vertices, one either side of the line, with:
 *
 * - `position`, `prev` and `next`: the point and its neighbours. At an open
 *   end the missing neighbour is mirrored, so the shader needs no special
 *   case.
 * - `side`: -1 or 1.
 * - `uv`: x runs 0 → 1 along the line, y is 0 or 1 across it.
 * - `lineDistance`: the distance travelled along the line, so dashes and
 *   textures keep their size as the line grows.
 * - `width`: the width multiplier from the `width` callback.
 *
 * A closed line repeats its first point at the end so the ribbon joins up.
 */
export class LineGeometry extends Geometry {
  closed: boolean
  widthCallback?: LineWidthCallback

  #points: Float32Array
  #count: number

  constructor(
    gl: WTCGLRenderingContext,
    {
      points = [],
      closed = false,
      width,
      attributes = {}
    }: Partial<LineGeometryOptions> = {}
  ) {
    const flat = LineGeometry.flatten(points)
    const count = flat.length / 3
    const { data, index } = LineGeometry.allocate(count, closed)
    LineGeometry.build(data, flat, closed, width)

    const attr: Record<string, GeometryAttribute> = { ...attributes }
    for (const [name, size] of ATTRIBUTES)
      attr[name] = new GeometryAttribute({ size, data: data[name] })
    attr.index = new GeometryAttribute({ data: index })

    super(gl, attr)

    this.closed = closed
    this.widthCallback = width
    this.#points = flat
    this.#count = count
  }

  /**
   * The line's points, as a flat list of xyz triples. Don't change it
   * directly; use `setPoints` or `push`.
   */
  get points(): Float32Array {
    return this.#points
  }

  /**
   * The number of points.
   */
  get pointCount(): number {
    return this.#count
  }

  /**
   * Replace the line's points. With the same number of points the existing
   * buffers are reused, so this is cheap enough to call every frame.
   */
  setPoints(points: LinePoints): void {
    const flat = LineGeometry.flatten(points)
    const count = flat.length / 3

    if (count === this.#count) {
      this.#points.set(flat)
      this.#rebuild()
      return
    }

    this.#points = flat
    this.#count = count
    const { data, index } = LineGeometry.allocate(count, this.closed)
    LineGeometry.build(data, flat, this.closed, this.widthCallback)
    for (const [name] of ATTRIBUTES) {
      const attr = this.attributes[name]
      attr.data = data[name]
      attr.count = data[name].length / attr.size
      attr.needsUpdate = true
    }
    this.#setIndex(index)
    this.bounds = undefined
  }

  /**
   * Add a point to the head of the line and drop the oldest from the tail,
   * keeping the same number of points. For trails.
   */
  push(point: Vec3 | number[]): void {
    if (this.#count === 0) return
    const p = this.#points
    p.copyWithin(0, 3)
    const end = p.length - 3
    if (point instanceof Vec3) {
      p[end] = point.x
      p[end + 1] = point.y
      p[end + 2] = point.z
    } else {
      p[end] = point[0]
      p[end + 1] = point[1]
      p[end + 2] = point[2] ?? 0
    }
    this.#rebuild()
  }

  /**
   * Rebuild the attributes in place from the current points, eg after the
   * width callback changes.
   */
  update(): void {
    this.#rebuild()
  }

  #rebuild(): void {
    const data: Record<string, Float32Array> = {}
    for (const [name] of ATTRIBUTES)
      data[name] = this.attributes[name].data as Float32Array
    LineGeometry.build(data, this.#points, this.closed, this.widthCallback)
    for (const [name] of ATTRIBUTES) this.attributes[name].needsUpdate = true
    this.bounds = undefined
  }

  // The index isn't re-uploaded on draw like other attributes, and it's part
  // of whichever vertex array is bound, so upload it with none bound.
  #setIndex(index: Uint16Array | Uint32Array): void {
    const attr = this.attributes.index
    attr.data = index
    attr.type =
      index instanceof Uint32Array
        ? this.gl.UNSIGNED_INT
        : this.gl.UNSIGNED_SHORT
    attr.count = index.length
    this.gl.renderer.bindVertexArray(null)
    this.gl.renderer.currentGeometry = ''
    attr.updateAttribute(this.gl)
    this.setDrawRange(0, index.length)
  }

  /**
   * Turn any accepted point format into a flat Float32Array of xyz triples.
   */
  static flatten(points: LinePoints): Float32Array {
    if (points instanceof Float32Array) return points.slice()
    if (points.length && points[0] instanceof Vec3) {
      const flat = new Float32Array(points.length * 3)
      ;(points as Vec3[]).forEach((p, i) => {
        flat[i * 3] = p.x
        flat[i * 3 + 1] = p.y
        flat[i * 3 + 2] = p.z
      })
      return flat
    }
    return new Float32Array(points as number[])
  }

  /**
   * Allocate the attribute arrays for a number of points.
   */
  static allocate(
    count: number,
    closed: boolean
  ): {
    data: Record<string, Float32Array>
    index: Uint16Array | Uint32Array
  } {
    // A closed line repeats its first point
    const points = closed && count > 1 ? count + 1 : count
    const vertices = points * 2
    const data: Record<string, Float32Array> = {}
    for (const [name, size] of ATTRIBUTES)
      data[name] = new Float32Array(vertices * size)

    const segments = Math.max(0, points - 1)
    const index =
      vertices > 65535
        ? new Uint32Array(segments * 6)
        : new Uint16Array(segments * 6)
    // Two triangles per segment, between this point's pair and the next's
    for (let i = 0; i < segments; i++) {
      const a = i * 2
      const j = i * 6
      index[j] = a
      index[j + 1] = a + 1
      index[j + 2] = a + 2
      index[j + 3] = a + 2
      index[j + 4] = a + 1
      index[j + 5] = a + 3
    }
    return { data, index }
  }

  /**
   * Fill the attribute arrays from a flat list of points.
   */
  static build(
    data: Record<string, Float32Array>,
    flat: Float32Array,
    closed: boolean,
    width?: LineWidthCallback
  ): void {
    const count = flat.length / 3
    if (count === 0) return
    const loop = closed && count > 1
    const points = loop ? count + 1 : count
    const { position, prev, next, side, uv, lineDistance } = data
    const widths = data.width

    // point i of the drawn line (a closed line wraps back to the start)
    const at = (i: number) => ((i % count) + count) % count

    let distance = 0
    for (let i = 0; i < points; i++) {
      const c = at(i) * 3
      const x = flat[c]
      const y = flat[c + 1]
      const z = flat[c + 2]

      // neighbours; an open end mirrors the one it has
      let px: number, py: number, pz: number
      let nx: number, ny: number, nz: number
      if (loop || i > 0) {
        const p = at(i - 1) * 3
        px = flat[p]
        py = flat[p + 1]
        pz = flat[p + 2]
      } else if (count > 1) {
        px = 2 * x - flat[3]
        py = 2 * y - flat[4]
        pz = 2 * z - flat[5]
      } else {
        px = x
        py = y
        pz = z
      }
      if (loop || i < points - 1) {
        const n = at(i + 1) * 3
        nx = flat[n]
        ny = flat[n + 1]
        nz = flat[n + 2]
      } else if (count > 1) {
        const p = at(i - 1) * 3
        nx = 2 * x - flat[p]
        ny = 2 * y - flat[p + 1]
        nz = 2 * z - flat[p + 2]
      } else {
        nx = x
        ny = y
        nz = z
      }

      if (i > 0) {
        const p = at(i - 1) * 3
        distance += Math.hypot(x - flat[p], y - flat[p + 1], z - flat[p + 2])
      }

      const t = points > 1 ? i / (points - 1) : 0
      const w = width ? width(t, i) : 1

      // written field by field: this runs for every point on every update
      for (let s = 0; s < 2; s++) {
        const v = i * 2 + s
        const v3 = v * 3
        position[v3] = x
        position[v3 + 1] = y
        position[v3 + 2] = z
        prev[v3] = px
        prev[v3 + 1] = py
        prev[v3 + 2] = pz
        next[v3] = nx
        next[v3 + 1] = ny
        next[v3 + 2] = nz
        side[v] = s ? 1 : -1
        uv[v * 2] = t
        uv[v * 2 + 1] = s
        lineDistance[v] = distance
        widths[v] = w
      }
    }
  }
}
