import type { Mat3, Mat4, Quat, Vec3 } from 'wtc-math'

/*
 * Allocation-free versions of the wtc-math operations the render loop uses.
 * wtc-math's own "in place" methods still allocate (multiply and invert clone
 * first, `.array` and `.translation` return new objects), which adds up to a
 * lot of garbage per mesh per frame. These read and write the matrix fields
 * directly and copy wtc-math's formulas, so results are identical.
 *
 * Every function is safe to call with `out` as one of its inputs.
 */

/**
 * `out = a.multiplyNew(b)`
 */
export function multiplyMat4(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a11 = a.a11, a12 = a.a12, a13 = a.a13, a14 = a.a14 // prettier-ignore
  const a21 = a.a21, a22 = a.a22, a23 = a.a23, a24 = a.a24 // prettier-ignore
  const a31 = a.a31, a32 = a.a32, a33 = a.a33, a34 = a.a34 // prettier-ignore
  const a41 = a.a41, a42 = a.a42, a43 = a.a43, a44 = a.a44 // prettier-ignore
  const b11 = b.a11, b12 = b.a12, b13 = b.a13, b14 = b.a14 // prettier-ignore
  const b21 = b.a21, b22 = b.a22, b23 = b.a23, b24 = b.a24 // prettier-ignore
  const b31 = b.a31, b32 = b.a32, b33 = b.a33, b34 = b.a34 // prettier-ignore
  const b41 = b.a41, b42 = b.a42, b43 = b.a43, b44 = b.a44 // prettier-ignore

  out.a11 = b11 * a11 + b12 * a21 + b13 * a31 + b14 * a41
  out.a12 = b11 * a12 + b12 * a22 + b13 * a32 + b14 * a42
  out.a13 = b11 * a13 + b12 * a23 + b13 * a33 + b14 * a43
  out.a14 = b11 * a14 + b12 * a24 + b13 * a34 + b14 * a44
  out.a21 = b21 * a11 + b22 * a21 + b23 * a31 + b24 * a41
  out.a22 = b21 * a12 + b22 * a22 + b23 * a32 + b24 * a42
  out.a23 = b21 * a13 + b22 * a23 + b23 * a33 + b24 * a43
  out.a24 = b21 * a14 + b22 * a24 + b23 * a34 + b24 * a44
  out.a31 = b31 * a11 + b32 * a21 + b33 * a31 + b34 * a41
  out.a32 = b31 * a12 + b32 * a22 + b33 * a32 + b34 * a42
  out.a33 = b31 * a13 + b32 * a23 + b33 * a33 + b34 * a43
  out.a34 = b31 * a14 + b32 * a24 + b33 * a34 + b34 * a44
  out.a41 = b41 * a11 + b42 * a21 + b43 * a31 + b44 * a41
  out.a42 = b41 * a12 + b42 * a22 + b43 * a32 + b44 * a42
  out.a43 = b41 * a13 + b42 * a23 + b43 * a33 + b44 * a43
  out.a44 = b41 * a14 + b42 * a24 + b43 * a34 + b44 * a44
  return out
}

/**
 * `out = m.invertNew()`. Returns false, leaving `out` unchanged, if `m` can't
 * be inverted.
 */
