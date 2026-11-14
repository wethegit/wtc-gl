import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

/**
 * Options for creating a {@link Triangle}.
 * @category Geometry
 */
export interface TriangleOptions {
  /** Extra attributes to add. The generated `position` and `uv` replace any with the same name. @default {} */
  attributes: WTCGLGeometryAttributeCollection
}

/**
 * A single triangle that covers clip space, -1 to 1 on x and y, for drawing a
 * full-screen fragment shader. It has 2D positions and uvs that run from 0 to 1
 * across the covered area.
 * @category Geometry
 */
export class Triangle extends Geometry {
  /**
   * Create a full-screen triangle
   * @param gl - The WTCGL rendering context
   * @param options - Extra attributes; see {@link TriangleOptions}.
   */
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
