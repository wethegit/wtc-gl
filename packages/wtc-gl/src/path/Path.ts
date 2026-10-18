// Based on OGL (https://github.com/oframe/ogl), MIT © 2019 Nathan Gordon

import { Vec3 } from 'wtc-math'

import {
  CubicBezierSegment,
  LineSegment,
  PathSegment,
  QuadraticBezierSegment,
  toXYZ
} from './segments'
import type { PathPoint, XYZ } from './segments'

export interface PathFrames {
  tangents: Vec3[]
  normals: Vec3[]
  binormals: Vec3[]
}

/**
 * Adjusts the tilt (radians) at each frame. `u` is the fraction of the way
 * along the path, from 0 to 1.
 */
export type TiltFunction = (tilt: number, u: number, path: Path) => number

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v))

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

// out = a × b, normalised if asked
const cross = (out: Vec3, a: Vec3, b: Vec3, normalise = false): Vec3 => {
  const x = a.y * b.z - a.z * b.y
  const y = a.z * b.x - a.x * b.z
  const z = a.x * b.y - a.y * b.x
  const l = normalise ? Math.hypot(x, y, z) || 1 : 1
  out.x = x / l
  out.y = y / l
  out.z = z / l
  return out
}

// Turns the normal towards the binormal by angle, about the tangent
const twist = (angle: number, n: Vec3, b: Vec3) => {
  const s = Math.sin(angle)
  const c = Math.cos(angle)
  const nx = c * n.x + s * b.x
  const ny = c * n.y + s * b.y
  const nz = c * n.z + s * b.z
  b.x = c * b.x - s * n.x
  b.y = c * b.y - s * n.y
  b.z = c * b.z - s * n.z
  n.x = nx
  n.y = ny
  n.z = nz
}

const copy = (v: Vec3) => new Vec3(v.x, v.y, v.z)

/**
 * A continuous 3D path made of line, quadratic and cubic Bézier segments,
 * drawn like a canvas path: `moveTo`, then `lineTo`, `quadraticCurveTo` and
 * `bezierCurveTo`, and optionally `close`.
 *
 * Sampling is by distance along the path, including within curved segments,
 * so `getPoints` and `getPointAt` give evenly spaced points. Each point can
 * carry a tilt (radians), which twists the frames from `computeFrames`. The
 * samplers take an optional `out` to write into, so they don't allocate.
 */
export class Path {
  /** Whether the path loops back to its start. Set by `close()`. */
  closed = false

  /** Adjusts the tilt of each frame in `computeFrames`. */
  tiltFunction: TiltFunction | null = null

  #segments: PathSegment[] = []
  // The distance along the path to the start of each segment
  #offsets: number[] = []
  #length = -1

  #start: XYZ | null = null
  #startTilt = 0
  #last: XYZ | null = null
  #lastTilt = 0

  // Where #locate last found a distance: the segment and its t
  #index = 0
  #t = 0
  #d: XYZ = [0, 0, 0]
  #end = new Vec3()

  /** The path's segments, in order. */
  get segments(): readonly PathSegment[] {
    return this.#segments
  }

  /** Starts the path. It has to come before any segments. */
  moveTo(p: PathPoint, tilt = 0): this {
    if (this.#segments.length) {
      throw new Error('Path: moveTo starts the path, so it must come first')
    }
    this.#start = toXYZ(p)
    this.#startTilt = tilt
    this.#last = this.#start
    this.#lastTilt = tilt
    return this
  }

