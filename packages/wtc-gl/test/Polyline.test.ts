import { beforeEach, describe, expect, it } from 'vitest'
import { Vec3 } from 'wtc-math'

import { Polyline } from '../src/line/Polyline'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Texture } from '../src/core/Texture'
import { Uniform } from '../src/core/Uniform'
import type { Camera } from '../src/core/Camera'
import { Path } from '../src/path/Path'
import { Curve } from '../src/path/Curve'
import { rotationMinimisingFrames } from '../src/path/frames'
import { createMockRenderer, type MockGL } from './mockGL'

type Vec = [number, number, number]

const data = (line: Polyline, name: string) =>
  line.geometry.attributes[name].data as Float32Array

const vec = (line: Polyline, name: string, i: number): Vec => {
  const d = data(line, name)
  return [d[i * 3], d[i * 3 + 1], d[i * 3 + 2]]
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Vec) => Math.sqrt(dot(a, a))

const circle = (radius: number, count: number): Vec[] =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    return [Math.cos(a) * radius, Math.sin(a) * radius, 0]
  })

const spiral = (count: number): Vec[] =>
  Array.from({ length: count }, (_, i) => {
    const a = i * 0.3
    const r = 0.5 + i * 0.05
    return [Math.cos(a) * r, Math.sin(a) * r, 0]
  })

