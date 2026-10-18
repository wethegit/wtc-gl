import { describe, expect, it } from 'vitest'
import { Vec2, Vec3 } from 'wtc-math'

import { Path } from '../src/path/Path'
import { CubicBezierSegment } from '../src/path/segments'

type XYZ = [number, number, number]

const xyz = (v: Vec3): XYZ => [v.x, v.y, v.z]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const expectClose = (actual: XYZ | Vec3, expected: XYZ, digits = 6) => {
  const a = Array.isArray(actual) ? actual : xyz(actual)
  a.forEach((v, i) => expect(v).toBeCloseTo(expected[i], digits))
}

// Length of a segment's curve, measured as a dense polyline by parameter
const polylineLength = (
  point: (t: number, out: Vec3) => Vec3,
  steps = 20000
) => {
  let length = 0
  const prev = point(0, new Vec3())
  const next = new Vec3()
  for (let i = 1; i <= steps; i++) {
    point(i / steps, next)
    length += dist(prev, next)
    prev.x = next.x
    prev.y = next.y
    prev.z = next.z
  }
  return length
}

// A path through points on a helix, as straight lines
const helix = (turns = 2, steps = 200) => {
  const path = new Path()
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * turns * Math.PI * 2
    const p: XYZ = [Math.cos(a), (i / steps) * 2, Math.sin(a)]
    if (i === 0) path.moveTo(p)
    else path.lineTo(p)
  }
  return path
}

describe('Path building', () => {
  it('chains segments from moveTo', () => {
    const path = new Path()
      .moveTo([0, 0, 0])
      .lineTo([1, 0, 0])
      .quadraticCurveTo([2, 0, 0], [2, 1, 0])
      .bezierCurveTo([2, 2, 0], [1, 2, 0], [0, 2, 0])
    expect(path.segments.length).toBe(3)
    expectClose(path.getPointAt(0), [0, 0, 0])
    expectClose(path.getPointAt(1), [0, 2, 0])
  })

  it('throws when drawing before moveTo, or moving after drawing', () => {
    expect(() => new Path().lineTo([1, 0, 0])).toThrow(/moveTo/)
    const path = new Path().moveTo([0, 0, 0]).lineTo([1, 0, 0])
    expect(() => path.moveTo([5, 5, 5])).toThrow(/moveTo/)
  })

  it('throws when sampling an empty path', () => {
    expect(() => new Path().getPointAt(0.5)).toThrow(/no segments/)
    expect(() => new Path().moveTo([0, 0, 0]).getLength()).not.toThrow()
    expect(new Path().moveTo([0, 0, 0]).getLength()).toBe(0)
  })

  it('closes back to the start, unless it is already there', () => {
    const square = new Path()
      .moveTo([0, 0, 0])
      .lineTo([1, 0, 0])
      .lineTo([1, 1, 0])
      .close()
    expect(square.closed).toBe(true)
    expect(square.segments.length).toBe(3)
    expect(square.getLength()).toBeCloseTo(2 + Math.SQRT2)

    const loop = new Path()
      .moveTo([0, 0, 0])
      .lineTo([1, 0, 0])
      .lineTo([0, 0, 0])
      .close()
    expect(loop.segments.length).toBe(2)
    expect(loop.closed).toBe(true)
  })

  it('takes Vec3, Vec2 and [x, y] or [x, y, z] points', () => {
    const path = new Path()
      .moveTo(new Vec2(0, 0))
      .lineTo([1, 0])
      .lineTo(new Vec3(1, 1, 1))
      .lineTo([0, 1, 2])
    expectClose(path.getPointAtLength(1), [1, 0, 0])
    expectClose(path.getPointAt(1), [0, 1, 2])
  })

  it('copies its points, so later changes to them do nothing', () => {
    const a = new Vec3(0, 0, 0)
    const b = new Vec3(2, 0, 0)
    const path = new Path().moveTo(a).lineTo(b)
    path.getPoints(8)
    path.computeFrames(8)
    expect(xyz(a)).toEqual([0, 0, 0])
    expect(xyz(b)).toEqual([2, 0, 0])

    b.x = 10
    expect(path.getLength()).toBe(2)
  })
})

