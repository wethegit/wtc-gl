import { beforeEach, describe, expect, it } from 'vitest'
import { Vec2 } from 'wtc-math'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Cylinder } from '../src/geometry/Cylinder'
import { Torus } from '../src/geometry/Torus'
import { Lathe } from '../src/geometry/Lathe'
import { Capsule } from '../src/geometry/Capsule'
import { Tube } from '../src/geometry/Tube'
import { Path } from '../src/path/Path'
import { Curve } from '../src/path/Curve'
import { createMockRenderer, type MockGL } from './mockGL'

type Vec = [number, number, number]

const data = (geometry: Geometry, name: string) =>
  geometry.attributes[name].data as Float32Array

const vertexCount = (geometry: Geometry) =>
  data(geometry, 'position').length / 3

const vertex = (geometry: Geometry, name: string, i: number): Vec => {
  const d = data(geometry, name)
  return [d[i * 3], d[i * 3 + 1], d[i * 3 + 2]]
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const length = (a: Vec) => Math.sqrt(dot(a, a))

const triangles = (geometry: Geometry) => {
  const index = geometry.attributes.index.data as Uint16Array | Uint32Array
  const out: [number, number, number][] = []
  for (let i = 0; i < index.length; i += 3) {
    out.push([index[i], index[i + 1], index[i + 2]])
  }
  return out
}

// Checks every primitive should pass: attribute sizes agree, the index stays
// in range, normals are unit length, and each triangle winds counter-clockwise
// as seen from the side its normals face, so back-face culling keeps it.
// Degenerate triangles (e.g. at a pole) have no winding and are skipped.
const expectWellFormed = (geometry: Geometry) => {
  const count = vertexCount(geometry)
  expect(data(geometry, 'normal').length).toBe(count * 3)
  expect(data(geometry, 'uv').length).toBe(count * 2)

  const index = geometry.attributes.index.data as Uint16Array | Uint32Array
  expect(index.length % 3).toBe(0)
  expect(Math.max(...index)).toBeLessThan(count)

  for (let i = 0; i < count; i++) {
    expect(length(vertex(geometry, 'normal', i))).toBeCloseTo(1, 5)
  }

  let wound = 0
  for (const [a, b, c] of triangles(geometry)) {
    const pa = vertex(geometry, 'position', a)
    const face = cross(
      sub(vertex(geometry, 'position', b), pa),
      sub(vertex(geometry, 'position', c), pa)
    )
    if (length(face) < 1e-9) continue
    const na = vertex(geometry, 'normal', a)
    const nb = vertex(geometry, 'normal', b)
    const nc = vertex(geometry, 'normal', c)
    const n: Vec = [
      na[0] + nb[0] + nc[0],
      na[1] + nb[1] + nc[1],
      na[2] + nb[2] + nc[2]
    ]
    expect(dot(face, n)).toBeGreaterThan(0)
    wound++
  }
  expect(wound).toBeGreaterThan(0)
}

const size = (geometry: Geometry): Vec => {
  const { scale } = geometry.computeBoundingBox()!
  return [scale.x, scale.y, scale.z]
}

describe('Cylinder', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('has a torso grid plus two capped ends', () => {
    const cylinder = new Cylinder(gl, { radialSegments: 6, heightSegments: 3 })

    // Torso: 7 × 4 grid. Each cap: 6 centre vertices and a ring of 7.
    expect(vertexCount(cylinder)).toBe(7 * 4 + 2 * (6 + 7))
    expect(cylinder.attributes.index.data!.length).toBe(6 * 3 * 6 + 2 * 6 * 3)
    expect(cylinder.attributes.index.data).toBeInstanceOf(Uint16Array)
  })

  it('is well formed, open or closed, cylinder or cone', () => {
    expectWellFormed(new Cylinder(gl))
    expectWellFormed(new Cylinder(gl, { openEnded: true }))
    expectWellFormed(new Cylinder(gl, { radiusTop: 0, heightSegments: 4 }))
    expectWellFormed(new Cylinder(gl, { radiusBottom: 0.2, radiusTop: 0.8 }))
    expectWellFormed(new Cylinder(gl, { thetaLength: Math.PI }))
  })

  it('is centred, with the given radius and height', () => {
    const cylinder = new Cylinder(gl, {
      radiusTop: 1,
      radiusBottom: 1,
      height: 3,
      radialSegments: 32
    })
    const [x, y, z] = size(cylinder)
    expect(y).toBeCloseTo(3)
    expect(x).toBeCloseTo(2)
    expect(z).toBeCloseTo(2)
    const { center } = cylinder.bounds!
    expect(center.y).toBeCloseTo(0)
  })

  it('points the side normals outwards and the caps along y', () => {
    const cylinder = new Cylinder(gl, { radialSegments: 8, heightSegments: 2 })
    const torso = 9 * 3
    for (let i = 0; i < torso; i++) {
      const [x, , z] = vertex(cylinder, 'position', i)
      expect(dot(vertex(cylinder, 'normal', i), [x, 0, z])).toBeGreaterThan(0)
    }
    for (let i = torso; i < vertexCount(cylinder); i++) {
      const [, y] = vertex(cylinder, 'position', i)
      const [nx, ny, nz] = vertex(cylinder, 'normal', i)
      expect([Math.abs(nx), Math.abs(nz)]).toEqual([0, 0])
      expect(ny).toBe(Math.sign(y))
    }
  })

  it('tilts a cone’s side normals up', () => {
    const cone = new Cylinder(gl, { radiusTop: 0, radiusBottom: 1, height: 1 })
    // The slope is 45°, so every side normal is (r̂ + ŷ) / √2
    const [nx, ny, nz] = vertex(cone, 'normal', 0)
    expect(ny).toBeCloseTo(Math.SQRT1_2)
    expect(Math.hypot(nx, nz)).toBeCloseTo(Math.SQRT1_2)
  })

  it('leaves out a cap with zero radius, and both when open-ended', () => {
    const cone = new Cylinder(gl, { radiusTop: 0, radialSegments: 6 })
    expect(vertexCount(cone)).toBe(7 * 2 + (6 + 7))
    expect(cone.attributes.index.data!.length).toBe(6 * 6 + 6 * 3)

    const tube = new Cylinder(gl, { openEnded: true, radialSegments: 6 })
    expect(vertexCount(tube)).toBe(7 * 2)
    expect(tube.attributes.index.data!.length).toBe(6 * 6)
  })

  it('sweeps from thetaStart through thetaLength', () => {
    const cylinder = new Cylinder(gl, {
      radiusTop: 1,
      radiusBottom: 1,
      radialSegments: 4,
      thetaStart: 0,
      thetaLength: Math.PI / 2
    })
    // θ = 0 is +z, θ = π/2 is +x
    const [x0, , z0] = vertex(cylinder, 'position', 0)
    const [x1, , z1] = vertex(cylinder, 'position', 4)
    expect([x0, z0].map((v) => +v.toFixed(6))).toEqual([0, 1])
    expect([x1, z1].map((v) => +v.toFixed(6))).toEqual([1, 0])
  })

  it('maps uvs around (u) and up (v) the side', () => {
    const cylinder = new Cylinder(gl, { radialSegments: 4, heightSegments: 1 })
    const uv = data(cylinder, 'uv')
    // First row is the top, so v = 1 there
    expect([uv[0], uv[1]]).toEqual([0, 1])
    expect([uv[8], uv[9]]).toEqual([1, 1])
    expect([uv[10], uv[11]]).toEqual([0, 0])
  })

  it('switches to a 32-bit index past 65,536 vertices', () => {
    const cylinder = new Cylinder(gl, {
      radialSegments: 256,
      heightSegments: 256,
      openEnded: true
    })
    expect(cylinder.attributes.index.data).toBeInstanceOf(Uint32Array)
  })

  it('keeps extra attributes passed in', () => {
    const extra = new GeometryAttribute({ size: 1, data: new Float32Array(1) })
    const cylinder = new Cylinder(gl, { attributes: { extra } })
    expect(cylinder.attributes.extra).toBe(extra)
  })
})

