import { Vec3 } from 'wtc-math'

// Anything with x, y and z, such as a Vec3
type XYZ = { x: number; y: number; z: number }

export interface PathFrames {
  tangents: Vec3[]
  normals: Vec3[]
  binormals: Vec3[]
}

export interface RotationMinimisingFramesOptions {
  /**
   * Whether the tangents describe a loop. The last tangent should then repeat
   * the first: the twist left over after one lap is spread evenly around it,
   * so the last frame matches the first.
   */
  closed?: boolean
  /** A twist (radians) for each frame, about its tangent. */
  tilts?: number[]
  /**
   * The direction to start the normal in. It's made perpendicular to the
   * first tangent. Without it, or when it's parallel to the first tangent,
   * the axis least like the first tangent is used.
   */
  normal?: XYZ
}

export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v))

const dot = (a: XYZ, b: XYZ) => a.x * b.x + a.y * b.y + a.z * b.z

// out = a × b, normalised if asked
const cross = (out: Vec3, a: XYZ, b: XYZ, normalise = false): Vec3 => {
  const x = a.y * b.z - a.z * b.y
  const y = a.z * b.x - a.x * b.z
  const z = a.x * b.y - a.y * b.x
  const l = normalise ? Math.hypot(x, y, z) || 1 : 1
  out.x = x / l
  out.y = y / l
  out.z = z / l
  return out
}

// Turns the normal towards the binormal by angle, about the tangent
const twist = (angle: number, n: Vec3, b: Vec3) => {
  const s = Math.sin(angle)
  const c = Math.cos(angle)
  const nx = c * n.x + s * b.x
  const ny = c * n.y + s * b.y
  const nz = c * n.z + s * b.z
  b.x = c * b.x - s * n.x
  b.y = c * b.y - s * n.y
  b.z = c * b.z - s * n.z
  n.x = nx
  n.y = ny
  n.z = nz
}

const copy = (v: XYZ) => new Vec3(v.x, v.y, v.z)

/**
 * Rotation-minimising frames for a list of unit tangents: the normal is
 * carried along, turning only as much as the tangent does, so it doesn't flip
 * or spin like true Frenet frames. Then each frame is twisted by its tilt.
 * The binormal is tangent × normal.
 *
 * See "Computation of Rotation Minimizing Frames", Wang et al. 2008.
 */
export function rotationMinimisingFrames(
  tangents: XYZ[],
  { closed = false, tilts, normal }: RotationMinimisingFramesOptions = {}
): PathFrames {
  const count = tangents.length
  const ts = tangents.map(copy)
  const normals: Vec3[] = []
  const binormals: Vec3[] = []
  if (!count) return { tangents: ts, normals, binormals }
  const last = count - 1
  if (closed) ts[last] = copy(ts[0])

  // Start with the given normal, or the axis least like the first tangent,
  // made perpendicular: side × t0 is the part of either at right angles to t0
  const t0 = ts[0]
  const side = new Vec3()
  if (normal) cross(side, t0, normal, true)
  if (!normal || Math.hypot(side.x, side.y, side.z) < 1e-6) {
    const ax = Math.abs(t0.x)
    const ay = Math.abs(t0.y)
    const az = Math.abs(t0.z)
    const axis =
      ax <= ay && ax <= az
        ? new Vec3(1, 0, 0)
        : ay <= az
          ? new Vec3(0, 1, 0)
          : new Vec3(0, 0, 1)
    // Reversed, which keeps the frames Path has always given
    cross(side, axis, t0, true)
  }
  normals.push(cross(new Vec3(), side, t0))
  binormals.push(cross(new Vec3(), t0, normals[0]))

  // Carry the normal along: rotate it by however far the tangent turned
  const k = new Vec3()
  for (let i = 1; i < count; i++) {
    const a = ts[i - 1]
    const b = ts[i]
    const n = copy(normals[i - 1])

    cross(k, a, b)
    const sin = Math.hypot(k.x, k.y, k.z)
    if (sin > Number.EPSILON) {
      k.x /= sin
      k.y /= sin
      k.z /= sin
      const cos = clamp(dot(a, b), -1, 1)
      // Rodrigues: n cosθ + (k × n) sinθ + k (k · n)(1 - cosθ)
      const kn = dot(k, n)
      const kx = k.y * n.z - k.z * n.y
      const ky = k.z * n.x - k.x * n.z
      const kz = k.x * n.y - k.y * n.x
      n.x = n.x * cos + kx * sin + k.x * kn * (1 - cos)
      n.y = n.y * cos + ky * sin + k.y * kn * (1 - cos)
      n.z = n.z * cos + kz * sin + k.z * kn * (1 - cos)
      const l = Math.hypot(n.x, n.y, n.z)
      n.x /= l
      n.y /= l
      n.z /= l
    }

    normals.push(n)
    binormals.push(cross(new Vec3(), b, n))
  }

  if (tilts) {
    for (let i = 0; i < count; i++) twist(tilts[i], normals[i], binormals[i])
  }

  if (closed && last > 0) {
    // How far the last normal has turned from the first, about the tangent
    const first = normals[0]
    const end = normals[last]
    let step = Math.acos(clamp(dot(first, end), -1, 1)) / last
    if (dot(t0, cross(k, first, end)) > 0) step = -step

    for (let i = 1; i < last; i++) twist(step * i, normals[i], binormals[i])
    normals[last] = copy(first)
    binormals[last] = copy(binormals[0])
  }

  return { tangents: ts, normals, binormals }
}
