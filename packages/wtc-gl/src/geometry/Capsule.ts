import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'
import { Lathe } from './Lathe'

export interface CapsuleOptions {
  radius: number
  height: number
  capSegments: number
  radialSegments: number
  heightSegments: number
  attributes: WTCGLGeometryAttributeCollection
}

/**
 * A capsule along the y axis, centred on the origin: a cylinder with a
 * hemisphere on each end. `height` is the whole length, tip to tip, like
 * `Cylinder`. A height under `2 * radius` gives a sphere of that radius.
 * `capSegments` are the steps in each quarter circle, and `heightSegments` the
 * steps along the straight part.
 */
export class Capsule extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      radius = 0.25,
      height = 1,
      capSegments = 4,
      radialSegments = 8,
      heightSegments = 1,
      attributes = {}
    }: Partial<CapsuleOptions> = {}
  ) {
    const half = Math.max(0, height - radius * 2) / 2

    // The profile, bottom pole to top pole, with exact normals for the caps.
    // Points shared between the parts aren't repeated, and the straight part
    // is left out when there isn't one.
    const points: [number, number][] = []
    const normals: [number, number][] = []
    const arc = (y: number, from: number) => {
      // The top arc starts where the profile already is
      for (let k = points.length ? 1 : 0; k <= capSegments; k++) {
        const a = from + (k / capSegments) * (Math.PI / 2)
        const sin = Math.sin(a)
        // Snap the poles onto the axis
        const cos = Math.abs(sin) === 1 ? 0 : Math.cos(a)
        points.push([radius * cos, y + radius * sin])
        normals.push([cos, sin])
      }
    }

    arc(-half, -Math.PI / 2)
    if (half > 0) {
      for (let k = 1; k <= heightSegments; k++) {
        points.push([radius, -half + (k / heightSegments) * half * 2])
        normals.push([1, 0])
      }
    }
    arc(half, 0)

    const { position, normal, uv, index } = Lathe.build(
      points,
      radialSegments,
      0,
      Math.PI * 2,
      normals
    )

    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({ size: 3, data: position }),
      normal: new GeometryAttribute({ size: 3, data: normal }),
      uv: new GeometryAttribute({ size: 2, data: uv }),
      index: new GeometryAttribute({ data: index })
    })

    super(gl, attr)
  }
}