describe('Torus', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('is a grid around the ring and around the tube', () => {
    const torus = new Torus(gl, { radialSegments: 5, tubularSegments: 12 })
    expect(vertexCount(torus)).toBe(6 * 13)
    expect(torus.attributes.index.data!.length).toBe(5 * 12 * 6)
    expect(torus.attributes.index.data).toBeInstanceOf(Uint16Array)
  })

  it('is well formed, whole or partial', () => {
    expectWellFormed(new Torus(gl))
    expectWellFormed(new Torus(gl, { arc: Math.PI }))
    expectWellFormed(new Torus(gl, { radius: 1, tube: 0.05 }))
  })

  it('lies in the xy plane with the given radius and tube', () => {
    const torus = new Torus(gl, {
      radius: 1,
      tube: 0.25,
      radialSegments: 16,
      tubularSegments: 64
    })
    const [x, y, z] = size(torus)
    expect(x).toBeCloseTo(2.5)
    expect(y).toBeCloseTo(2.5, 2)
    expect(z).toBeCloseTo(0.5)
  })

  it('points normals away from the ring at the middle of the tube', () => {
    const torus = new Torus(gl, { radius: 1, tube: 0.25 })
    for (let i = 0; i < vertexCount(torus); i++) {
      const p = vertex(torus, 'position', i)
      const angle = Math.atan2(p[1], p[0])
      const offset = sub(p, [Math.cos(angle), Math.sin(angle), 0])
      expect(length(offset)).toBeCloseTo(0.25, 5)
      const n = vertex(torus, 'normal', i)
      offset.forEach((v, k) => expect(n[k]).toBeCloseTo(v / 0.25, 5))
    }
  })

  it('sweeps the ring through arc, starting on +x', () => {
    const torus = new Torus(gl, {
      radius: 1,
      tube: 0.25,
      tubularSegments: 4,
      arc: Math.PI / 2
    })
    // The first row is the outer edge of the tube
    const start = vertex(torus, 'position', 0)
    const end = vertex(torus, 'position', 4)
    expect(start.map((v) => +v.toFixed(6))).toEqual([1.25, 0, 0])
    expect(end.map((v) => +v.toFixed(6))).toEqual([0, 1.25, 0])
  })

  it('maps u around the ring and v around the tube', () => {
    const torus = new Torus(gl, { radialSegments: 2, tubularSegments: 4 })
    const uv = data(torus, 'uv')
    expect([uv[0], uv[1]]).toEqual([0, 0])
    expect([uv[8], uv[9]]).toEqual([1, 0])
    expect([uv[uv.length - 2], uv[uv.length - 1]]).toEqual([1, 1])
  })

  it('switches to a 32-bit index past 65,536 vertices', () => {
    const torus = new Torus(gl, { radialSegments: 256, tubularSegments: 256 })
    expect(torus.attributes.index.data).toBeInstanceOf(Uint32Array)
  })

  it('keeps extra attributes passed in', () => {
    const extra = new GeometryAttribute({ size: 1, data: new Float32Array(1) })
    const torus = new Torus(gl, { attributes: { extra } })
    expect(torus.attributes.extra).toBe(extra)
  })
})

