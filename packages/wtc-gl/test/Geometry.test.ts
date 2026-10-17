import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { Program } from '../src/core/Program'
import { createMockRenderer, type MockGL } from './mockGL'

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
