// Based on OGL (https://github.com/oframe/ogl), MIT © 2019 Nathan Gordon

import { Vec3 } from 'wtc-math'
import type { Vec2 } from 'wtc-math'

/** A point on a path: a `Vec3`, a `Vec2` (z = 0), or `[x, y]` / `[x, y, z]`. */
export type PathPoint =
  Vec3 | Vec2 | [number, number] | [number, number, number]

export type XYZ = [number, number, number]

/** Copies a path point into a plain `[x, y, z]`. */
export const toXYZ = (p: PathPoint): XYZ =>
  Array.isArray(p) ? [p[0], p[1], p[2] ?? 0] : [p.x, p.y, (p as Vec3).z ?? 0]

// Gauss-Legendre abscissae and weights for n = 24, from bezier.js by Pomax
// (MIT), via OGL. Each abscissa is used as ±x.
const ABSCISSAE = [
  0.06405689286260563, 0.1911188674736163, 0.3150426796961634,
  0.4337935076260451, 0.5454214713888396, 0.6480936519369755,
  0.7401241915785544, 0.820001985973903, 0.8864155270044011, 0.9382745520027328,
  0.9747285559713095, 0.9951872199970213
]
const WEIGHTS = [
  0.12793819534675216, 0.1258374563468283, 0.12167047292780339,
  0.1155056680537256, 0.10744427011596563, 0.09761865210411388,
  0.08619016153195327, 0.0733464814110803, 0.05929858491543678,
  0.04427743881741981, 0.028531388628933663, 0.0123412297999872
]

// Samples in each curved segment's distance-to-t table
const TABLE_SIZE = 32

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v))

const write = (out: Vec3, x: number, y: number, z: number): Vec3 => {
  out.x = x
  out.y = y
  out.z = z
  return out
}

/**
 * One piece of a `Path`, parameterised by t from 0 to 1. t isn't spaced evenly
 * by distance along a curve, so `lengthToT` maps a distance along the segment
 * to its t.
 */
export abstract class PathSegment {
  tiltStart: number
  tiltEnd: number

  #length = -1
  // Distance along the segment at t = i / TABLE_SIZE
  #table: Float64Array | null = null
  // Scratch for the derivative, so measuring doesn't allocate
  #d: XYZ = [0, 0, 0]

  constructor(tiltStart = 0, tiltEnd = 0) {
    this.tiltStart = tiltStart
    this.tiltEnd = tiltEnd
  }

  /** Writes the point at t into `out`. */
  abstract getPoint(t: number, out?: Vec3): Vec3

