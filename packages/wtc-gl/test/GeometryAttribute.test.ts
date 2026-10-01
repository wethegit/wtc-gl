import { describe, expect, it } from 'vitest'

import { GeometryAttribute } from '../src/geometry/GeometryAttribute'

// Pass a type so the attribute doesn't reach for window.WebGLRenderingContext
const FLOAT = 5126

describe('GeometryAttribute count', () => {
  it('derives the count from size', () => {
    const attr = new GeometryAttribute({
      size: 3,
      data: new Float32Array(12),
      type: FLOAT
    })
    expect(attr.count).toBe(4)
  })

  it('derives the count from a byte stride', () => {
    const attr = new GeometryAttribute({
      size: 3,
      stride: 5 * 4,
      data: new Float32Array(20),
      type: FLOAT
    })
    expect(attr.count).toBe(4)
  })

  it('uses an explicit count', () => {
    // Regression: a count without a stride used to divide by zero (Infinity)
    const attr = new GeometryAttribute({
      size: 3,
      count: 2,
      data: new Float32Array(12),
      type: FLOAT
    })
    expect(attr.count).toBe(2)
  })

  it('uses an explicit count over a stride', () => {
    const attr = new GeometryAttribute({
      size: 3,
      stride: 5 * 4,
      count: 1,
      data: new Float32Array(20),
      type: FLOAT
    })
    expect(attr.count).toBe(1)
  })
})
