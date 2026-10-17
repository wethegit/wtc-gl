import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Mat4, Quat, Vec3 } from 'wtc-math'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Program } from '../src/core/Program'
import { createMockRenderer, type MockGL } from './mockGL'

const quadPositions = [0, 0, 0, 1, 0, 0, 0, 1, 0]

const last = <T>(items: T[]): T => items[items.length - 1]

const position = (data: number[], size = 3) =>
  new GeometryAttribute({
    size,
    data: new Float32Array(data),
    type: 5126 // FLOAT
  })

describe('Geometry bounds', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('computes the bounding box, centre and size', () => {
    const geometry = new Geometry(gl, {
      position: position([-1, -2, -3, 3, 2, 1, 0, 0, 0])
    })
    geometry.computeBoundingBox()

    const { min, max, center, scale } = geometry.bounds!
    expect([min.x, min.y, min.z]).toEqual([-1, -2, -3])
    expect([max.x, max.y, max.z]).toEqual([3, 2, 1])
    expect([center.x, center.y, center.z]).toEqual([1, 0, -1])
    expect([scale.x, scale.y, scale.z]).toEqual([4, 4, 4])
  })

  it('treats 2D positions as z = 0', () => {
    const geometry = new Geometry(gl, {
      position: position([-1, -2, 3, 4, 0, 6], 2)
    })
    geometry.computeBoundingSphere()

    const { min, max, center, radius } = geometry.bounds!
    expect([min.x, min.y, min.z]).toEqual([-1, -2, 0])
    expect([max.x, max.y, max.z]).toEqual([3, 6, 0])
    expect([center.x, center.y, center.z]).toEqual([1, 2, 0])
    // Furthest point is (-1, -2) or (3, 6), both sqrt(20) from the centre
    expect(radius).toBeCloseTo(Math.sqrt(20))
  })

  it('computes the bounding sphere around the box centre', () => {
    const geometry = new Geometry(gl, {
      position: position([2, 0, 0, 4, 0, 0, 3, 0.5, 0, 3, -0.5, 0])
    })
    geometry.computeBoundingSphere()

    // Box centre is (3, 0, 0); the furthest points are 1 away
    const { center, radius } = geometry.bounds!
    expect([center.x, center.y, center.z]).toEqual([3, 0, 0])
    expect(radius).toBeCloseTo(1)
  })

  it('reads interleaved positions using byte stride and offset', () => {
    // Interleaved [u, v, x, y, z] floats: stride 20 bytes, positions 8 bytes in
    const data = [99, 99, 10, 20, 30, 99, 99, -10, -20, -30]
    const attr = new GeometryAttribute({
      size: 3,
      stride: 5 * 4,
      offset: 2 * 4,
      data: new Float32Array(data),
      type: 5126
    })
    const geometry = new Geometry(gl, {})
    geometry.computeBoundingBox(attr)

    const { min, max } = geometry.bounds!
    expect([min.x, min.y, min.z]).toEqual([-10, -20, -30])
    expect([max.x, max.y, max.z]).toEqual([10, 20, 30])

    geometry.computeBoundingSphere(attr)
    expect(geometry.bounds!.radius).toBeCloseTo(Math.hypot(10, 20, 30))
  })

  it('leaves bounds unset when there is no position data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const geometry = new Geometry(gl, {})

    expect(() => geometry.computeBoundingBox()).not.toThrow()
    expect(() => geometry.computeBoundingSphere()).not.toThrow()
    expect(geometry.bounds).toBeUndefined()
    warn.mockRestore()
  })

  it("doesn't measure an external position", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const attr = position([1, 2, 3, 4, 5, 6])
    attr.external = true
    const geometry = new Geometry(gl, { position: attr })

    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    expect(geometry.bounds).toBeUndefined()
    warn.mockRestore()
  })
})

