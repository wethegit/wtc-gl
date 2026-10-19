import { describe, expect, it } from 'vitest'
import { Vec2, Vec3 } from 'wtc-math'

import { Curve } from '../src/path/Curve'
import type { CubicBezierSegment } from '../src/path/segments'

type XYZ = [number, number, number]

const xyz = (v: Vec3): XYZ => [v.x, v.y, v.z]

const expectClose = (actual: XYZ | Vec3, expected: XYZ, digits = 6) => {
  const a = Array.isArray(actual) ? actual : xyz(actual)
  a.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits))
}

const unit = (v: Vec3): XYZ => {
  const l = v.length
  return [v.x / l, v.y / l, v.z / l]
}

// Whether a polyline in the xy plane crosses itself
const crosses = (points: Vec3[]) => {
  const side = (a: Vec3, b: Vec3, c: Vec3) =>
    Math.sign((c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x))
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      const [a, b, c, d] = [points[i], points[i + 1], points[j], points[j + 1]]
      if (side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)) {
        return true
      }
    }
  }
  return false
}

const zigzag: XYZ[] = [
  [0, 0, 0],
  [1, 2, 0],
  [3, 2.5, 1],
  [4, 0, 1],
  [6, 1, 0]
]

describe('Curve', () => {
  it('has type constants matching the type names', () => {
    expect(Curve.CATMULLROM).toBe('catmullrom')
    expect(Curve.QUADRATICBEZIER).toBe('quadraticbezier')
    expect(Curve.CUBICBEZIER).toBe('cubicbezier')
  })

  it('is a Path, so it samples evenly', () => {
    const curve = new Curve({ points: zigzag })
    const points = curve.getPoints(10)
    expect(points.length).toBe(11)
    expectClose(points[0], zigzag[0])
    expectClose(points[10], zigzag[4])
    expect(curve.computeFrames(10).normals.length).toBe(11)
  })
})

describe('Curve catmullrom', () => {
  it('passes through every point, one cubic span between each pair', () => {
    const curve = new Curve({ points: zigzag })
    expect(curve.segments.length).toBe(4)
    curve.segments.forEach((segment, i) => {
      expectClose(segment.getPoint(0, new Vec3()), zigzag[i])
      expectClose(segment.getPoint(1, new Vec3()), zigzag[i + 1])
    })
  })

  it('turns smoothly through each point', () => {
    for (const alpha of [0, 0.5, 1]) {
      const { segments } = new Curve({ points: zigzag, alpha })
      for (let i = 1; i < segments.length; i++) {
        const before = segments[i - 1].getDerivative(1)
        const after = segments[i].getDerivative(0)
        expectClose(unit(after), unit(before), 6)
      }
    }
  })

  it('is the uniform Catmull-Rom when alpha is 0', () => {
    const curve = new Curve({ points: zigzag, alpha: 0 })
    const span = curve.segments[1] as CubicBezierSegment
    // The first control point is p1 + (p2 - p0) / 6
    const [p0, p1, p2] = zigzag
    expectClose(
      span.p1,
      [0, 1, 2].map((k) => p1[k] + (p2[k] - p0[k]) / 6) as XYZ
    )
  })

  it("doesn't loop over itself on uneven spacing when centripetal", () => {
    // A short span between long ones: the uniform curve forms a small loop
    // there, and the centripetal one doesn't
    const cases: XYZ[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
        [10.4, 0.4, 0],
        [10.4, 10.4, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 0],
        [1.1, 1, 0],
        [0, 2, 0]
      ]
    ]
    for (const points of cases) {
      const loops = (alpha: number) =>
        crosses(new Curve({ points, alpha }).getPoints(400))
      expect(loops(0)).toBe(true)
      expect(loops(0.5)).toBe(false)
    }
  })

  it('loops back when closed, smoothly through the start', () => {
    const curve = new Curve({ points: zigzag, closed: true })
    expect(curve.closed).toBe(true)
    expect(curve.segments.length).toBe(5)
    expectClose(curve.getPointAt(1), zigzag[0])
    expectClose(curve.getTangentAt(1), xyz(curve.getTangentAt(0)), 6)
  })

  it('skips repeated points, including a closing repeat of the start', () => {
    const open = new Curve({
      points: [
        [0, 0, 0],
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 0],
        [2, 1, 0]
      ]
    })
    expect(open.segments.length).toBe(2)

    const closed = new Curve({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 0, 0]
      ],
      closed: true
    })
    expect(closed.segments.length).toBe(3)
  })

  it('needs two points, or three when closed', () => {
    expect(() => new Curve({ points: [[0, 0, 0]] })).toThrow(/two points/)
    expect(() => new Curve({ points: [] })).toThrow(/two points/)
    expect(
      () =>
        new Curve({
          points: [
            [0, 0, 0],
            [1, 0, 0]
          ],
          closed: true
        })
    ).toThrow(/three points/)
    // Two points make a straight line
    const line = new Curve({
      points: [
        [0, 0, 0],
        [2, 0, 0]
      ]
    })
    expect(line.getLength()).toBeCloseTo(2)
  })
})