describe('Lathe', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  const vase: [number, number][] = [
    [0, 0],
    [0.4, 0],
    [0.5, 0.3],
    [0.25, 0.8],
    [0.35, 1]
  ]

  it('has a column of profile points per segment, plus the seam', () => {
    const lathe = new Lathe(gl, { points: vase, segments: 6 })
    expect(vertexCount(lathe)).toBe(7 * 5)
    expect(lathe.attributes.index.data!.length).toBe(6 * 4 * 6)
    expect(lathe.attributes.index.data).toBeInstanceOf(Uint16Array)
  })

  it('is well formed, up or down, whole or partial', () => {
    expectWellFormed(new Lathe(gl, { points: vase }))
    expectWellFormed(new Lathe(gl, { points: [...vase].reverse() }))
    expectWellFormed(new Lathe(gl, { points: vase, phiLength: Math.PI }))
    // Closed at both ends on the axis, like a sphere
    const arc = Array.from({ length: 9 }, (_, i): [number, number] => {
      const a = -Math.PI / 2 + (i / 8) * Math.PI
      return [Math.cos(a), Math.sin(a)]
    })
    expectWellFormed(new Lathe(gl, { points: arc, segments: 16 }))
  })

  it('takes Vec2s as well as [r, y] pairs', () => {
    const fromPairs = new Lathe(gl, { points: vase })
    const fromVec2 = new Lathe(gl, {
      points: vase.map(([r, y]) => new Vec2(r, y))
    })
    expect(data(fromVec2, 'position')).toEqual(data(fromPairs, 'position'))
    expect(data(fromVec2, 'normal')).toEqual(data(fromPairs, 'normal'))
  })

  it('needs at least two points', () => {
    expect(() => new Lathe(gl, { points: [[1, 0]] })).toThrow(/two points/)
    expect(() => new Lathe(gl)).toThrow(/two points/)
  })

  it('spins a vertical profile into a cylinder', () => {
    const lathe = new Lathe(gl, {
      points: [
        [1, -1],
        [1, 1]
      ],
      segments: 8
    })
    for (let i = 0; i < vertexCount(lathe); i++) {
      const [x, , z] = vertex(lathe, 'position', i)
      expect(Math.hypot(x, z)).toBeCloseTo(1)
      const n = vertex(lathe, 'normal', i)
      ;[x, 0, z].forEach((v, k) => expect(n[k]).toBeCloseTo(v))
    }
    const [sx, sy, sz] = size(lathe)
    expect([sx, sy, sz].map((v) => +v.toFixed(6))).toEqual([2, 2, 2])
  })

  it('sweeps from phiStart through phiLength, starting on +z', () => {
    const lathe = new Lathe(gl, {
      points: [
        [1, 0],
        [1, 1]
      ],
      segments: 4,
      phiLength: Math.PI / 2
    })
    const start = vertex(lathe, 'position', 0)
    const end = vertex(lathe, 'position', 4 * 2)
    expect(start.map((v) => +v.toFixed(6))).toEqual([0, 0, 1])
    expect(end.map((v) => +v.toFixed(6))).toEqual([1, 0, 0])
  })

  it('spaces v by distance along the profile', () => {
    const lathe = new Lathe(gl, {
      points: [
        [1, 0],
        [1, 1],
        [1, 3]
      ],
      segments: 2
    })
    const uv = data(lathe, 'uv')
    expect([uv[1], uv[3], uv[5]].map((v) => +v.toFixed(6))).toEqual([
      0,
      +(1 / 3).toFixed(6),
      1
    ])
    // u runs around: the last column is the seam at u = 1
    expect([uv[0], uv[uv.length - 2]]).toEqual([0, 1])
  })

  it('averages the normal at a corner in the profile', () => {
    // Up the side, then in across the top
    const lathe = new Lathe(gl, {
      points: [
        [1, 0],
        [1, 1],
        [0, 1]
      ]
    })
    const [nx, ny, nz] = vertex(lathe, 'normal', 1)
    expect(nx).toBeCloseTo(0)
    expect(ny).toBeCloseTo(Math.SQRT1_2)
    expect(nz).toBeCloseTo(Math.SQRT1_2)
  })

  it('builds raw arrays, with optional profile normals', () => {
    const built = Lathe.build(
      [
        [1, 0],
        [1, 1]
      ],
      4,
      0,
      Math.PI * 2,
      [
        [0, -1],
        [0, 1]
      ]
    )
    expect(built.position.length).toBe(5 * 2 * 3)
    expect(built.uv.length).toBe(5 * 2 * 2)
    expect(built.index.length).toBe(4 * 6)
    expect(Array.from(built.normal.slice(0, 6))).toEqual([0, -1, 0, 0, 1, 0])
  })

  it('switches to a 32-bit index past 65,536 vertices', () => {
    const points = Array.from({ length: 300 }, (_, i): [number, number] => [
      1,
      i
    ])
    const lathe = new Lathe(gl, { points, segments: 256 })
    expect(lathe.attributes.index.data).toBeInstanceOf(Uint32Array)
  })

  it('keeps extra attributes passed in', () => {
    const extra = new GeometryAttribute({ size: 1, data: new Float32Array(1) })
    const lathe = new Lathe(gl, { points: vase, attributes: { extra } })
    expect(lathe.attributes.extra).toBe(extra)
  })
})