describe('Geometry VAOs', () => {
  it('re-binds an index buffer swapped after the vertex array was built', () => {
    const { gl } = createMockRenderer()
    const first = {}
    const index = new GeometryAttribute({
      size: 1,
      data: new Uint16Array([0, 1, 2]),
      buffer: first as WebGLBuffer,
      external: true
    })
    const geometry = new Geometry(gl, { index })
    const program = new Program(gl, { vertex: '', fragment: '' })
    const indexBinds = () =>
      vi
        .mocked(gl.bindBuffer)
        .mock.calls.filter(([target]) => target === gl.ELEMENT_ARRAY_BUFFER)
        .map(([, buffer]) => buffer)

    geometry.draw({ program, mode: gl.TRIANGLES })
    expect(indexBinds()).toEqual([first])

    vi.mocked(gl.bindBuffer).mockClear()
    geometry.draw({ program, mode: gl.TRIANGLES })
    expect(indexBinds()).toEqual([])

    const second = {} as WebGLBuffer
    index.buffer = second
    geometry.draw({ program, mode: gl.TRIANGLES })
    expect(indexBinds()).toEqual([second])
  })
})

describe('Geometry.setIndex', () => {
  let gl: MockGL
  let program: Program

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
    program = new Program(gl, { vertex: '', fragment: '' })
  })

  const indexBinds = () =>
    vi
      .mocked(gl.bindBuffer)
      .mock.calls.filter(([target]) => target === gl.ELEMENT_ARRAY_BUFFER)
      .map(([, buffer]) => buffer)

  it('wraps a typed array in an attribute and uploads it', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
    })
    const data = new Uint32Array([0, 1, 2, 1, 3, 2])
    geometry.setIndex(data)

    const index = geometry.attributes.index
    expect(index).toBeInstanceOf(GeometryAttribute)
    expect(index.data).toBe(data)
    expect(index.type).toBe(gl.UNSIGNED_INT)
    expect(index.target).toBe(gl.ELEMENT_ARRAY_BUFFER)
    expect(index.buffer).toBeTruthy()
    expect(gl.bufferData).toHaveBeenCalledWith(
      gl.ELEMENT_ARRAY_BUFFER,
      data,
      gl.STATIC_DRAW
    )
    expect(geometry.drawRange).toEqual({ start: 0, count: 6 })
  })

  it('binds the new index on the next draw and keeps the old buffer', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      index: new GeometryAttribute({ data: new Uint16Array([0, 1, 2]) })
    })
    const old = geometry.attributes.index.buffer
    geometry.draw({ program, mode: gl.TRIANGLES })
    geometry.setDrawRange(1, 2)

    vi.mocked(gl.bindBuffer).mockClear()
    geometry.setIndex(new Uint16Array([2, 1, 0]))
    const next = geometry.attributes.index.buffer
    geometry.draw({ program, mode: gl.TRIANGLES })

    expect(next).not.toBe(old)
    expect(last(indexBinds())).toBe(next)
    expect(gl.deleteBuffer).not.toHaveBeenCalledWith(old)
    expect(geometry.drawRange).toEqual({ start: 0, count: 3 })
  })

  it('switches a non-indexed geometry to indexed drawing', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
    })
    geometry.draw({ program, mode: gl.TRIANGLES })
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 4)

    geometry.setIndex(new Uint16Array([0, 1, 2, 1, 3, 2]))
    geometry.draw({ program, mode: gl.TRIANGLES })

    expect(last(indexBinds())).toBe(geometry.attributes.index.buffer)
    expect(gl.drawElements).toHaveBeenCalledWith(
      gl.TRIANGLES,
      6,
      5123, // UNSIGNED_SHORT
      0
    )
  })

  it("uploads with no vertex array bound, so it can't overwrite another geometry's index", () => {
    const other = new Geometry(gl, {
      position: position([0, 0, 0, 1, 0, 0, 0, 1, 0])
    })
    other.draw({ program, mode: gl.TRIANGLES })
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 1, 0, 0, 0, 1, 0])
    })
    other.draw({ program, mode: gl.TRIANGLES })

    vi.mocked(gl.bindVertexArray).mockClear()
    vi.mocked(gl.bufferData).mockClear()
    geometry.setIndex(new Uint16Array([0, 1, 2]))

    const binds = vi.mocked(gl.bindVertexArray).mock
    const lastBind = last(binds.invocationCallOrder)
    expect(last(binds.calls)).toEqual([null])
    expect(lastBind).toBeLessThan(
      vi.mocked(gl.bufferData).mock.invocationCallOrder[0]
    )
  })
})

