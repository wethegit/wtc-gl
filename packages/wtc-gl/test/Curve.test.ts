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
