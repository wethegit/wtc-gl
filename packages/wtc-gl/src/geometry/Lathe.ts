import type { Vec2 } from 'wtc-math'

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

/** A profile point: distance from the y axis, then height. */
export type LathePoint = [number, number] | Vec2

export interface LatheOptions {
  points: LathePoint[]
  segments: number
  phiStart: number
  phiLength: number
  attributes: WTCGLGeometryAttributeCollection
}

export interface LatheData {
  position: Float32Array
  normal: Float32Array
  uv: Float32Array
  index: Uint16Array | Uint32Array
}

const toPair = (p: LathePoint): [number, number] =>
  Array.isArray(p) ? p : [p.x, p.y]

/**
 * Spins a 2D profile around the y axis. Each point is `[r, y]` (or a `Vec2`),
 * where r is the distance from the axis. List the points bottom to top for
 * outward-facing triangles. Angles run from +z (φ = 0) towards +x, like
 * `Cylinder`.
 *
 * u runs around the axis and v along the profile by distance, so a texture
 * doesn't stretch where the points are unevenly spaced. Normals are smooth,
 * including at corners in the profile: for hard edges, use `toNonIndexed()`
 * then `computeVertexNormals()`.
 */
export class Lathe extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      points = [],
      segments = 12,
      phiStart = 0,
      phiLength = Math.PI * 2,
      attributes = {}
    }: Partial<LatheOptions> = {}
  ) {
    const { position, normal, uv, index } = Lathe.build(
      points,
      segments,
      phiStart,
      phiLength
    )

    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({ size: 3, data: position }),
      normal: new GeometryAttribute({ size: 3, data: normal }),
      uv: new GeometryAttribute({ size: 2, data: uv }),
      index: new GeometryAttribute({ data: index })
    })

    super(gl, attr)
  }

  /**
   * Builds the lathe's arrays without making a geometry, for other primitives
   * built from a profile. `profileNormals`, one `[r, y]` per point, replaces
   * the normals worked out from the profile's direction.
   */
  static build(
    points: LathePoint[],
    segments: number,
    phiStart: number,
    phiLength: number,
    profileNormals?: [number, number][]
  ): LatheData {
    if (points.length < 2) {
      throw new Error('Lathe: the profile needs at least two points')
    }

    const profile = points.map(toPair)
    const count = profile.length

    // Distance along the profile to each point, for v
    const distance = [0]
    for (let i = 1; i < count; i++) {
      const [r0, y0] = profile[i - 1]
      const [r1, y1] = profile[i]
      distance.push(distance[i - 1] + Math.hypot(r1 - r0, y1 - y0))
    }
    const total = distance[count - 1]

    // Each point's normal in the profile plane: the profile's direction there,
    // averaged over the segments either side, turned a quarter clockwise
    const flat =
      profileNormals ??
      profile.map((_, i): [number, number] => {
        let dr = 0
        let dy = 0
        for (const [a, b] of [
          [i - 1, i],
          [i, i + 1]
        ]) {
          if (a < 0 || b >= count) continue
          const sr = profile[b][0] - profile[a][0]
          const sy = profile[b][1] - profile[a][1]
          const len = Math.hypot(sr, sy)
          if (len === 0) continue
          dr += sr / len
          dy += sy / len
        }
        const len = Math.hypot(dr, dy)
        return len === 0 ? [1, 0] : [dy / len, -dr / len]
      })

    const num = (segments + 1) * count
    const numIndices = segments * (count - 1) * 6

    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      num > 65536 ? new Uint32Array(numIndices) : new Uint16Array(numIndices)

    let i = 0
    let ii = 0

    for (let j = 0; j <= segments; j++) {
      const u = j / segments
      const phi = phiStart + u * phiLength
      const sin = Math.sin(phi)
      const cos = Math.cos(phi)

      for (let k = 0; k < count; k++, i++) {
        const [r, y] = profile[k]
        const [nr, ny] = flat[k]

        position[i * 3] = r * sin
        position[i * 3 + 1] = y
        position[i * 3 + 2] = r * cos

        normal[i * 3] = nr * sin
        normal[i * 3 + 1] = ny
        normal[i * 3 + 2] = nr * cos

        uv[i * 2] = u
        uv[i * 2 + 1] = total > 0 ? distance[k] / total : k / (count - 1)
      }
    }

    for (let j = 0; j < segments; j++) {
      for (let k = 0; k < count - 1; k++) {
        const a = j * count + k
        const b = a + count
        const c = b + 1
        const d = a + 1

        index.set([a, b, d, b, c, d], ii * 3)
        ii += 2
      }
    }

    return { position, normal, uv, index }
  }
}