  /** Writes the derivative (dP/dt) at t into `out`. */
  getDerivative(t: number, out: Vec3 = new Vec3()): Vec3 {
    const d = this.derivative(t, this.#d)
    return write(out, d[0], d[1], d[2])
  }

  /** The derivative at t as plain numbers, written into `out`. */
  abstract derivative(t: number, out: XYZ): XYZ

  /** The segment's length, worked out once by Gauss-Legendre quadrature. */
  get length(): number {
    if (this.#length < 0) this.#length = this.lengthTo(1)
    return this.#length
  }

  /** The tilt at t, interpolated linearly from `tiltStart` to `tiltEnd`. */
  getTilt(t: number): number {
    return this.tiltStart + (this.tiltEnd - this.tiltStart) * t
  }

  /** The t at a distance along the segment, from 0 to `length`. */
  lengthToT(distance: number): number {
    const length = this.length
    if (distance <= 0 || length === 0) return 0
    if (distance >= length) return 1

    if (!this.#table) {
      this.#table = new Float64Array(TABLE_SIZE + 1)
      for (let i = 1; i <= TABLE_SIZE; i++) {
        this.#table[i] =
          this.#table[i - 1] +
          this.lengthBetween((i - 1) / TABLE_SIZE, i / TABLE_SIZE)
      }
    }

    // The table entry at or below the distance, then a lerp to the next one
    const table = this.#table
    let low = 0
    let high = TABLE_SIZE
    while (high - low > 1) {
      const mid = (low + high) >> 1
      if (table[mid] <= distance) low = mid
      else high = mid
    }
    const span = table[high] - table[low]
    const f = span > 0 ? (distance - table[low]) / span : 0
    let t = (low + f) / TABLE_SIZE

    // The lerp is only a first guess where speed changes within an entry, so
    // refine it with Newton's method: the distance's derivative is the speed
    const min = low / TABLE_SIZE
    const max = high / TABLE_SIZE
    for (let i = 0; i < 4; i++) {
      const error = table[low] + this.lengthBetween(min, t) - distance
      const d = this.derivative(t, this.#d)
      const speed = Math.hypot(d[0], d[1], d[2])
      if (Math.abs(error) < length * 1e-9 || speed < 1e-12) break
      t = clamp(t - error / speed, min, max)
    }
    return t
  }

  /** The distance along the segment from t = 0 to t. */
  lengthTo(t: number): number {
    return this.lengthBetween(0, t)
  }

  // Integrates |dP/dt| over [a, b]
  protected lengthBetween(a: number, b: number): number {
    const half = (b - a) / 2
    const mid = (a + b) / 2
    let sum = 0
    for (let i = 0; i < ABSCISSAE.length; i++) {
      const x = half * ABSCISSAE[i]
      let d = this.derivative(mid - x, this.#d)
      sum += WEIGHTS[i] * Math.hypot(d[0], d[1], d[2])
      d = this.derivative(mid + x, this.#d)
      sum += WEIGHTS[i] * Math.hypot(d[0], d[1], d[2])
    }
    return half * sum
  }
}

/** A straight line from `p0` to `p1`. */
export class LineSegment extends PathSegment {
  p0: XYZ
  p1: XYZ

  constructor(p0: PathPoint, p1: PathPoint, tiltStart = 0, tiltEnd = 0) {
    super(tiltStart, tiltEnd)
    this.p0 = toXYZ(p0)
    this.p1 = toXYZ(p1)
  }

  getPoint(t: number, out: Vec3 = new Vec3()): Vec3 {
    const a = this.p0
    const b = this.p1
    return write(
      out,
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    )
  }

  derivative(_t: number, out: XYZ): XYZ {
    out[0] = this.p1[0] - this.p0[0]
    out[1] = this.p1[1] - this.p0[1]
    out[2] = this.p1[2] - this.p0[2]
    return out
  }

  get length(): number {
    const a = this.p0
    const b = this.p1
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }

  lengthToT(distance: number): number {
    const length = this.length
    return length === 0 ? 0 : Math.min(1, Math.max(0, distance / length))
  }

  lengthTo(t: number): number {
    return this.length * t
  }
}

/** A quadratic Bézier from `p0` to `p2`, pulled towards `p1`. */
export class QuadraticBezierSegment extends PathSegment {
  p0: XYZ
  p1: XYZ
  p2: XYZ

  constructor(
    p0: PathPoint,
    p1: PathPoint,
    p2: PathPoint,
    tiltStart = 0,
    tiltEnd = 0
  ) {
    super(tiltStart, tiltEnd)
    this.p0 = toXYZ(p0)
    this.p1 = toXYZ(p1)
    this.p2 = toXYZ(p2)
  }

  getPoint(t: number, out: Vec3 = new Vec3()): Vec3 {
    const k = 1 - t
    const a = k * k
    const b = 2 * k * t
    const c = t * t
    const { p0, p1, p2 } = this
    return write(
      out,
      a * p0[0] + b * p1[0] + c * p2[0],
      a * p0[1] + b * p1[1] + c * p2[1],
      a * p0[2] + b * p1[2] + c * p2[2]
    )
  }

  derivative(t: number, out: XYZ): XYZ {
    const k = 1 - t
    const { p0, p1, p2 } = this
    for (let i = 0; i < 3; i++) {
      out[i] = 2 * k * (p1[i] - p0[i]) + 2 * t * (p2[i] - p1[i])
    }
    return out
  }
}

/** A cubic Bézier from `p0` to `p3`, with control points `p1` and `p2`. */
export class CubicBezierSegment extends PathSegment {
  p0: XYZ
  p1: XYZ
  p2: XYZ
  p3: XYZ

  constructor(
    p0: PathPoint,
    p1: PathPoint,
    p2: PathPoint,
    p3: PathPoint,
    tiltStart = 0,
    tiltEnd = 0
  ) {
    super(tiltStart, tiltEnd)
    this.p0 = toXYZ(p0)
    this.p1 = toXYZ(p1)
    this.p2 = toXYZ(p2)
    this.p3 = toXYZ(p3)
  }

  getPoint(t: number, out: Vec3 = new Vec3()): Vec3 {
    const k = 1 - t
    const a = k * k * k
    const b = 3 * k * k * t
    const c = 3 * k * t * t
    const d = t * t * t
    const { p0, p1, p2, p3 } = this
    return write(
      out,
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
      a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]
    )
  }

  derivative(t: number, out: XYZ): XYZ {
    const k = 1 - t
    const { p0, p1, p2, p3 } = this
    for (let i = 0; i < 3; i++) {
      out[i] =
        3 * k * k * (p1[i] - p0[i]) +
        6 * k * t * (p2[i] - p1[i]) +
        3 * t * t * (p3[i] - p2[i])
    }
    return out
  }
}