describe('Curve béziers', () => {
  it('chains quadratic spans that share their ends', () => {
    const curve = new Curve({
      type: Curve.QUADRATICBEZIER,
      points: [
        [0, 0],
        [1, 2],
        [2, 0],
        [3, -2],
        [4, 0]
      ]
    })
    expect(curve.segments.length).toBe(2)
    expectClose(curve.getPointAt(0), [0, 0, 0])
    expectClose(curve.segments[0].getPoint(1, new Vec3()), [2, 0, 0])
    expectClose(curve.getPointAt(1), [4, 0, 0])
  })

  it('chains cubic spans that share their ends', () => {
    const curve = new Curve({
      type: 'cubicbezier',
      points: [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [1, -1],
        [2, -1],
        [2, 0]
      ]
    })
    expect(curve.segments.length).toBe(2)
    expectClose(curve.segments[0].getPoint(1, new Vec3()), [1, 0, 0])
    expectClose(curve.getPointAt(1), [2, 0, 0])
  })

  it('throws when the points are not whole spans', () => {
    expect(
      () =>
        new Curve({
          type: 'quadraticbezier',
          points: [
            [0, 0],
            [1, 1],
            [2, 0],
            [3, 1]
          ]
        })
    ).toThrow(/quadraticbezier/)
    expect(
      () =>
        new Curve({
          type: 'cubicbezier',
          points: [
            [0, 0],
            [1, 1],
            [2, 0]
          ]
        })
    ).toThrow(/cubicbezier/)
  })

  it('closes with a straight line back to the start', () => {
    const curve = new Curve({
      type: 'quadraticbezier',
      points: [
        [0, 0],
        [1, 2],
        [2, 0]
      ],
      closed: true
    })
    expect(curve.segments.length).toBe(2)
    expectClose(curve.getPointAt(1), [0, 0, 0])
  })
})

describe('Curve points', () => {
  it('takes Vec3, Vec2 and arrays, without changing them', () => {
    const a = new Vec3(0, 0, 0)
    const b = new Vec2(1, 1)
    const curve = new Curve({ points: [a, b, [2, 0], [3, 1, 1]] })
    curve.getPoints(16)
    expect(xyz(a)).toEqual([0, 0, 0])
    expect([b.x, b.y]).toEqual([1, 1])
    expectClose(curve.getPointAt(1), [3, 1, 1])
  })

  it('rebuilds with setPoints, keeping its type and options', () => {
    const curve = new Curve({ points: zigzag, closed: true, alpha: 1 })
    const before = curve.getLength()
    curve.setPoints([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0]
    ])
    expect(curve.segments.length).toBe(3)
    expect(curve.closed).toBe(true)
    expect(curve.alpha).toBe(1)
    expect(curve.getLength()).not.toBeCloseTo(before)
    expect(curve.points.length).toBe(3)
  })
})

// The second derivative of a cubic Bézier span at t = 0 or 1
const secondDerivative = (span: CubicBezierSegment, end: 0 | 1): XYZ => {
  const [a, b, c] = end
    ? [span.p3, span.p2, span.p1]
    : [span.p0, span.p1, span.p2]
  return [0, 1, 2].map((k) => 6 * (a[k] - 2 * b[k] + c[k])) as XYZ
}