describe('Geometry.computeVertexNormals', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  const normals = (geometry: Geometry) =>
    Array.from(geometry.attributes.normal.data)

  // Two counter-clockwise triangles making a unit quad at z = 0
  const quad = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]

  it('gives each face of non-indexed geometry its own normal', () => {
    const geometry = new Geometry(gl, { position: position(quad) })
    geometry.computeVertexNormals()
    expect(normals(geometry)).toEqual(Array(6).fill([0, 0, 1]).flat())

    // Swap the last two vertices of each triangle to reverse the winding
    const reversed = [0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0]
    const back = new Geometry(gl, { position: position(reversed) })
    back.computeVertexNormals()
    expect(normals(back)).toEqual(Array(6).fill([0, 0, -1]).flat())
  })

  it('area-weights the normals of shared vertices', () => {
    // Folded along the y axis: a triangle of area 2 facing +z and one of
    // area 1 facing -x share vertices 0 and 1
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, -1]),
      index: new GeometryAttribute({
        data: new Uint16Array([0, 2, 1, 0, 1, 3])
      })
    })
    geometry.computeVertexNormals()

    const n = normals(geometry)
    const shared = [-1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)]
    for (let i = 0; i < 3; i++) {
      expect(n[i]).toBeCloseTo(shared[i])
      expect(n[3 + i]).toBeCloseTo(shared[i])
    }
    expect(n.slice(6, 9)).toEqual([0, 0, 1])
    expect(n.slice(9, 12)).toEqual([-1, 0, 0])
  })

  it('writes into an existing normal attribute', () => {
    const normal = new GeometryAttribute({
      size: 3,
      data: new Float32Array(18).fill(7)
    })
    const geometry = new Geometry(gl, { position: position(quad), normal })
    vi.mocked(gl.createBuffer).mockClear()
    geometry.computeVertexNormals()

    expect(geometry.attributes.normal).toBe(normal)
    expect(Array.from(normal.data)).toEqual(Array(6).fill([0, 0, 1]).flat())
    expect(normal.needsUpdate).toBe(true)
    expect(gl.createBuffer).not.toHaveBeenCalled()
  })

  it('treats 2D positions as z = 0', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 1, 0, 1, 1], 2)
    })
    geometry.computeVertexNormals()
    expect(normals(geometry)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1])
  })

  it('reads interleaved positions using byte stride and offset', () => {
    // Interleaved [u, v, x, y, z] floats: stride 20 bytes, positions 8 bytes in
    const data: number[] = []
    for (let i = 0; i < quad.length; i += 3)
      data.push(9, 9, ...quad.slice(i, i + 3))
    const geometry = new Geometry(gl, {
      position: new GeometryAttribute({
        size: 3,
        stride: 5 * 4,
        offset: 2 * 4,
        data: new Float32Array(data)
      })
    })
    geometry.computeVertexNormals()
    expect(normals(geometry)).toEqual(Array(6).fill([0, 0, 1]).flat())
  })

  it("doesn't read an external position", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const attr = position(quad)
    attr.external = true
    const geometry = new Geometry(gl, { position: attr })

    geometry.computeVertexNormals()
    expect(geometry.attributes.normal).toBeUndefined()
    warn.mockRestore()
  })

  it('leaves degenerate faces with a zero normal rather than NaN', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 1, 1, 1, 2, 2, 2])
    })
    geometry.computeVertexNormals()
    expect(normals(geometry)).toEqual(Array(9).fill(0))
  })
})

describe('Geometry.addAttribute', () => {
  let gl: MockGL
  let program: Program

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
    program = new Program(gl, { vertex: '', fragment: '' })
  })

  it('rebuilds the vertex arrays when an attribute is added after a draw', () => {
    const geometry = new Geometry(gl, { position: position(quadPositions) })
    geometry.draw({ program, mode: gl.TRIANGLES })
    expect(gl.createVertexArray).toHaveBeenCalledTimes(1)
    const vao = vi.mocked(gl.createVertexArray).mock.results[0].value

    geometry.addAttribute('uv', position([0, 0, 1, 0, 1, 1], 2))
    expect(gl.deleteVertexArray).toHaveBeenCalledWith(vao)

    geometry.draw({ program, mode: gl.TRIANGLES })
    expect(gl.createVertexArray).toHaveBeenCalledTimes(2)
  })

  it('keeps the vertex arrays for the same attribute or a new index', () => {
    const uv = position([0, 0, 1, 0, 1, 1], 2)
    const geometry = new Geometry(gl, { position: position(quadPositions), uv })
    geometry.draw({ program, mode: gl.TRIANGLES })

    geometry.addAttribute('uv', uv)
    geometry.setIndex(new Uint16Array([0, 1, 2]))
    geometry.draw({ program, mode: gl.TRIANGLES })

    expect(gl.deleteVertexArray).not.toHaveBeenCalled()
    expect(gl.createVertexArray).toHaveBeenCalledTimes(1)
  })
})