describe('Capsule', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  // Distance from p to the nearest point on the capsule's core, the segment
  // of the y axis between the two cap centres
  const fromCore = (p: Vec, middle: number): Vec => {
    const y = Math.max(-middle / 2, Math.min(middle / 2, p[1]))
    return sub(p, [0, y, 0])
  }

  it('has a quarter circle at each end and straight steps between', () => {
    const capsule = new Capsule(gl, {
      capSegments: 4,
      radialSegments: 8,
      heightSegments: 2
    })
    // Profile: 4 + 4 cap steps and 2 straight steps, so 11 points
    expect(vertexCount(capsule)).toBe(9 * 11)
    expect(capsule.attributes.index.data!.length).toBe(8 * 10 * 6)
  })

  it('is well formed', () => {
    expectWellFormed(new Capsule(gl))
    expectWellFormed(new Capsule(gl, { heightSegments: 3, capSegments: 2 }))
    expectWellFormed(new Capsule(gl, { radius: 0.5, height: 0.4 }))
  })

  it('spans exactly height, tip to tip, and twice the radius across', () => {
    const capsule = new Capsule(gl, {
      radius: 0.3,
      height: 2,
      radialSegments: 8
    })
    const [x, y, z] = size(capsule)
    expect(y).toBeCloseTo(2)
    expect(x).toBeCloseTo(0.6)
    expect(z).toBeCloseTo(0.6)
    expect(capsule.bounds!.center.y).toBeCloseTo(0)
  })

  it('keeps every vertex radius from the core, with its normal pointing away', () => {
    const capsule = new Capsule(gl, {
      radius: 0.3,
      height: 2,
      heightSegments: 3
    })
    for (let i = 0; i < vertexCount(capsule); i++) {
      const offset = fromCore(vertex(capsule, 'position', i), 2 - 0.6)
      expect(length(offset)).toBeCloseTo(0.3, 5)
      const n = vertex(capsule, 'normal', i)
      offset.forEach((v, k) => expect(n[k]).toBeCloseTo(v / 0.3, 5))
    }
  })

  it('has poles exactly on the axis', () => {
    const capsule = new Capsule(gl, { radius: 0.25, height: 1, capSegments: 3 })
    const column = 2 * 3 + 1 + 1
    expect(vertex(capsule, 'position', 0)).toEqual([0, -0.5, 0])
    expect(vertex(capsule, 'position', column - 1)).toEqual([0, 0.5, 0])
  })

  it('becomes a sphere when the height is less than twice the radius', () => {
    const capsule = new Capsule(gl, {
      radius: 0.25,
      height: 0.1,
      capSegments: 4,
      heightSegments: 3
    })
    // No straight steps: just the two quarter circles
    expect(vertexCount(capsule)).toBe(9 * 9)
    for (let i = 0; i < vertexCount(capsule); i++) {
      expect(length(vertex(capsule, 'position', i))).toBeCloseTo(0.25, 5)
    }
    expect(size(capsule)[1]).toBeCloseTo(0.5)
  })

  it('switches to a 32-bit index past 65,536 vertices', () => {
    const capsule = new Capsule(gl, {
      radialSegments: 256,
      capSegments: 64,
      heightSegments: 128
    })
    expect(capsule.attributes.index.data).toBeInstanceOf(Uint32Array)
  })

  it('keeps extra attributes passed in', () => {
    const extra = new GeometryAttribute({ size: 1, data: new Float32Array(1) })
    const capsule = new Capsule(gl, { attributes: { extra } })
    expect(capsule.attributes.extra).toBe(extra)
  })
})

