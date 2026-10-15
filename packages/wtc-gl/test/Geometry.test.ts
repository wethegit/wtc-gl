import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { createMockRenderer, type MockGL } from './mockGL'

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