describe('Path length', () => {
  it('measures lines exactly and adds up segments', () => {
    const path = new Path().moveTo([0, 0, 0]).lineTo([3, 4, 0])
    expect(path.getLength()).toBe(5)
    path.lineTo([3, 4, 2])
    expect(path.getLength()).toBe(7)
  })

  it('measures curved segments', () => {
    const cubic = new CubicBezierSegment(
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0.5],
      [1, 0, 0]
    )
    const expected = polylineLength((t, out) => cubic.getPoint(t, out))
    expect(cubic.length).toBeCloseTo(expected, 5)

    const path = new Path()
      .moveTo([0, 0, 0])
      .quadraticCurveTo([1, 2, 0], [2, 0, 0])
    const [quadratic] = path.segments
    expect(path.getLength()).toBeCloseTo(
      polylineLength((t, out) => quadratic.getPoint(t, out)),
      5
    )
  })
})

describe('Path sampling', () => {
  it('samples by distance across segments', () => {
    const path = new Path()
      .moveTo([0, 0, 0])
      .lineTo([1, 0, 0])
      .lineTo([1, 2, 0])
    expectClose(path.getPointAtLength(0.5), [0.5, 0, 0])
    expectClose(path.getPointAtLength(2), [1, 1, 0])
    expectClose(path.getPointAt(0.5), [1, 0.5, 0])
    expectClose(path.getTangentAtLength(0.5), [1, 0, 0])
    expectClose(path.getTangentAtLength(2), [0, 1, 0])
  })

  it('clamps outside the path', () => {
    const path = new Path().moveTo([0, 0, 0]).lineTo([1, 0, 0])
    expectClose(path.getPointAtLength(-1), [0, 0, 0])
    expectClose(path.getPointAt(2), [1, 0, 0])
  })

  it('spaces points evenly by distance, even inside a curve', () => {
    // Control points bunched at the start, so equal steps of t would bunch too
    const path = new Path()
      .moveTo([0, 0, 0])
      .bezierCurveTo([0.02, 0, 0], [0.05, 0.01, 0], [3, 2, 0])

    const parametric: number[] = []
    const [segment] = path.segments
    for (let i = 1; i <= 40; i++) {
      parametric.push(
        dist(
          segment.getPoint((i - 1) / 40, new Vec3()),
          segment.getPoint(i / 40, new Vec3())
        )
      )
    }
    // The test is only meaningful if t is badly uneven here
    expect(Math.max(...parametric) / Math.min(...parametric)).toBeGreaterThan(2)

    const points = path.getPoints(40)
    expect(points.length).toBe(41)
    const steps = points.slice(1).map((p, i) => dist(points[i], p))
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.01)
  })

  it('gives unit tangents along the direction of travel', () => {
    const path = new Path()
      .moveTo([0, 0, 0])
      .bezierCurveTo([0, 1, 0], [1, 1, 1], [2, 0, 0])
    const e = 1e-4
    for (const u of [0.1, 0.3, 0.5, 0.9]) {
      const tangent = path.getTangentAt(u)
      expect(tangent.length).toBeCloseTo(1, 6)
      const a = path.getPointAt(u - e)
      const b = path.getPointAt(u + e)
      const d = dist(a, b)
      expectClose(
        tangent,
        [(b.x - a.x) / d, (b.y - a.y) / d, (b.z - a.z) / d],
        3
      )
    }
  })

  it('finds a tangent where the derivative vanishes', () => {
    // The first control point sits on the start, so the derivative is zero there
    const path = new Path()
      .moveTo([0, 0, 0])
      .bezierCurveTo([0, 0, 0], [1, 0, 0], [1, 1, 0])
    const tangent = path.getTangentAt(0)
    expect(tangent.length).toBeCloseTo(1, 6)
    expect(tangent.x).toBeGreaterThan(0.9)
  })

  it('writes into out when given one', () => {
    const path = new Path().moveTo([0, 0, 0]).lineTo([2, 0, 0])
    const out = new Vec3()
    expect(path.getPointAt(0.5, out)).toBe(out)
    expect(path.getTangentAt(0.5, out)).toBe(out)
  })
})

