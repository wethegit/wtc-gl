import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Geometry } from '../src/geometry/Geometry'
import { GeometryAttribute } from '../src/geometry/GeometryAttribute'
import { createMockRenderer, type MockGL } from './mockGL'

const position = (data: number[], size = 3) =>
  new GeometryAttribute({
    size,
    data: new Float32Array(data),
    type: 5126 // FLOAT, so the attribute doesn't reach for window
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

    const { min, max, center, scale } = geometry.bounds
    expect([min.x, min.y, min.z]).toEqual([-1, -2, -3])
    expect([max.x, max.y, max.z]).toEqual([3, 2, 1])
    expect([center.x, center.y, center.z]).toEqual([1, 0, -1])
    expect([scale.x, scale.y, scale.z]).toEqual([4, 4, 4])
  })

  it('computes the bounding sphere around the box centre', () => {
    const geometry = new Geometry(gl, {
      position: position([2, 0, 0, 4, 0, 0, 3, 0.5, 0, 3, -0.5, 0])
    })
    geometry.computeBoundingSphere()

    // Box centre is (3, 0, 0); the furthest points are 1 away
    const { center, radius } = geometry.bounds
    expect([center.x, center.y, center.z]).toEqual([3, 0, 0])
    expect(radius).toBeCloseTo(1)
  })

  it('respects attribute offset and stride', () => {
    // Interleaved [x, y, z, u, v]; only every 5th value onward is a position
    const data = [10, 20, 30, 99, 99, -10, -20, -30, 99, 99]
    const attr = new GeometryAttribute({
      size: 3,
      stride: 5,
      data: new Float32Array(data),
      type: 5126
    })
    const geometry = new Geometry(gl, {})
    geometry.computeBoundingBox(attr)

    const { min, max } = geometry.bounds
    expect([min.x, min.y, min.z]).toEqual([-10, -20, -30])
    expect([max.x, max.y, max.z]).toEqual([10, 20, 30])
  })

  it('leaves bounds unset when there is no position data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const geometry = new Geometry(gl, {})

    expect(() => geometry.computeBoundingBox()).not.toThrow()
    expect(() => geometry.computeBoundingSphere()).not.toThrow()
    expect(geometry.bounds).toBeUndefined()
    warn.mockRestore()
  })
})
