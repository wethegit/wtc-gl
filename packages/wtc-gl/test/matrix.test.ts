import { describe, expect, it } from 'vitest'
import { Mat3, Mat4, Quat, Vec3 } from 'wtc-math'

import {
  composeMat4,
  determinantMat4,
  invertMat4,
  multiplyMat4,
  normalMatrix,
  quatFromEuler,
  writeMat3,
  writeMat4
} from '../src/core/matrix'

// A deterministic spread of values, so failures are reproducible
let seed = 1
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed / 2147483647) * 4 - 2
}

const randomMat4 = () => new Mat4(...Array.from({ length: 16 }, () => random()))

// A rotation, translation and scale, like an object's matrix
const randomTransform = () => {
  const q = Quat.fromEuler(new Vec3(random(), random(), random()))!
  return Mat4.fromRotationTranslationScale(
    q,
    new Vec3(random(), random(), random()),
    new Vec3(random() + 3, random() + 3, random() + 3)
  )
}

const expectSame = (a: { array: number[] }, b: { array: number[] }) => {
  const x = a.array
  const y = b.array
  expect(x.length).toBe(y.length)
  x.forEach((v, i) => expect(v).toBeCloseTo(y[i], 10))
}

describe('allocation-free matrix helpers', () => {
  it('multiplyMat4 matches multiplyNew, including in place', () => {
    for (let i = 0; i < 20; i++) {
      const a = randomMat4()
      const b = randomMat4()
      const expected = a.multiplyNew(b)

      expectSame(multiplyMat4(new Mat4(), a, b), expected)

      // out aliasing either input
      const a2 = a.clone()
      expectSame(multiplyMat4(a2, a2, b), expected)
      const b2 = b.clone()
      expectSame(multiplyMat4(b2, a, b2), expected)
    }
  })

  it('invertMat4 matches invertNew, including in place', () => {
    for (let i = 0; i < 20; i++) {
      const m = randomTransform()
      const expected = m.invertNew()

      const out = new Mat4()
      expect(invertMat4(out, m)).toBe(true)
      expectSame(out, expected)

      const m2 = m.clone()
      invertMat4(m2, m2)
      expectSame(m2, expected)
    }
  })

  it('invertMat4 leaves out unchanged for a singular matrix', () => {
    const singular = new Mat4(1, 2, 3, 4, 2, 4, 6, 8, 0, 0, 1, 0, 0, 0, 0, 1)
    const out = randomMat4()
    const before = out.array
    expect(invertMat4(out, singular)).toBe(false)
    expect(out.array).toEqual(before)
  })

  it('determinantMat4 matches determinant', () => {
    for (let i = 0; i < 20; i++) {
      const m = randomMat4()
      expect(determinantMat4(m)).toBeCloseTo(m.determinant, 8)
    }
  })

  it('composeMat4 matches fromRotationTranslationScale', () => {
    for (let i = 0; i < 20; i++) {
      const q = Quat.fromEuler(new Vec3(random(), random(), random()))!
      const p = new Vec3(random(), random(), random())
      const s = new Vec3(random(), random(), random())
      expectSame(
        composeMat4(randomMat4(), q, p, s),
        Mat4.fromRotationTranslationScale(q, p, s)
      )
    }
  })

  it('normalMatrix matches Mat3.fromMat4', () => {
    for (let i = 0; i < 20; i++) {
      const m = randomTransform()
      const out = new Mat3()
      expect(normalMatrix(out, m)).toBe(true)
      expectSame(out, Mat3.fromMat4(m)!)
    }
    const out = new Mat3()
    expect(
      normalMatrix(
        out,
        new Mat4(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)
      )
    ).toBe(false)
  })

  it('quatFromEuler matches Quat.fromEuler', () => {
    for (let i = 0; i < 20; i++) {
      const v = new Vec3(random(), random(), random())
      const expected = Quat.fromEuler(v)!
      const out = quatFromEuler(new Quat(), v)
      expect(out.x).toBeCloseTo(expected.x, 12)
      expect(out.y).toBeCloseTo(expected.y, 12)
      expect(out.z).toBeCloseTo(expected.z, 12)
      expect(out.w).toBeCloseTo(expected.w, 12)
    }
  })

  it('writeMat4 and writeMat3 match .array', () => {
    const m4 = randomMat4()
    expect([...writeMat4(m4, new Float32Array(16))]).toEqual(
      m4.array.map(Math.fround)
    )
    const m3 = Mat3.fromMat4(randomTransform())!
    expect([...writeMat3(m3, new Float32Array(9))]).toEqual(
      m3.array.map(Math.fround)
    )
  })
})
