import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface TriangleOptions {
  attributes: WTCGLGeometryAttributeCollection
}

export class Triangle extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    { attributes = {} }: Partial<TriangleOptions> = {}
  ) {
    Object.assign(attributes, {
      position: new GeometryAttribute({
        size: 2,
        data: new Float32Array([-1, -1, 3, -1, -1, 3])
      }),
      uv: new GeometryAttribute({
        size: 2,
        data: new Float32Array([0, 0, 2, 0, 0, 2])
      })
    })

    super(gl, attributes)
  }
}
