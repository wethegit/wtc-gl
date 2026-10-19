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
import { clamp, rotationMinimisingFrames } from './frames'
import type { PathFrames } from './frames'

export type { PathFrames }

/**
 * Adjusts the tilt (radians) at each frame. `u` is the fraction of the way
 * along the path, from 0 to 1.
 */
export type TiltFunction = (tilt: number, u: number, path: Path) => number

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
   * The path as a polyline that keeps its corners: every segment's start and
   * end, and `curveDivisions - 1` points evenly spaced by distance inside each
   * curved segment. A closed path doesn't repeat its start at the end. Use it
   * for outlines, where `getPoints` would cut the corners.
   */
  toPolyline(curveDivisions = 12): Vec3[] {
    const points: Vec3[] = []
    for (const segment of this.#segments) {
      points.push(segment.getPoint(0))
      if (segment instanceof LineSegment) continue
      const length = segment.length
      for (let k = 1; k < curveDivisions; k++) {
        points.push(
          segment.getPoint(segment.lengthToT((length * k) / curveDivisions))
        )
      }
    }

    const last = this.#segments[this.#segments.length - 1]
    if (last) {
      const end = last.getPoint(1)
      const start = points[0]
      const loops =
        this.closed &&
        Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) <= 1e-9
      if (!loops) points.push(end)
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
    const tilts: number[] = []

    for (let i = 0; i <= divisions; i++) {
      const u = i / divisions
      tangents.push(this.getTangentAtLength(u * length))
      const tilt = this.getTiltAtLength(u * length)
      tilts.push(this.tiltFunction ? this.tiltFunction(tilt, u, this) : tilt)
    }

    return rotationMinimisingFrames(tangents, { closed, tilts })
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
