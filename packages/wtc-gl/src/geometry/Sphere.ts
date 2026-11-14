import { Vec3 } from 'wtc-math'

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

/**
 * Options for creating a {@link Sphere}.
 * @category Geometry
 */
export interface SphereOptions {
  /** The sphere's radius. @default 0.5 */
  radius: number
  /** Number of divisions around the y axis. @default 16 */
  widthSegments: number
  /** Number of divisions from pole to pole. @default Math.ceil(widthSegments * 0.5) */
  heightSegments: number
  /** Angle around the y axis to start at, in radians. @default 0 */
  phiStart: number
  /** Angle around the y axis to sweep, in radians. @default Math.PI * 2 */
  phiLength: number
  /** Angle down from the top pole to start at, in radians. @default 0 */
  thetaStart: number
  /** Angle down from `thetaStart` to sweep, in radians. @default Math.PI */
  thetaLength: number
  /** Extra attributes to add. The generated `position`, `normal`, `uv` and `index` replace any with the same name. @default {} */
  attributes: WTCGLGeometryAttributeCollection
}

/**
 * A UV sphere centred on the origin, with its poles on the y axis. φ runs
 * around the y axis from -x towards +z, and θ down from the top pole (+y), so
 * partial sweeps of either leave it open.
 * @category Geometry
 */
export class Sphere extends Geometry {
  /**
   * Create a sphere
   * @param gl - The WTCGL rendering context
   * @param options - Radius, divisions and sweep; see {@link SphereOptions}.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      radius = 0.5,
      widthSegments = 16,
      heightSegments = Math.ceil(widthSegments * 0.5),
      phiStart = 0,
      phiLength = Math.PI * 2,
      thetaStart = 0,
      thetaLength = Math.PI,
      attributes = {}
    }: Partial<SphereOptions> = {}
  ) {
    const wSegs = widthSegments
    const hSegs = heightSegments
    const pStart = phiStart
    const pLength = phiLength
    const tStart = thetaStart
    const tLength = thetaLength

    const num = (wSegs + 1) * (hSegs + 1)
    const numIndices = wSegs * hSegs * 6

    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      num > 65536 ? new Uint32Array(numIndices) : new Uint16Array(numIndices)

    let i = 0
    let iv = 0
    let ii = 0
    const te = tStart + tLength
    const grid = []

    const n = new Vec3()

    for (let iy = 0; iy <= hSegs; iy++) {
      const vRow = []
      const v = iy / hSegs
      for (let ix = 0; ix <= wSegs; ix++, i++) {
        const u = ix / wSegs
        const x =
          -radius *
          Math.cos(pStart + u * pLength) *
          Math.sin(tStart + v * tLength)
        const y = radius * Math.cos(tStart + v * tLength)
        const z =
          radius *
          Math.sin(pStart + u * pLength) *
          Math.sin(tStart + v * tLength)

        position[i * 3] = x
        position[i * 3 + 1] = y
        position[i * 3 + 2] = z

        n.reset(x, y, z).normalise()
        normal[i * 3] = n.x
        normal[i * 3 + 1] = n.y
        normal[i * 3 + 2] = n.z

        uv[i * 2] = u
        uv[i * 2 + 1] = 1 - v

        vRow.push(iv++)
      }

      grid.push(vRow)
    }

    for (let iy = 0; iy < hSegs; iy++) {
      for (let ix = 0; ix < wSegs; ix++) {
        const a = grid[iy][ix + 1]
        const b = grid[iy][ix]
        const c = grid[iy + 1][ix]
        const d = grid[iy + 1][ix + 1]

        if (iy !== 0 || tStart > 0) {
          index[ii * 3] = a
          index[ii * 3 + 1] = b
          index[ii * 3 + 2] = d
          ii++
        }
        if (iy !== hSegs - 1 || te < Math.PI) {
          index[ii * 3] = b
          index[ii * 3 + 1] = c
          index[ii * 3 + 2] = d
          ii++
        }
      }
    }

    Object.assign(attributes, {
      position: new GeometryAttribute({ size: 3, data: position }),
      normal: new GeometryAttribute({ size: 3, data: normal }),
      uv: new GeometryAttribute({ size: 2, data: uv }),
      // Rows at closed poles skip a triangle per segment, so trim the unused
      // (all-zero) entries off the end
      index: new GeometryAttribute({ data: index.slice(0, ii * 3) })
    })

    super(gl, attributes)
  }
}
