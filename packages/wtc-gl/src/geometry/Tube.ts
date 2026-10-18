// Based on OGL (https://github.com/oframe/ogl), MIT © 2019 Nathan Gordon

import { Vec3 } from 'wtc-math'

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'
import type { Path } from '../path/Path'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface TubeOptions {
  path: Path
  radius: number | ((u: number) => number)
  tubularSegments: number
  radialSegments: number
  closed: boolean
  attributes: WTCGLGeometryAttributeCollection
}

/**
 * A tube swept along a `Path` (or a `Curve`). The rings are spaced evenly by
 * distance along the path, and oriented by `path.computeFrames`, so a tilt on
 * the path twists the tube.
 *
 * `radius` is a number, or a function of `u`, the fraction of the way along
 * the path, for tapers. `closed` (by default the path's own) joins the last
 * ring onto the first. u runs along the path and v around the tube. The ends
 * are open, so draw it two-sided, or cap it, if they'll be seen.
 */
export class Tube extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      path,
      radius = 0.1,
      tubularSegments = 64,
      radialSegments = 8,
      closed = path?.closed ?? false,
      attributes = {}
    }: Partial<TubeOptions> = {}
  ) {
    if (!path) throw new Error('Tube: a path is required')

    const tSegs = tubularSegments
    const rSegs = radialSegments
    const radiusAt = typeof radius === 'function' ? radius : () => radius
    const length = path.getLength()
    const { tangents, normals, binormals } = path.computeFrames(tSegs, closed)

    const num = (tSegs + 1) * (rSegs + 1)
    const numIndices = tSegs * rSegs * 6

    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      num > 65536 ? new Uint32Array(numIndices) : new Uint16Array(numIndices)

    const point = new Vec3()
    let i = 0

    for (let j = 0; j <= tSegs; j++) {
      // A closed tube's last ring repeats the first, with its uvs at u = 1
      const k = closed && j === tSegs ? 0 : j
      const u = k / tSegs
      path.getPointAt(u, point)
      const T = tangents[k]
      const N = normals[k]
      const B = binormals[k]

      // How fast the radius changes with distance along the path. The surface
      // leans by that much, so its normal leans the other way.
      const r = radiusAt(u)
      const e = 1e-4
      const slope =
        length > 0
          ? (radiusAt(Math.min(1, u + e)) - radiusAt(Math.max(0, u - e))) /
            ((Math.min(1, u + e) - Math.max(0, u - e)) * length)
          : 0
      const lean = Math.sqrt(1 + slope * slope)

      for (let m = 0; m <= rSegs; m++, i++) {
        const v = (m / rSegs) * Math.PI * 2
        const sin = Math.sin(v)
        const cos = -Math.cos(v)

        // Out from the path, in this ring's plane
        const dx = cos * N.x + sin * B.x
        const dy = cos * N.y + sin * B.y
        const dz = cos * N.z + sin * B.z

        position[i * 3] = point.x + r * dx
        position[i * 3 + 1] = point.y + r * dy
        position[i * 3 + 2] = point.z + r * dz

        normal[i * 3] = (dx - slope * T.x) / lean
        normal[i * 3 + 1] = (dy - slope * T.y) / lean
        normal[i * 3 + 2] = (dz - slope * T.z) / lean

        uv[i * 2] = j / tSegs
        uv[i * 2 + 1] = m / rSegs
      }
    }

    let ii = 0
    for (let j = 1; j <= tSegs; j++) {
      for (let m = 1; m <= rSegs; m++) {
        const a = (rSegs + 1) * (j - 1) + (m - 1)
        const b = (rSegs + 1) * j + (m - 1)
        const c = (rSegs + 1) * j + m
        const d = (rSegs + 1) * (j - 1) + m

        index.set([a, b, d, b, c, d], ii * 3)
        ii += 2
      }
    }

    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({ size: 3, data: position }),
      normal: new GeometryAttribute({ size: 3, data: normal }),
      uv: new GeometryAttribute({ size: 2, data: uv }),
      index: new GeometryAttribute({ data: index })
    })

    super(gl, attr)
  }
}