const polyline = (points: XYZ[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        Math.hypot(
          p[0] - points[i][0],
          p[1] - points[i][1],
          p[2] - points[i][2]
        ),
      0
    )

describe('Curve tension', () => {
  it('is the plain Catmull-Rom at 0, the default', () => {
    const plain = new Curve({ points: zigzag })
    const zero = new Curve({ points: zigzag, tension: 0 })
    expect(zero.tension).toBe(0)
    expect(plain.tension).toBe(0)
    expect(zero.getLength()).toBe(plain.getLength())
  })

  it('still passes through every point', () => {
    for (const tension of [-0.5, 0.5, 1]) {
      const { segments } = new Curve({ points: zigzag, tension })
      segments.forEach((segment, i) => {
        expectClose(segment.getPoint(0, new Vec3()), zigzag[i])
        expectClose(segment.getPoint(1, new Vec3()), zigzag[i + 1])
      })
    }
  })

  it('tightens towards straight lines at 1, and loosens below 0', () => {
    const length = (tension: number) =>
      new Curve({ points: zigzag, tension }).getLength()
    expect(length(1)).toBeCloseTo(polyline(zigzag), 6)
    expect(length(0.5)).toBeLessThan(length(0))
    expect(length(-0.5)).toBeGreaterThan(length(0))
  })

  it('keeps its tension through setPoints', () => {
    const curve = new Curve({ points: zigzag, tension: 1 })
    curve.setPoints(zigzag.slice(0, 3))
    expect(curve.tension).toBe(1)
    expect(curve.getLength()).toBeCloseTo(polyline(zigzag.slice(0, 3)), 6)
  })
})

describe('Curve bspline', () => {
  it('starts and ends on the end points, but only passes near the others', () => {
    const curve = new Curve({ type: Curve.BSPLINE, points: zigzag })
    expectClose(curve.getPointAt(0), zigzag[0])
    expectClose(curve.getPointAt(1), zigzag[4])

    // The middle point pulls the curve towards it, without reaching it
    const nearest = Math.min(
      ...curve
        .getPoints(400)
        .map((p) =>
          Math.hypot(p.x - zigzag[2][0], p.y - zigzag[2][1], p.z - zigzag[2][2])
        )
    )
    expect(nearest).toBeGreaterThan(0.1)
    expect(nearest).toBeLessThan(1.5)
  })

  it('is curvature-continuous where spans join', () => {
    for (const closed of [false, true]) {
      const { segments } = new Curve({
        type: 'bspline',
        points: zigzag,
        closed
      })
      const spans = segments as CubicBezierSegment[]
      const count = closed ? spans.length : spans.length - 1
      for (let i = 0; i < count; i++) {
        const before = spans[i]
        const after = spans[(i + 1) % spans.length]
        expectClose(after.p0, before.p3)
        expectClose(secondDerivative(after, 0), secondDerivative(before, 1), 6)
      }
    }
  })

  it('has a span per point when closed, looping smoothly', () => {
    const curve = new Curve({ type: 'bspline', points: zigzag, closed: true })
    expect(curve.closed).toBe(true)
    expect(curve.segments.length).toBe(zigzag.length)
    expectClose(curve.getPointAt(1), xyz(curve.getPointAt(0)))
    expectClose(curve.getTangentAt(1), xyz(curve.getTangentAt(0)), 6)
  })

  it('needs two points, or three when closed', () => {
    expect(() => new Curve({ type: 'bspline', points: [[0, 0, 0]] })).toThrow(
      /two points/
    )
    expect(
      () =>
        new Curve({
          type: 'bspline',
          points: [
            [0, 0],
            [1, 0]
          ],
          closed: true
        })
    ).toThrow(/three points/)
    const line = new Curve({
      type: 'bspline',
      points: [
        [0, 0],
        [2, 0]
      ]
    })
    expectClose(line.getPointAt(0.5), [1, 0, 0])
  })

  it('is smoother than the Catmull-Rom through the same points', () => {
    // Sum of how much the tangent turns between samples, squared: higher for
    // a curve that bends sharply at points
    const roughness = (curve: Curve) => {
      const { tangents } = curve.computeFrames(200)
      let sum = 0
      for (let i = 1; i < tangents.length; i++) {
        const d = Math.acos(
          Math.min(
            1,
            tangents[i - 1].x * tangents[i].x +
              tangents[i - 1].y * tangents[i].y +
              tangents[i - 1].z * tangents[i].z
          )
        )
        sum += d * d
      }
      return sum
    }
    expect(
      roughness(new Curve({ type: 'bspline', points: zigzag }))
    ).toBeLessThan(roughness(new Curve({ points: zigzag })))
  })
})