export function invertMat4(out: Mat4, m: Mat4): boolean {
  const a11 = m.a11, a12 = m.a12, a13 = m.a13, a14 = m.a14 // prettier-ignore
  const a21 = m.a21, a22 = m.a22, a23 = m.a23, a24 = m.a24 // prettier-ignore
  const a31 = m.a31, a32 = m.a32, a33 = m.a33, a34 = m.a34 // prettier-ignore
  const a41 = m.a41, a42 = m.a42, a43 = m.a43, a44 = m.a44 // prettier-ignore

  const b00 = a11 * a22 - a12 * a21
  const b01 = a11 * a23 - a13 * a21
  const b02 = a11 * a24 - a14 * a21
  const b03 = a12 * a23 - a13 * a22
  const b04 = a12 * a24 - a14 * a22
  const b05 = a13 * a24 - a14 * a23
  const b06 = a31 * a42 - a32 * a41
  const b07 = a31 * a43 - a33 * a41
  const b08 = a31 * a44 - a34 * a41
  const b09 = a32 * a43 - a33 * a42
  const b10 = a32 * a44 - a34 * a42
  const b11 = a33 * a44 - a34 * a43

  const det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det) return false
  const d = 1 / det

  out.a11 = (a22 * b11 - a23 * b10 + a24 * b09) * d
  out.a12 = (a13 * b10 - a12 * b11 - a14 * b09) * d
  out.a13 = (a42 * b05 - a43 * b04 + a44 * b03) * d
  out.a14 = (a33 * b04 - a32 * b05 - a34 * b03) * d
  out.a21 = (a23 * b08 - a21 * b11 - a24 * b07) * d
  out.a22 = (a11 * b11 - a13 * b08 + a14 * b07) * d
  out.a23 = (a43 * b02 - a41 * b05 - a44 * b01) * d
  out.a24 = (a31 * b05 - a33 * b02 + a34 * b01) * d
  out.a31 = (a21 * b10 - a22 * b08 + a24 * b06) * d
  out.a32 = (a12 * b08 - a11 * b10 - a14 * b06) * d
  out.a33 = (a41 * b04 - a42 * b02 + a44 * b00) * d
  out.a34 = (a32 * b02 - a31 * b04 - a34 * b00) * d
  out.a41 = (a22 * b07 - a21 * b09 - a23 * b06) * d
  out.a42 = (a11 * b09 - a12 * b07 + a13 * b06) * d
  out.a43 = (a42 * b01 - a41 * b03 - a43 * b00) * d
  out.a44 = (a31 * b03 - a32 * b01 + a33 * b00) * d
  return true
}

/**
 * `m.determinant`, without the intermediate objects.
 */
export function determinantMat4(m: Mat4): number {
  const b00 = m.a11 * m.a22 - m.a12 * m.a21
  const b01 = m.a11 * m.a23 - m.a13 * m.a21
  const b02 = m.a11 * m.a24 - m.a14 * m.a21
  const b03 = m.a12 * m.a23 - m.a13 * m.a22
  const b04 = m.a12 * m.a24 - m.a14 * m.a22
  const b05 = m.a13 * m.a24 - m.a14 * m.a23
  const b06 = m.a31 * m.a42 - m.a32 * m.a41
  const b07 = m.a31 * m.a43 - m.a33 * m.a41
  const b08 = m.a31 * m.a44 - m.a34 * m.a41
  const b09 = m.a32 * m.a43 - m.a33 * m.a42
  const b10 = m.a32 * m.a44 - m.a34 * m.a42
  const b11 = m.a33 * m.a44 - m.a34 * m.a43
  return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
}

/**
 * `out = Mat4.fromRotationTranslationScale(q, p, s)`
 */
export function composeMat4(out: Mat4, q: Quat, p: Vec3, s: Vec3): Mat4 {
  const x = q.x, y = q.y, z = q.z, w = q.w // prettier-ignore
  const x2 = x + x, y2 = y + y, z2 = z + z // prettier-ignore
  const xx = x * x2, xy = x * y2, xz = x * z2 // prettier-ignore
  const yy = y * y2, yz = y * z2, zz = z * z2 // prettier-ignore
  const wx = w * x2, wy = w * y2, wz = w * z2 // prettier-ignore
  const sx = s.x, sy = s.y, sz = s.z // prettier-ignore

  out.a11 = (1 - (yy + zz)) * sx
  out.a12 = (xy + wz) * sx
  out.a13 = (xz - wy) * sx
  out.a14 = 0
  out.a21 = (xy - wz) * sy
  out.a22 = (1 - (xx + zz)) * sy
  out.a23 = (yz + wx) * sy
  out.a24 = 0
  out.a31 = (xz + wy) * sz
  out.a32 = (yz - wx) * sz
  out.a33 = (1 - (xx + yy)) * sz
  out.a34 = 0
  out.a41 = p.x
  out.a42 = p.y
  out.a43 = p.z
  out.a44 = 1
  return out
}