describe('Geometry.applyMatrix', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  const compose = (
    rotation = new Quat(0, 0, 0, 1),
    translation = new Vec3(0, 0, 0),
    scale = new Vec3(1, 1, 1)
  ) => Mat4.fromRotationTranslationScale(rotation, translation, scale)

  const normal = (data: number[]) =>
    new GeometryAttribute({ size: 3, data: new Float32Array(data) })

  const expectCloseTo = (actual: ArrayLike<number>, expected: number[]) => {
    expect(actual.length).toBe(expected.length)
    expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value))
  }

  it('translates positions and leaves normals alone', () => {
    const geometry = new Geometry(gl, {
      position: position(quadPositions),
      normal: normal([0, 0, 1, 0, 0, 1, 0, 0, 1])
    })
    geometry.applyMatrix(compose(undefined, new Vec3(1, 2, 3)))

    const { position: p, normal: n } = geometry.attributes
    expectCloseTo(p.data, [1, 2, 3, 2, 2, 3, 1, 3, 3])
    expectCloseTo(n.data, [0, 0, 1, 0, 0, 1, 0, 0, 1])
    expect(p.needsUpdate).toBe(true)
    expect(n.needsUpdate).toBe(true)
  })

  it('rotates positions and normals', () => {
    const geometry = new Geometry(gl, {
      position: position([1, 0, 0]),
      normal: normal([1, 0, 0])
    })
    const half = Math.SQRT1_2
    geometry.applyMatrix(compose(new Quat(0, 0, half, half)))

    expectCloseTo(geometry.attributes.position.data, [0, 1, 0])
    expectCloseTo(geometry.attributes.normal.data, [0, 1, 0])
  })

  it('transforms normals by the inverse transpose and re-normalises them', () => {
    const n = Math.SQRT1_2
    const geometry = new Geometry(gl, {
      position: position(quadPositions),
      normal: normal([n, n, 0, n, n, 0, n, n, 0])
    })
    geometry.applyMatrix(compose(undefined, undefined, new Vec3(2, 1, 1)))

    const s = Math.sqrt(5)
    expectCloseTo(geometry.attributes.normal.data, [
      1 / s,
      2 / s,
      0,
      1 / s,
      2 / s,
      0,
      1 / s,
      2 / s,
      0
    ])
  })

  it('writes back only x and y of 2D positions', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 1, 0, 0, 1], 2)
    })
    geometry.applyMatrix(compose(undefined, new Vec3(1, 2, 3)))
    expectCloseTo(geometry.attributes.position.data, [1, 2, 2, 2, 1, 3])
  })

  it('transforms interleaved positions and normals', () => {
    // Interleaved [x, y, z, nx, ny, nz] floats: stride 24 bytes
    const data = new Float32Array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0])
    const geometry = new Geometry(gl, {
      position: new GeometryAttribute({ size: 3, stride: 24, data }),
      normal: new GeometryAttribute({ size: 3, stride: 24, offset: 12, data })
    })
    const half = Math.SQRT1_2
    geometry.applyMatrix(compose(new Quat(0, 0, half, half)))

    expectCloseTo(data, [0, 1, 0, 0, 1, 0, -1, 0, 0, -1, 0, 0])
  })

  it('reverses the winding of mirrored indexed geometry', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      index: new GeometryAttribute({
        data: new Uint16Array([0, 1, 2, 0, 2, 3])
      })
    })
    geometry.computeVertexNormals()
    geometry.applyMatrix(compose(undefined, undefined, new Vec3(-1, 1, 1)))

    const index = geometry.attributes.index
    expect(Array.from(index.data)).toEqual([0, 2, 1, 0, 3, 2])
    expect(index.needsUpdate).toBe(true)

    // Recomputing from the new winding agrees with the transformed normals
    const transformed = Array.from(geometry.attributes.normal.data)
    geometry.computeVertexNormals()
    expectCloseTo(geometry.attributes.normal.data, transformed)
    expectCloseTo(transformed, Array(4).fill([0, 0, 1]).flat())
  })

  it('reverses the winding of mirrored non-indexed geometry', () => {
    const offsets = new GeometryAttribute({
      size: 3,
      instanced: 1,
      data: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    })
    const geometry = new Geometry(gl, {
      position: position(quadPositions),
      uv: position([0, 0, 1, 0, 0, 1], 2),
      offset: offsets
    })
    geometry.applyMatrix(compose(undefined, undefined, new Vec3(-1, 1, 1)))

    expectCloseTo(
      geometry.attributes.position.data,
      [0, 0, 0, 0, 1, 0, -1, 0, 0]
    )
    expect(Array.from(geometry.attributes.uv.data)).toEqual([0, 0, 0, 1, 1, 0])
    expect(Array.from(offsets.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('recomputes existing bounds and leaves missing ones unset', () => {
    const geometry = new Geometry(gl, { position: position(quadPositions) })
    geometry.computeBoundingSphere()
    const bounds = geometry.bounds!
    geometry.applyMatrix(compose(undefined, new Vec3(10, 0, 0)))

    expect(geometry.bounds).toBe(bounds)
    expect([bounds.min.x, bounds.max.x, bounds.center.x]).toEqual([
      10, 11, 10.5
    ])
    expect(bounds.radius).toBeCloseTo(Math.sqrt(0.5))

    const unmeasured = new Geometry(gl, { position: position(quadPositions) })
    unmeasured.applyMatrix(compose(undefined, new Vec3(10, 0, 0)))
    expect(unmeasured.bounds).toBeUndefined()
  })

  it("doesn't transform an external position", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const attr = position(quadPositions)
    attr.external = true
    const geometry = new Geometry(gl, { position: attr })

    geometry.applyMatrix(compose(undefined, new Vec3(1, 2, 3)))
    expect(Array.from(attr.data)).toEqual(quadPositions)
    warn.mockRestore()
  })
})

// A unit quad as 4 vertices and 2 counter-clockwise triangles
const indexedQuad = (gl: MockGL) =>
  new Geometry(gl, {
    position: position([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    uv: position([0, 0, 1, 0, 1, 1, 0, 1], 2),
    index: new GeometryAttribute({ data: new Uint16Array([0, 1, 2, 0, 2, 3]) })
  })

// The positions of each drawn vertex, in draw order
const drawnPositions = (geometry: Geometry) => {
  const { position: p, index } = geometry.attributes
  const ids = index
    ? Array.from(index.data)
    : Array.from({ length: p.count }, (_, i) => i)
  return ids.map((v) => Array.from(p.data.slice(v * 3, v * 3 + 3)))
}

describe('Geometry.toNonIndexed', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  it('gives every index entry its own vertex', () => {
    const geometry = indexedQuad(gl)
    const flat = geometry.toNonIndexed()

    expect(flat).not.toBe(geometry)
    expect(flat.attributes.index).toBeUndefined()
    expect(flat.drawRange.count).toBe(6)
    expect(drawnPositions(flat)).toEqual(drawnPositions(geometry))
    expect(Array.from(flat.attributes.uv.data)).toEqual([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1
    ])

    // The original is untouched
    expect(geometry.attributes.position.count).toBe(4)
    expect(Array.from(geometry.attributes.index.data)).toEqual([
      0, 1, 2, 0, 2, 3
    ])
  })

  it('packs interleaved attributes tightly', () => {
    // Interleaved [x, y, z, u, v] floats: stride 20 bytes
    const data = new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
    const geometry = new Geometry(gl, {
      position: new GeometryAttribute({ size: 3, stride: 20, data }),
      uv: new GeometryAttribute({ size: 2, stride: 20, offset: 12, data }),
      index: new GeometryAttribute({ data: new Uint16Array([2, 1, 0]) })
    })
    const flat = geometry.toNonIndexed()

    const { position: p, uv } = flat.attributes
    expect([p.stride, p.offset, uv.stride, uv.offset]).toEqual([0, 0, 0, 0])
    expect(Array.from(p.data)).toEqual([0, 1, 0, 1, 0, 0, 0, 0, 0])
    expect(Array.from(uv.data)).toEqual([0, 1, 1, 0, 0, 0])
  })

  it('copies instanced attributes', () => {
    const offsets = new GeometryAttribute({
      size: 3,
      instanced: 1,
      data: new Float32Array([1, 2, 3, 4, 5, 6])
    })
    const geometry = indexedQuad(gl)
    geometry.addAttribute('offset', offsets)
    const copy = geometry.toNonIndexed().attributes.offset

    expect(copy).not.toBe(offsets)
    expect(copy.data).not.toBe(offsets.data)
    expect(Array.from(copy.data)).toEqual([1, 2, 3, 4, 5, 6])
    expect(copy.divisor).toBe(1)
  })

  it('copies geometry that has no index', () => {
    const geometry = new Geometry(gl, { position: position(quadPositions) })
    const copy = geometry.toNonIndexed()

    expect(copy.attributes.position).not.toBe(geometry.attributes.position)
    expect(Array.from(copy.attributes.position.data)).toEqual(quadPositions)
  })
})

describe('Geometry.mergeVertices', () => {
  let gl: MockGL

  beforeEach(() => {
    ;({ gl } = createMockRenderer())
  })

  const vertexCount = (geometry: Geometry) => geometry.attributes.position.count

  it('welds matching vertices back into an indexed geometry', () => {
    const geometry = indexedQuad(gl)
    const welded = geometry.toNonIndexed().mergeVertices()

    expect(vertexCount(welded)).toBe(4)
    expect(welded.attributes.index.data).toBeInstanceOf(Uint16Array)
    expect(welded.attributes.index.count).toBe(6)
    expect(drawnPositions(welded)).toEqual(drawnPositions(geometry))
  })

  it('keeps vertices with different uvs apart', () => {
    const geometry = new Geometry(gl, {
      position: position([
        0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0
      ]),
      // The second triangle's copies of the shared vertices have new uvs
      uv: position([0, 0, 1, 0, 0, 1, 0.5, 1, 1, 0.5, 1, 1], 2)
    })
    expect(vertexCount(geometry.mergeVertices())).toBe(6)
  })

  it('ignores normals when welding, then recomputes them', () => {
    // A triangle of area 2 facing +z and one of area 1 facing -x, folded
    // along the y axis, each with its own face normals
    const geometry = new Geometry(gl, {
      position: position([
        0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, -1
      ])
    })
    geometry.computeVertexNormals()
    const welded = geometry.mergeVertices()

    expect(vertexCount(welded)).toBe(4)
    const { position: p, normal: n } = welded.attributes
    const shared = [-1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)]
    for (let v = 0; v < 4; v++) {
      if (p.data[v * 3] !== 0 || p.data[v * 3 + 2] !== 0) continue
      shared.forEach((value, k) => expect(n.data[v * 3 + k]).toBeCloseTo(value))
    }
  })

  it('merges values within the tolerance', () => {
    const geometry = new Geometry(gl, {
      position: position([0, 0, 0, 0.5, 0, 0, 0.50001, 0, 0])
    })
    expect(vertexCount(geometry.mergeVertices())).toBe(2)
    expect(vertexCount(geometry.mergeVertices(1e-6))).toBe(3)
  })

  it('drops vertices the index never uses', () => {
    const geometry = new Geometry(gl, {
      position: position([9, 9, 9, ...quadPositions, 8, 8, 8]),
      index: new GeometryAttribute({ data: new Uint16Array([1, 2, 3]) })
    })
    const welded = geometry.mergeVertices()

    expect(vertexCount(welded)).toBe(3)
    expect(drawnPositions(welded)).toEqual(drawnPositions(geometry))
  })

  it('uses 32-bit indices past 65,536 vertices', () => {
    const count = 65537
    const data = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) data[i * 3] = i
    const geometry = new Geometry(gl, {
      position: new GeometryAttribute({ size: 3, data })
    })
    expect(geometry.mergeVertices().attributes.index.data).toBeInstanceOf(
      Uint32Array
    )
  })
})