describe('Path tilt', () => {
  it('interpolates tilt linearly along each segment', () => {
    const path = new Path()
      .moveTo([0, 0, 0], 0)
      .lineTo([1, 0, 0], 1)
      .lineTo([2, 0, 0], 3)
    expect(path.getTiltAt(0)).toBeCloseTo(0)
    expect(path.getTiltAt(0.25)).toBeCloseTo(0.5)
    expect(path.getTiltAt(0.5)).toBeCloseTo(1)
    expect(path.getTiltAt(0.75)).toBeCloseTo(2)
    expect(path.getTiltAt(1)).toBeCloseTo(3)
  })

  it('turns the frames by the tilt, and by the tilt function', () => {
    const flat = new Path().moveTo([0, 0, 0]).lineTo([1, 0, 0])
    const tilted = new Path()
      .moveTo([0, 0, 0], Math.PI / 2)
      .lineTo([1, 0, 0], Math.PI / 2)
    const a = flat.computeFrames(4)
    const b = tilted.computeFrames(4)
    // A quarter turn about the tangent takes the normal to the binormal
    expectClose(b.normals[2], xyz(a.binormals[2]))

    flat.tiltFunction = (tilt, u) => tilt + u * Math.PI
    const c = flat.computeFrames(4)
    expectClose(c.normals[0], xyz(a.normals[0]))
    expectClose(c.normals[4], xyz(a.normals[4]).map((v) => -v) as XYZ)
  })
})

describe('Path frames', () => {
  it('gives an orthonormal frame at every sample', () => {
    const { tangents, normals, binormals } = helix().computeFrames(64)
    expect(tangents.length).toBe(65)
    for (let i = 0; i <= 64; i++) {
      const t = tangents[i]
      const n = normals[i]
      const b = binormals[i]
      expect(t.length).toBeCloseTo(1, 5)
      expect(n.length).toBeCloseTo(1, 5)
      expect(b.length).toBeCloseTo(1, 5)
      expect(dot(t, n)).toBeCloseTo(0, 5)
      expect(dot(t, b)).toBeCloseTo(0, 5)
      expect(dot(n, b)).toBeCloseTo(0, 5)
      // Right-handed: b = t × n
      expectClose(
        b,
        [t.y * n.z - t.z * n.y, t.z * n.x - t.x * n.z, t.x * n.y - t.y * n.x],
        5
      )
    }
  })

  it('turns the normals smoothly, without flips', () => {
    const { normals } = helix().computeFrames(64)
    for (let i = 1; i < normals.length; i++) {
      expect(dot(normals[i - 1], normals[i])).toBeGreaterThan(0.9)
    }
  })

  it('matches the first and last frames of a closed path', () => {
    // A trefoil knot: carried around one lap, the normal comes back turned
    // well away from where it started
    const path = new Path()
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2
      const p: XYZ = [
        Math.sin(a) + 2 * Math.sin(2 * a),
        Math.cos(a) - 2 * Math.cos(2 * a),
        -Math.sin(3 * a)
      ]
      if (i === 0) path.moveTo(p)
      else path.lineTo(p)
    }
    path.close()

    const open = path.computeFrames(128, false).normals
    expect(dot(open[0], open[128])).toBeLessThan(0)

    const { normals, binormals } = path.computeFrames(128)
    expectClose(normals[128], xyz(normals[0]), 5)
    expectClose(binormals[128], xyz(binormals[0]), 5)
    // Spreading the leftover twist keeps it as smooth as the open frames
    for (let i = 1; i < normals.length; i++) {
      expect(dot(normals[i - 1], normals[i])).toBeGreaterThan(0.95)
    }
  })
})
