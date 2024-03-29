import { Vec3 } from 'wtc-math'

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface SphereOptions {
  radius: number
  widthSegments: number
  heightSegments: number
  phiStart: number
  phiLength: number
  thetaStart: number
  thetaLength: number
  attributes: WTCGLGeometryAttributeCollection
}

export class Sphere extends Geometry {
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
      index: new GeometryAttribute({ data: index })
    })

    super(gl, attributes)
  }
}