/**
 * `out = Mat3.fromMat4(m)`: the normal matrix (inverse transpose of the upper
 * 3x3). Returns false, leaving `out` unchanged, if `m` can't be inverted.
 */
export function normalMatrix(out: Mat3, m: Mat4): boolean {
  const a11 = m.a11, a12 = m.a12, a13 = m.a13, a14 = m.a14 // prettier-ignore
  const a21 = m.a21, a22 = m.a22, a23 = m.a23, a24 = m.a24 // prettier-ignore
  const a31 = m.a31, a32 = m.a32, a33 = m.a33, a34 = m.a34 // prettier-ignore
  const a41 = m.a41, a42 = m.a42, a43 = m.a43, a44 = m.a44 // prettier-ignore

  const b00 = a11 * a22 - a12 * a21
  const b01 = a11 * a23 - a13 * a21
  const b02 = a11 * a24 - a14 * a21
  const b03 = a12 * a23 - a13 * a22
  const b04 = a12 * a24 - a14 * a22
  const b05 = a13 * a24 - a14 * a23
  const b06 = a31 * a42 - a32 * a41
  const b07 = a31 * a43 - a33 * a41
  const b08 = a31 * a44 - a34 * a41
  const b09 = a32 * a43 - a33 * a42
  const b10 = a32 * a44 - a34 * a42
  const b11 = a33 * a44 - a34 * a43

  const det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det) return false
  const d = 1 / det

  out.a11 = (a22 * b11 - a23 * b10 + a24 * b09) * d
  out.a12 = (a23 * b08 - a21 * b11 - a24 * b07) * d
  out.a13 = (a21 * b10 - a22 * b08 + a24 * b06) * d
  out.a21 = (a13 * b10 - a12 * b11 - a14 * b09) * d
  out.a22 = (a11 * b11 - a13 * b08 + a14 * b07) * d
  out.a23 = (a12 * b08 - a11 * b10 - a14 * b06) * d
  out.a31 = (a42 * b05 - a43 * b04 + a44 * b03) * d
  out.a32 = (a43 * b02 - a41 * b05 - a44 * b01) * d
  out.a33 = (a41 * b04 - a42 * b02 + a44 * b00) * d
  return true
}

/**
 * `out = Quat.fromEuler(v)` with the default `YXZ` order.
 */
export function quatFromEuler(out: Quat, v: Vec3): Quat {
  const sx = Math.sin(v.x * 0.5), cx = Math.cos(v.x * 0.5) // prettier-ignore
  const sy = Math.sin(v.y * 0.5), cy = Math.cos(v.y * 0.5) // prettier-ignore
  const sz = Math.sin(v.z * 0.5), cz = Math.cos(v.z * 0.5) // prettier-ignore

  out.x = sx * cy * cz + cx * sy * sz
  out.y = cx * sy * cz - sx * cy * sz
  out.z = cx * cy * sz - sx * sy * cz
  out.w = cx * cy * cz + sx * sy * sz
  return out
}

/**
 * Write a matrix into a typed array in the order `.array` returns.
 */
export function writeMat4(m: Mat4, out: Float32Array): Float32Array {
  out[0] = m.a11
  out[1] = m.a12
  out[2] = m.a13
  out[3] = m.a14
  out[4] = m.a21
  out[5] = m.a22
  out[6] = m.a23
  out[7] = m.a24
  out[8] = m.a31
  out[9] = m.a32
  out[10] = m.a33
  out[11] = m.a34
  out[12] = m.a41
  out[13] = m.a42
  out[14] = m.a43
  out[15] = m.a44
  return out
}

/**
 * Write a 3x3 matrix into a typed array in the order `.array` returns.
 */
export function writeMat3(m: Mat3, out: Float32Array): Float32Array {
  out[0] = m.a11
  out[1] = m.a12
  out[2] = m.a13
  out[3] = m.a21
  out[4] = m.a22
  out[5] = m.a23
  out[6] = m.a31
  out[7] = m.a32
  out[8] = m.a33
  return out
}
