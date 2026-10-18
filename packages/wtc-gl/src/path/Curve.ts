import { Path } from './Path'
import { toXYZ } from './segments'
import type { PathPoint, XYZ } from './segments'

export type CurveType = 'catmullrom' | 'quadraticbezier' | 'cubicbezier'

export interface CurveOptions {
  points: PathPoint[]
  type: CurveType
  closed: boolean
  alpha: number
}

const distance = (a: XYZ, b: XYZ) =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

/**
 * A `Path` through or around a list of points.
 *
 * - `catmullrom` (the default) passes smoothly through every point. `alpha`
 *   sets how the spacing of the points shapes the curve: 0 is the uniform
 *   Catmull-Rom, 0.5 (the default) is centripetal, which never forms cusps or
 *   loops within a span, and 1 is chordal. `closed` joins the last point back
 *   to the first, smoothly.
 * - `quadraticbezier` takes `p0, c, p1, c, p2, …` and `cubicbezier` takes
 *   `p0, c1, c2, p1, …`: chains of Bézier spans sharing their end points.
 *   `closed` adds a straight line back to the start.
 *
 * It's a `Path`, so it samples evenly by distance and has frames. Change its
 * points with `setPoints`.
 */
export class Curve extends Path {
  static readonly CATMULLROM = 'catmullrom' as const
  static readonly QUADRATICBEZIER = 'quadraticbezier' as const
  static readonly CUBICBEZIER = 'cubicbezier' as const

  readonly type: CurveType
  readonly alpha: number
  #closed: boolean
  #points: XYZ[] = []

  constructor({
    points = [],
    type = 'catmullrom',
    closed = false,
    alpha = 0.5
  }: Partial<CurveOptions> = {}) {
    super()
    this.type = type
    this.alpha = alpha
    this.#closed = closed
    this.setPoints(points)
  }

  /** A copy of the points the curve was built from. */
  get points(): XYZ[] {
    return this.#points.map((p) => [...p] as XYZ)
  }

  /** Rebuilds the curve through new points, with the same type and options. */
  setPoints(points: PathPoint[]): this {
    this.clear()
    this.#points = points.map(toXYZ)

    if (this.type === 'catmullrom') this.#catmullRom()
    else this.#bezier(this.type === 'quadraticbezier' ? 2 : 3)

    return this
  }

  // Each span between two points becomes a cubic Bézier, using the
  // Catmull-Rom → Bézier conversion for knots spaced by distance^alpha from
  // "Parameterization and Applications of Catmull-Rom Curves" (Yuksel,
  // Schaefer and Keyser, 2011)
  #catmullRom() {
    const closed = this.#closed

    // Repeated points make zero-length spans, so drop them
    const points = this.#points.filter(
      (p, i, all) => i === 0 || distance(all[i - 1], p) > 1e-12
    )
    if (closed && points.length > 1) {
      if (distance(points[points.length - 1], points[0]) <= 1e-12) points.pop()
    }

    if (points.length < 2) {
      throw new Error('Curve: a catmullrom curve needs at least two points')
    }
    if (closed && points.length < 3) {
      throw new Error('Curve: a closed catmullrom curve needs three points')
    }

    const n = points.length
    // The neighbour before or after a point. Open ends reflect the end span.
    const at = (i: number): XYZ => {
      if (closed) return points[(i + n) % n]
      if (i < 0) return reflect(points[0], points[1])
      if (i >= n) return reflect(points[n - 1], points[n - 2])
      return points[i]
    }
    const reflect = (a: XYZ, b: XYZ): XYZ => [
      2 * a[0] - b[0],
      2 * a[1] - b[1],
      2 * a[2] - b[2]
    ]

    this.moveTo(points[0])
    const spans = closed ? n : n - 1
    for (let i = 0; i < spans; i++) {
      const p0 = at(i - 1)
      const p1 = at(i)
      const p2 = at(i + 1)
      const p3 = at(i + 2)

      const d1 = distance(p0, p1) ** this.alpha
      const d2 = distance(p1, p2) ** this.alpha
      const d3 = distance(p2, p3) ** this.alpha

      const c1: XYZ = [0, 0, 0]
      const c2: XYZ = [0, 0, 0]
      for (let k = 0; k < 3; k++) {
        c1[k] =
          (d1 * d1 * p2[k] -
            d2 * d2 * p0[k] +
            (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[k]) /
          (3 * d1 * (d1 + d2))
        c2[k] =
          (d3 * d3 * p1[k] -
            d2 * d2 * p3[k] +
            (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[k]) /
          (3 * d3 * (d3 + d2))
      }
      this.bezierCurveTo(c1, c2, p2)
    }
    if (closed) this.closed = true
  }

  // Chains of spans that share end points: `order` is 2 for quadratic and 3
  // for cubic
  #bezier(order: 2 | 3) {
    const points = this.#points
    if (points.length < order + 1 || (points.length - 1) % order !== 0) {
      const shape = order === 2 ? 'p0, c, p1, c, p2' : 'p0, c1, c2, p1'
      throw new Error(
        `Curve: a ${this.type} curve takes ${shape}, …: ${order} more points per span after the first, but got ${points.length}`
      )
    }

    this.moveTo(points[0])
    for (let i = 1; i < points.length; i += order) {
      if (order === 2) this.quadraticCurveTo(points[i], points[i + 1])
      else this.bezierCurveTo(points[i], points[i + 1], points[i + 2])
    }
    if (this.#closed) this.close()
  }
}