  /** Adds a straight line to `p`. */
  lineTo(p: PathPoint, tilt = 0): this {
    return this.addSegment(
      new LineSegment(this.#from(), p, this.#lastTilt, tilt)
    )
  }

  /** Adds a quadratic Bézier to `p`, pulled towards `cp`. */
  quadraticCurveTo(cp: PathPoint, p: PathPoint, tilt = 0): this {
    return this.addSegment(
      new QuadraticBezierSegment(this.#from(), cp, p, this.#lastTilt, tilt)
    )
  }

  /** Adds a cubic Bézier to `p`, with control points `cp1` and `cp2`. */
  bezierCurveTo(cp1: PathPoint, cp2: PathPoint, p: PathPoint, tilt = 0): this {
    return this.addSegment(
      new CubicBezierSegment(this.#from(), cp1, cp2, p, this.#lastTilt, tilt)
    )
  }

  /**
   * Adds a segment. The next segment starts where this one ends. It should
   * start where the path currently ends.
   */
  addSegment(segment: PathSegment): this {
    if (!this.#start) {
      const p = segment.getPoint(0, this.#end)
      this.#start = [p.x, p.y, p.z]
      this.#startTilt = segment.tiltStart
    }
    const end = segment.getPoint(1, this.#end)
    this.#last = [end.x, end.y, end.z]
    this.#lastTilt = segment.tiltEnd
    this.#segments.push(segment)
    this.#length = -1
    return this
  }

  /**
   * Loops the path: adds a line back to the start, unless it's already
   * there, and sets `closed`.
   */
  close(): this {
    const start = this.#start
    const last = this.#from()
    if (!start) return this
    const gap = Math.hypot(
      last[0] - start[0],
      last[1] - start[1],
      last[2] - start[2]
    )
    if (gap > 1e-9) this.lineTo(start, this.#startTilt)
    this.closed = true
    return this
  }

  /** Empties the path, ready for a new `moveTo`. */
  clear(): this {
    this.#segments = []
    this.#offsets = []
    this.#length = -1
    this.#start = null
    this.#startTilt = 0
    this.#last = null
    this.#lastTilt = 0
    this.closed = false
    return this
  }

  /** The total length of the path. */
  getLength(): number {
    if (this.#length < 0) {
      let offset = 0
      this.#offsets = this.#segments.map((segment) => {
        const start = offset
        offset += segment.length
        return start
      })
      this.#length = offset
    }
    return this.#length
  }

  /** The point at a distance along the path. */
  getPointAtLength(distance: number, out: Vec3 = new Vec3()): Vec3 {
    this.#locate(distance)
    return this.#segments[this.#index].getPoint(this.#t, out)
  }

  /** The unit tangent, in the direction of travel, at a distance along the path. */
  getTangentAtLength(distance: number, out: Vec3 = new Vec3()): Vec3 {
    this.#locate(distance)
    const segment = this.#segments[this.#index]
    let t = this.#t
    let d = segment.derivative(t, this.#d)
    let length = Math.hypot(d[0], d[1], d[2])

    // A control point on an end point makes the derivative vanish there, so
    // step towards the middle until it doesn't
    for (let step = 1e-6; length < 1e-12 && step < 0.5; step *= 10) {
      t = this.#t < 0.5 ? this.#t + step : this.#t - step
      d = segment.derivative(t, this.#d)
      length = Math.hypot(d[0], d[1], d[2])
    }

    const l = length || 1
    out.x = d[0] / l
    out.y = d[1] / l
    out.z = d[2] / l
    return out
  }

  /** The tilt (radians) at a distance along the path. */
  getTiltAtLength(distance: number): number {
    this.#locate(distance)
    return this.#segments[this.#index].getTilt(this.#t)
  }

  /** The point at `u`, the fraction of the way along the path. */
  getPointAt(u: number, out?: Vec3): Vec3 {
    return this.getPointAtLength(u * this.getLength(), out)
  }

  /** The unit tangent at `u`, the fraction of the way along the path. */
  getTangentAt(u: number, out?: Vec3): Vec3 {
    return this.getTangentAtLength(u * this.getLength(), out)
  }

  /** The tilt at `u`, the fraction of the way along the path. */
  getTiltAt(u: number): number {
    return this.getTiltAtLength(u * this.getLength())
  }

  /** `divisions + 1` points, evenly spaced along the path. */
  getPoints(divisions = 64): Vec3[] {
    const points: Vec3[] = []
    for (let i = 0; i <= divisions; i++) {
      points.push(this.getPointAt(i / divisions))
    }
    return points
  }

  /**
   * Rotation-minimising frames at `divisions + 1` evenly spaced points: the
   * normal is carried along the path, turning only as much as the tangent
   * does, so it doesn't flip or spin like true Frenet frames. Then each frame
   * is twisted by its tilt.
   *
   * On a closed path the twist left over after one lap is spread evenly
   * around the loop, so the last frame matches the first.
   *
   * See "Computation of Rotation Minimizing Frames", Wang et al. 2008.
   */
  computeFrames(divisions = 64, closed = this.closed): PathFrames {
    const length = this.getLength()
    const tangents: Vec3[] = []
    const normals: Vec3[] = []
    const binormals: Vec3[] = []
    const tilts: number[] = []

    for (let i = 0; i <= divisions; i++) {
      const u = i / divisions
      tangents.push(this.getTangentAtLength(u * length))
      const tilt = this.getTiltAtLength(u * length)
      tilts.push(this.tiltFunction ? this.tiltFunction(tilt, u, this) : tilt)
    }
    if (closed) tangents[divisions] = copy(tangents[0])

    // Start with the axis least like the first tangent, made perpendicular
    const t0 = tangents[0]
    const ax = Math.abs(t0.x)
    const ay = Math.abs(t0.y)
    const az = Math.abs(t0.z)
    const axis =
      ax <= ay && ax <= az
        ? new Vec3(1, 0, 0)
        : ay <= az
          ? new Vec3(0, 1, 0)
          : new Vec3(0, 0, 1)
    const side = cross(new Vec3(), t0, axis, true)
    normals.push(cross(new Vec3(), t0, side))
    binormals.push(cross(new Vec3(), t0, normals[0]))

    // Carry the normal along: rotate it by however far the tangent turned
    const k = new Vec3()
    for (let i = 1; i <= divisions; i++) {
      const a = tangents[i - 1]
      const b = tangents[i]
      const n = copy(normals[i - 1])

      cross(k, a, b)
      const sin = Math.hypot(k.x, k.y, k.z)
      if (sin > Number.EPSILON) {
        k.x /= sin
        k.y /= sin
        k.z /= sin
        const cos = clamp(dot(a, b), -1, 1)
        // Rodrigues: n cosθ + (k × n) sinθ + k (k · n)(1 - cosθ)
        const kn = dot(k, n)
        const kx = k.y * n.z - k.z * n.y
        const ky = k.z * n.x - k.x * n.z
        const kz = k.x * n.y - k.y * n.x
        n.x = n.x * cos + kx * sin + k.x * kn * (1 - cos)
        n.y = n.y * cos + ky * sin + k.y * kn * (1 - cos)
        n.z = n.z * cos + kz * sin + k.z * kn * (1 - cos)
        const l = Math.hypot(n.x, n.y, n.z)
        n.x /= l
        n.y /= l
        n.z /= l
      }

      normals.push(n)
      binormals.push(cross(new Vec3(), b, n))
    }

    for (let i = 0; i <= divisions; i++)
      twist(tilts[i], normals[i], binormals[i])

    if (closed) {
      // How far the last normal has turned from the first, about the tangent
      const first = normals[0]
      const last = normals[divisions]
      let step = Math.acos(clamp(dot(first, last), -1, 1)) / divisions
      if (dot(t0, cross(k, first, last)) > 0) step = -step

      for (let i = 1; i < divisions; i++) {
        twist(step * i, normals[i], binormals[i])
      }
      normals[divisions] = copy(first)
      binormals[divisions] = copy(binormals[0])
    }

    return { tangents, normals, binormals }
  }

  #from(): XYZ {
    if (!this.#last) throw new Error('Path: call moveTo before drawing')
    return this.#last
  }

  // Finds the segment at a distance along the path, and the t within it
  #locate(distance: number) {
    const count = this.#segments.length
    if (!count) throw new Error('Path: there are no segments to sample')

    const length = this.getLength()
    const d = clamp(distance, 0, length)

    // The last segment starting at or before the distance
    const offsets = this.#offsets
    let low = 0
    let high = count - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (offsets[mid] <= d) low = mid
      else high = mid - 1
    }

    // Skip zero-length segments, and step back over the end of the path
    while (low > 0 && this.#segments[low].length === 0) low--

    this.#index = low
    this.#t = this.#segments[low].lengthToT(d - offsets[low])
  }
}
