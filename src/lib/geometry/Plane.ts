import type { WTCGLRenderingContext } from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface PlaneOptions {
  width: number
  height: number
  widthSegments: number
  heightSegments: number
  attributes: object
}

export class Plane extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      width = 1,
      height = 1,
      widthSegments = 1,
      heightSegments = 1,
      attributes = {}
    }: Partial<PlaneOptions> = {}
  ) {
    const wSegs = widthSegments
    const hSegs = heightSegments

    // Determine length of arrays
    const num = (wSegs + 1) * (hSegs + 1)
    const numIndices = wSegs * hSegs * 6

    // Generate empty arrays once
    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      numIndices > 65536
        ? new Uint32Array(numIndices)
        : new Uint16Array(numIndices)

    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      width,
      height,
      0,
      wSegs,
      hSegs
    )

    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({ size: 3, data: position }),
      normal: new GeometryAttribute({ size: 3, data: normal }),
      uv: new GeometryAttribute({ size: 2, data: uv }),
      index: new GeometryAttribute({ data: index })
    })

    super(gl, attr)
  }

  static buildPlane(
    position: Float32Array,
    normal: Float32Array,
    uv: Float32Array,
    index: Uint32Array | Uint16Array,
    width: number,
    height: number,
    depth: number,
    wSegs: number,
    hSegs: number,
    u: number = 0,
    v: number = 1,
    w: number = 2,
    uDir: number = 1,
    vDir: number = -1,
    i: number = 0,
    ii: number = 0
  ) {
    const io = i
    const segW = width / wSegs
    const segH = height / hSegs

    for (let iy = 0; iy <= hSegs; iy++) {
      const y = iy * segH - height / 2
      for (let ix = 0; ix <= wSegs; ix++, i++) {
        const x = ix * segW - width / 2

        position[i * 3 + u] = x * uDir
        position[i * 3 + v] = y * vDir
        position[i * 3 + w] = depth / 2

        normal[i * 3 + u] = 0
        normal[i * 3 + v] = 0
        normal[i * 3 + w] = depth >= 0 ? 1 : -1

        uv[i * 2] = ix / wSegs
        uv[i * 2 + 1] = 1 - iy / hSegs

        if (iy === hSegs || ix === wSegs) continue
        const a = io + ix + iy * (wSegs + 1)
        const b = io + ix + (iy + 1) * (wSegs + 1)
        const c = io + ix + (iy + 1) * (wSegs + 1) + 1
        const d = io + ix + iy * (wSegs + 1) + 1

        index[ii * 6] = a
        index[ii * 6 + 1] = b
        index[ii * 6 + 2] = d
        index[ii * 6 + 3] = b
        index[ii * 6 + 4] = c
        index[ii * 6 + 5] = d
        ii++
      }
    }
  }
}
