import { beforeEach, describe, expect, it } from 'vitest'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Cylinder } from '../src/geometry/Cylinder'
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
