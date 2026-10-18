// Ported from OGL (https://github.com/oframe/ogl), MIT © 2019 Nathan Gordon

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface TorusOptions {
  radius: number
  tube: number
  radialSegments: number
  tubularSegments: number
  arc: number
  attributes: WTCGLGeometryAttributeCollection
}

/**
 * A torus lying in the xy plane, centred on the origin. `radius` is from the
 * centre to the middle of the tube, and `tube` is the tube's radius. `arc`
 * sweeps the ring from +x towards +y, so less than 2π leaves it open.
 * `radialSegments` go around the tube and `tubularSegments` around the ring.
 */
export class Torus extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      radius = 0.5,
      tube = 0.2,
      radialSegments = 8,
      tubularSegments = 24,
      arc = Math.PI * 2,
      attributes = {}
    }: Partial<TorusOptions> = {}
  ) {
    const rSegs = radialSegments
    const tSegs = tubularSegments

    const num = (rSegs + 1) * (tSegs + 1)
    const numIndices = rSegs * tSegs * 6

    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      num > 65536 ? new Uint32Array(numIndices) : new Uint16Array(numIndices)

    let i = 0
    let ii = 0

    // One row per step around the tube, starting at its outer edge
    for (let j = 0; j <= rSegs; j++) {
      const v = (j / rSegs) * Math.PI * 2
      const cosV = Math.cos(v)
      const sinV = Math.sin(v)

      for (let k = 0; k <= tSegs; k++, i++) {
        const u = (k / tSegs) * arc
        const cosU = Math.cos(u)
        const sinU = Math.sin(u)

        position[i * 3] = (radius + tube * cosV) * cosU
        position[i * 3 + 1] = (radius + tube * cosV) * sinU
        position[i * 3 + 2] = tube * sinV

        // Away from the middle of the tube at this point on the ring
        normal[i * 3] = cosV * cosU
        normal[i * 3 + 1] = cosV * sinU
        normal[i * 3 + 2] = sinV

        uv[i * 2] = k / tSegs
        uv[i * 2 + 1] = j / rSegs
      }
    }

    for (let j = 1; j <= rSegs; j++) {
      for (let k = 1; k <= tSegs; k++) {
        const a = (tSegs + 1) * j + k - 1
        const b = (tSegs + 1) * (j - 1) + k - 1
        const c = (tSegs + 1) * (j - 1) + k
        const d = (tSegs + 1) * j + k

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
