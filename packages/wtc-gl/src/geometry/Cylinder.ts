// Ported from OGL (https://github.com/oframe/ogl), MIT © 2019 Nathan Gordon

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface CylinderOptions {
  radiusTop: number
  radiusBottom: number
  height: number
  radialSegments: number
  heightSegments: number
  openEnded: boolean
  thetaStart: number
  thetaLength: number
  attributes: WTCGLGeometryAttributeCollection
}

/**
 * A cylinder along the y axis, centred on the origin. Set `radiusTop: 0` for a
 * cone, and `openEnded` to leave out both caps. A cap with zero radius is
 * always left out. Angles run from +z (θ = 0) towards +x.
 */
export class Cylinder extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      radiusTop = 0.5,
      radiusBottom = 0.5,
      height = 1,
      radialSegments = 8,
      heightSegments = 1,
      openEnded = false,
      thetaStart = 0,
      thetaLength = Math.PI * 2,
      attributes = {}
    }: Partial<CylinderOptions> = {}
  ) {
    const rSegs = radialSegments
    const hSegs = heightSegments
    const halfHeight = height / 2

    const caps: { radius: number; sign: number }[] = []
    if (!openEnded) {
      if (radiusTop > 0) caps.push({ radius: radiusTop, sign: 1 })
      if (radiusBottom > 0) caps.push({ radius: radiusBottom, sign: -1 })
    }

    // Each cap has a centre vertex per segment, so every wedge gets its own uv
    const num = (rSegs + 1) * (hSegs + 1) + caps.length * (rSegs * 2 + 1)
    const numIndices = (rSegs * hSegs * 2 + caps.length * rSegs) * 3

    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      num > 65536 ? new Uint32Array(numIndices) : new Uint16Array(numIndices)

    let i = 0
    let ii = 0

    // The side normal leans up by the slope between the two radii
    const slope = (radiusBottom - radiusTop) / height
    const normalLength = Math.sqrt(1 + slope * slope)

    // Torso, top row first
    for (let iy = 0; iy <= hSegs; iy++) {
      const v = iy / hSegs
      const radius = v * (radiusBottom - radiusTop) + radiusTop
      for (let ix = 0; ix <= rSegs; ix++, i++) {
        const u = ix / rSegs
        const theta = thetaStart + u * thetaLength
        const sin = Math.sin(theta)
        const cos = Math.cos(theta)

        position[i * 3] = radius * sin
        position[i * 3 + 1] = halfHeight - v * height
        position[i * 3 + 2] = radius * cos

        normal[i * 3] = sin / normalLength
        normal[i * 3 + 1] = slope / normalLength
        normal[i * 3 + 2] = cos / normalLength

        uv[i * 2] = u
        uv[i * 2 + 1] = 1 - v
      }
    }

    for (let iy = 0; iy < hSegs; iy++) {
      for (let ix = 0; ix < rSegs; ix++) {
        const a = iy * (rSegs + 1) + ix
        const b = a + rSegs + 1
        const c = b + 1
        const d = a + 1

        index.set([a, b, d, b, c, d], ii * 3)
        ii += 2
      }
    }

    for (const { radius, sign } of caps) {
      const centre = i
      const y = halfHeight * sign

      for (let ix = 0; ix < rSegs; ix++, i++) {
        position[i * 3 + 1] = y
        normal[i * 3 + 1] = sign
        uv[i * 2] = 0.5
        uv[i * 2 + 1] = 0.5
      }

      const ring = i
      for (let ix = 0; ix <= rSegs; ix++, i++) {
        const theta = thetaStart + (ix / rSegs) * thetaLength
        const sin = Math.sin(theta)
        const cos = Math.cos(theta)

        position[i * 3] = radius * sin
        position[i * 3 + 1] = y
        position[i * 3 + 2] = radius * cos

        normal[i * 3 + 1] = sign

        uv[i * 2] = cos * 0.5 + 0.5
        uv[i * 2 + 1] = sin * 0.5 * sign + 0.5
      }

      // Seen from outside the cap, θ runs anticlockwise on the top and
      // clockwise on the bottom, so the bottom's winding is flipped
      for (let ix = 0; ix < rSegs; ix++, ii++) {
        const c = centre + ix
        const a = ring + ix
        const b = a + 1
        if (sign > 0) index.set([c, a, b], ii * 3)
        else index.set([c, b, a], ii * 3)
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