describe('Tube', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  const wave = () =>
    new Curve({
      points: [
        [0, 0, 0],
        [1, 1, 0],
        [2, 0, 1],
        [3, 1, 1],
        [4, 0, 0]
      ]
    })

  const trefoil = () =>
    new Curve({
      points: Array.from({ length: 24 }, (_, i): Vec => {
        const a = (i / 24) * Math.PI * 2
        return [
          Math.sin(a) + 2 * Math.sin(2 * a),
          Math.cos(a) - 2 * Math.cos(2 * a),
          -Math.sin(3 * a)
        ]
      }),
      closed: true
    })

  const helix = () => {
    const path = new Path()
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * Math.PI * 4
      const p: Vec = [Math.cos(a), i / 50, Math.sin(a)]
      if (i === 0) path.moveTo(p)
      else path.lineTo(p)
    }
    return path
  }

  it('needs a path', () => {
    expect(() => new Tube(gl)).toThrow(/path/)
  })

  it('is a ring of vertices at each step along the path', () => {
    const tube = new Tube(gl, {
      path: wave(),
      tubularSegments: 20,
      radialSegments: 6
    })
    expect(vertexCount(tube)).toBe(21 * 7)
    expect(tube.attributes.index.data!.length).toBe(20 * 6 * 6)
    expect(tube.attributes.index.data).toBeInstanceOf(Uint16Array)
  })

  it('is well formed along open, closed and twisting paths', () => {
    expectWellFormed(new Tube(gl, { path: wave() }))
    expectWellFormed(new Tube(gl, { path: trefoil(), tubularSegments: 128 }))
    expectWellFormed(new Tube(gl, { path: helix(), radius: 0.2 }))
  })

  it("keeps every vertex radius from its ring's point on the path", () => {
    const path = wave()
    const tube = new Tube(gl, {
      path,
      radius: 0.3,
      tubularSegments: 10,
      radialSegments: 5
    })
    for (let i = 0; i <= 10; i++) {
      const centre = path.getPointAt(i / 10)
      for (let j = 0; j <= 5; j++) {
        const k = i * 6 + j
        const offset = sub(vertex(tube, 'position', k), [
          centre.x,
          centre.y,
          centre.z
        ])
        expect(length(offset)).toBeCloseTo(0.3, 5)
        // With a constant radius the normal points straight out
        const n = vertex(tube, 'normal', k)
        offset.forEach((v, c) => expect(n[c]).toBeCloseTo(v / 0.3, 5))
      }
    }
  })

  it('tapers with a radius function, leaning the normals to suit', () => {
    const path = new Path().moveTo([0, 0, 0]).lineTo([4, 0, 0])
    const tube = new Tube(gl, {
      path,
      radius: (u) => 0.5 - 0.4 * u,
      tubularSegments: 4,
      radialSegments: 4
    })
    expectWellFormed(tube)
    // Ring 0 is at x = 0 with radius 0.5; the last ring has radius 0.1
    const first = vertex(tube, 'position', 0)
    const last = vertex(tube, 'position', 4 * 5)
    expect(Math.hypot(first[1], first[2])).toBeCloseTo(0.5)
    expect(Math.hypot(last[1], last[2])).toBeCloseTo(0.1)
    // The radius shrinks by 0.4 over 4 units, so the surface faces 0.1 forwards
    const [nx, ny, nz] = vertex(tube, 'normal', 2 * 5)
    expect(nx / Math.hypot(ny, nz)).toBeCloseTo(0.1, 5)
  })

  it('joins a closed tube with matching first and last rings', () => {
    const tube = new Tube(gl, {
      path: trefoil(),
      tubularSegments: 64,
      radialSegments: 8
    })
    const ring = 9
    for (let j = 0; j < ring; j++) {
      const a = vertex(tube, 'position', j)
      const b = vertex(tube, 'position', 64 * ring + j)
      a.forEach((v, c) => expect(b[c]).toBeCloseTo(v, 5))
    }
    // The uvs run on to 1 at the join
    const uv = data(tube, 'uv')
    expect(uv[64 * ring * 2]).toBe(1)
  })

  it('maps u along the path and v around the tube', () => {
    const tube = new Tube(gl, {
      path: wave(),
      tubularSegments: 4,
      radialSegments: 2
    })
    const uv = data(tube, 'uv')
    expect([uv[0], uv[1]]).toEqual([0, 0])
    expect([uv[4], uv[5]]).toEqual([0, 1])
    expect([uv[6], uv[7]]).toEqual([0.25, 0])
    expect([uv[uv.length - 2], uv[uv.length - 1]]).toEqual([1, 1])
  })

  it('switches to a 32-bit index past 65,536 vertices', () => {
    const tube = new Tube(gl, {
      path: wave(),
      tubularSegments: 1024,
      radialSegments: 64
    })
    expect(tube.attributes.index.data).toBeInstanceOf(Uint32Array)
  })

  it('keeps extra attributes passed in', () => {
    const extra = new GeometryAttribute({ size: 1, data: new Float32Array(1) })
    const tube = new Tube(gl, { path: wave(), attributes: { extra } })
    expect(tube.attributes.extra).toBe(extra)
  })
})