describe('Polyline', () => {
  let gl: MockGL

  beforeEach(() => {
    gl = createMockRenderer().gl
  })

  describe('buffers', () => {
    const points: Vec[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 2, 0]
    ]

    it('doubles each point, one vertex either side', () => {
      const line = new Polyline(gl, { points })
      expect(data(line, 'position').length).toBe(6 * 3)
      expect(Array.from(data(line, 'side'))).toEqual([1, -1, 1, -1, 1, -1])
      expect(vec(line, 'position', 2)).toEqual([1, 0, 0])
      expect(vec(line, 'position', 3)).toEqual([1, 0, 0])
    })

    it('gives the ends their own point as prev and next', () => {
      const line = new Polyline(gl, { points })
      expect(vec(line, 'prev', 0)).toEqual([0, 0, 0])
      expect(vec(line, 'next', 0)).toEqual([1, 0, 0])
      expect(vec(line, 'prev', 4)).toEqual([1, 0, 0])
      expect(vec(line, 'next', 4)).toEqual([1, 2, 0])
    })

    it('measures the distance travelled, and u from 0 to 1', () => {
      const line = new Polyline(gl, { points })
      expect(Array.from(data(line, 'lineDistance'))).toEqual([0, 0, 1, 1, 3, 3])
      const u = Array.from(data(line, 'lineU'))
      expect(u[0]).toBe(0)
      expect(u[2]).toBeCloseTo(1 / 3)
      expect(u[5]).toBe(1)
    })

    it('indexes two triangles per segment', () => {
      const line = new Polyline(gl, { points })
      const index = line.geometry.attributes.index.data
      expect(index).toBeInstanceOf(Uint16Array)
      expect(Array.from(index)).toEqual([0, 2, 1, 2, 3, 1, 2, 4, 3, 4, 5, 3])
    })

    it('switches to a 32-bit index over 65536 vertices', () => {
      const many = Array.from({ length: 40000 }, (_, i): Vec => [i, 0, 0])
      const line = new Polyline(gl, { points: many })
      expect(line.geometry.attributes.index.data).toBeInstanceOf(Uint32Array)
    })

    it('wraps a closed loop back to its start', () => {
      const square: Vec[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0]
      ]
      const line = new Polyline(gl, { points: square, closed: true })
      // The first point is repeated at the end
      expect(data(line, 'position').length).toBe(10 * 3)
      expect(vec(line, 'position', 8)).toEqual([0, 0, 0])
      expect(vec(line, 'prev', 0)).toEqual([0, 1, 0])
      expect(vec(line, 'next', 8)).toEqual([1, 0, 0])
      expect(data(line, 'lineDistance')[8]).toBe(4)
    })

    it('drops a repeated start on a closed loop', () => {
      const line = new Polyline(gl, {
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 0, 0]
        ],
        closed: true
      })
      expect(line.count).toBe(3)
    })

    it('needs at least 2 points', () => {
      expect(() => new Polyline(gl, { points: [[0, 0, 0]] })).toThrow(
        /at least 2 points/
      )
    })
  })

  describe('width', () => {
    it('samples a taper by distance, under a width uniform', () => {
      const line = new Polyline(gl, {
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [4, 0, 0]
        ],
        width: 8,
        taper: (u) => 1 - u
      })
      const width = Array.from(data(line, 'width'))
      expect(width[0]).toBe(1)
      expect(width[2]).toBeCloseTo(0.75)
      expect(width[4]).toBe(0)
      expect(line.uniforms.u_width.value).toBe(8)

      // Changing the width keeps the taper
      line.width = 4
      expect(line.uniforms.u_width.value).toBe(4)
      expect(data(line, 'width')[2]).toBeCloseTo(0.75)

      line.taper = null
      expect(Array.from(data(line, 'width'))).toEqual([1, 1, 1, 1, 1, 1])
    })

    it('keeps a number width in a uniform', () => {
      const line = new Polyline(gl, {
        points: [
          [0, 0, 0],
          [1, 0, 0]
        ],
        width: 6
      })
      expect(Array.from(data(line, 'width'))).toEqual([1, 1, 1, 1])
      line.width = 3
      expect(line.uniforms.u_width.value).toBe(3)
    })
  })

  describe('paths', () => {
    it('samples a Path with its corners kept', () => {
      const path = new Path()
        .moveTo([0, 0, 0])
        .lineTo([1, 0, 0])
        .lineTo([1, 1, 0])
      const line = new Polyline(gl, { points: path })
      expect(line.count).toBe(3)
      expect(vec(line, 'position', 2)).toEqual([1, 0, 0])
    })

    it('follows a closed Curve by default', () => {
      const curve = new Curve({ points: circle(1, 6), closed: true })
      const line = new Polyline(gl, { points: curve, curveDivisions: 4 })
      expect(line.closed).toBe(true)
      expect(line.count).toBe(24)
    })
  })

  describe('setPoints and push', () => {
    it('reuses the buffers when the count is unchanged', () => {
      const line = new Polyline(gl, { points: spiral(10) })
      const position = data(line, 'position')
      line.setPoints(spiral(10).map(([x, y, z]): Vec => [x, y, z + 1]))
      expect(data(line, 'position')).toBe(position)
      expect(position[2]).toBe(1)
      expect(line.geometry.attributes.position.needsUpdate).toBe(true)
    })

    it('makes new buffers when the count changes', () => {
      const line = new Polyline(gl, { points: spiral(10) })
      const position = data(line, 'position')
      line.setPoints(spiral(12))
      expect(data(line, 'position')).not.toBe(position)
      expect(data(line, 'position').length).toBe(24 * 3)
      expect(line.geometry.attributes.index.data.length).toBe(11 * 6)
    })

    it('pushes a new head and drops the tail', () => {
      const line = new Polyline(gl, {
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0]
        ]
      })
      const position = data(line, 'position')
      line.push([3, 0, 0])
      expect(data(line, 'position')).toBe(position)
      expect(line.count).toBe(3)
      expect(vec(line, 'position', 0)).toEqual([1, 0, 0])
      expect(vec(line, 'position', 4)).toEqual([3, 0, 0])
    })
  })

  describe('custom shaders', () => {
    const points: Vec[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ]

    it('adds extra uniforms and attributes, and keeps them on rebuild', () => {
      const ids = new GeometryAttribute({
        size: 1,
        data: new Float32Array([0, 1, 2, 3]),
        instanced: 1
      })
      const history = new Uniform({ name: 'history', value: 3, kind: 'float' })
      const line = new Polyline(gl, {
        points,
        uniforms: { u_history: history },
        attributes: { instance: ids }
      })
      expect(line.program.uniforms.u_history).toBe(history)
      expect(line.geometry.attributes.instance).toBe(ids)
      expect(line.geometry.instancedCount).toBe(4)

      // Only the line's own attributes are re-uploaded
      ids.needsUpdate = false
      line.setPoints(points)
      expect(ids.needsUpdate).toBe(false)
      line.setPoints([...points, [3, 0, 0]])
      expect(line.geometry.attributes.instance).toBe(ids)
    })

    it('passes the point index to the taper', () => {
      const line = new Polyline(gl, {
        points,
        closed: true,
        taper: (_, i) => i
      })
      // The closing point is point 0 again
      expect(Array.from(data(line, 'width'))).toEqual([0, 0, 1, 1, 2, 2, 0, 0])
    })
  })

  describe('map and blending', () => {
    const points: Vec[] = [
      [0, 0, 0],
      [1, 0, 0]
    ]

    it('binds a white pixel until there is a map', () => {
      const line = new Polyline(gl, { points })
      expect(line.map).toBeNull()
      expect(line.uniforms.u_map.value).toBeInstanceOf(Texture)
      expect(line.uniforms.u_useMap.value).toBe(0)

      const map = new Texture(gl)
      line.map = map
      expect(line.map).toBe(map)
      expect(line.uniforms.u_useMap.value).toBe(1)
      line.map = null
      expect(line.uniforms.u_useMap.value).toBe(0)
    })

    it('repeats along the line, or along and across', () => {
      const line = new Polyline(gl, { points, repeat: 4 })
      expect(line.repeat).toEqual([4, 1])
      line.repeat = [2, 3]
      expect(line.repeat).toEqual([2, 3])
    })

    it('turns transparency on for a map or opacity', () => {
      expect(new Polyline(gl, { points }).program.transparent).toBe(false)
      expect(
        new Polyline(gl, { points, opacity: 0.5 }).program.transparent
      ).toBe(true)
      expect(
        new Polyline(gl, { points, map: new Texture(gl) }).program.transparent
      ).toBe(true)
    })

    it('premultiplies when the renderer does', () => {
      const premultiplied = createMockRenderer().gl
      premultiplied.renderer.premultipliedAlpha = true
      expect(
        new Polyline(premultiplied, { points }).uniforms.u_premultiplied.value
      ).toBe(1)
      expect(new Polyline(gl, { points }).uniforms.u_premultiplied.value).toBe(
        0
      )
    })
  })

  describe('resolution and clip space', () => {
    const points: Vec[] = [
      [0, 0, 0],
      [1, 0, 0]
    ]

    it('measures the viewport in CSS pixels', () => {
      const line = new Polyline(gl, { points })
      gl.renderer.dpr = 2
      gl.renderer.state.viewport.width = 800
      gl.renderer.state.viewport.height = 600
      line.beforeRenderCallbacks.forEach((f) =>
        f({ mesh: line, camera: undefined as unknown as Camera })
      )
      expect(line.uniforms.u_resolution.value).toEqual([400, 300])
    })

    it('draws in clip space without a camera', () => {
      const line = new Polyline(gl, { points })
      line.uniforms.u_projectionMatrix.value = new Float32Array(16).fill(2)
      line.beforeRenderCallbacks.forEach((f) =>
        f({ mesh: line, camera: undefined as unknown as Camera })
      )
      expect(
        Array.from(line.uniforms.u_projectionMatrix.value as Float32Array)
      ).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    })
  })

  describe('billboard', () => {
    it('has no ribbon attributes', () => {
      const line = new Polyline(gl, { points: spiral(5) })
      expect(line.billboard).toBe(true)
      expect(line.geometry.attributes.across).toBeUndefined()
      expect(line.program.uniforms.u_resolution).toBeDefined()
    })

    it('only pads its bounds when the width is in world units', () => {
      const points: Vec[] = [
        [-1, 0, 0],
        [1, 0, 0]
      ]
      const pixels = new Polyline(gl, { points, width: 10 })
      expect(pixels.geometry.bounds?.radius).toBeCloseTo(1)
      const world = new Polyline(gl, {
        points,
        width: 0.5,
        sizeAttenuation: true,
        miterLimit: 1
      })
      expect(world.geometry.bounds?.radius).toBeCloseTo(1.25)
    })
  })

  describe('ribbon', () => {
    it('lies flat in the plane of its points', () => {
      const line = new Polyline(gl, { points: spiral(30), billboard: false })
      for (let i = 0; i < 60; i++) {
        expect(Math.abs(vec(line, 'normal', i)[2])).toBeCloseTo(1, 6)
        expect(vec(line, 'across', i)[2]).toBeCloseTo(0, 6)
      }
    })

    it('starts out facing `facing`', () => {
      const line = new Polyline(gl, {
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0]
        ],
        billboard: false,
        facing: [0, 1, 1]
      })
      const n = vec(line, 'normal', 0)
      expect(n[0]).toBeCloseTo(0)
      expect(n[1]).toBeCloseTo(Math.SQRT1_2)
      expect(n[2]).toBeCloseTo(Math.SQRT1_2)
    })

    it('rolls by its tilt', () => {
      const points: Vec[] = [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0]
      ]
      const line = new Polyline(gl, {
        points,
        billboard: false,
        facing: [0, 0, 1],
        tilt: Math.PI / 2
      })
      const n = vec(line, 'normal', 2)
      expect(Math.abs(n[1])).toBeCloseTo(1)
      expect(n[2]).toBeCloseTo(0)

      // A function of u: a half twist along the line
      line.tilt = (u) => u * Math.PI
      expect(vec(line, 'normal', 0)[2]).toBeCloseTo(1)
      expect(vec(line, 'normal', 4)[2]).toBeCloseTo(-1)
    })

    it('banks into turns by the curvature', () => {
      const radius = 2
      const bank = 0.5
      const line = new Polyline(gl, {
        points: circle(radius, 64),
        closed: true,
        billboard: false,
        facing: [0, 0, 1],
        bank
      })
      for (let i = 0; i < 64; i += 7) {
        const p = vec(line, 'position', i * 2)
        const n = vec(line, 'normal', i * 2)
        // Leaning in by atan(bank / radius), towards the centre
        expect(Math.acos(n[2])).toBeCloseTo(Math.atan(bank / radius), 4)
        expect(dot(n, p)).toBeLessThan(0)
      }
    })

    it('lengthens the width at corners, up to the mitre limit', () => {
      const corner: Vec[] = [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0]
      ]
      const line = new Polyline(gl, { points: corner, billboard: false })
      expect(length(vec(line, 'across', 0))).toBeCloseTo(1)
      expect(length(vec(line, 'across', 2))).toBeCloseTo(Math.SQRT2)

      const spike: Vec[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0.01, 0]
      ]
      const sharp = new Polyline(gl, {
        points: spike,
        billboard: false,
        miterLimit: 3
      })
      expect(length(vec(sharp, 'across', 2))).toBeCloseTo(3)
    })

    it('pads its bounds by the width', () => {
      const line = new Polyline(gl, {
        points: [
          [-1, 0, 0],
          [1, 0, 0]
        ],
        billboard: false,
        width: 0.4,
        miterLimit: 1
      })
      expect(line.geometry.bounds?.radius).toBeCloseTo(1.2)
    })
  })
})

describe('rotationMinimisingFrames', () => {
  it('starts from the given normal, made perpendicular', () => {
    const { normals, binormals } = rotationMinimisingFrames(
      [new Vec3(1, 0, 0), new Vec3(1, 0, 0)],
      { normal: new Vec3(1, 1, 0) }
    )
    expect([normals[0].x, normals[0].y, normals[0].z]).toEqual([0, 1, 0])
    expect(binormals[1].z).toBeCloseTo(1)
  })

  it('keeps a planar curve normal to its plane', () => {
    const tangents = Array.from({ length: 20 }, (_, i) => {
      const a = i * 0.2
      return new Vec3(-Math.sin(a), Math.cos(a), 0)
    })
    const { normals } = rotationMinimisingFrames(tangents, {
      normal: new Vec3(0, 0, 1)
    })
    for (const n of normals) expect(n.z).toBeCloseTo(1)
  })
})
