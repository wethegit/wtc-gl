import type { WTCGLRenderingContext } from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

/**
 * Options for creating a {@link PointCloud}.
 * @category Geometry
 */
export interface PointCloudOptions {
  /** Number of points. @default 128 */
  particles: number
  /** Components per point, which is the `position` attribute's size. @default 3 */
  dimensions: number
  /** Fills the zeroed positions array, given it and `dimensions`. By default every component is a random number from 0 to 1. */
  fillFunction: (p: Float32Array, d: number) => void
  /** Extra attributes to add. The generated `position` replaces any with the same name. @default {} */
  attributes: object
}

/**
 * A set of points with only a `position` attribute, for drawing with
 * `gl.POINTS`. The positions are filled by `fillFunction`.
 * @category Geometry
 */
export class PointCloud extends Geometry {
  /**
   * Create a point cloud
   * @param gl - The WTCGL rendering context
   * @param options - The number of points and how to fill them; see {@link PointCloudOptions}.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      particles = 128,
      dimensions = 3,
      fillFunction = (points, dimensions) => {
        for (let i = 0; i < points.length; i += dimensions) {
          for (let j = 0; j < dimensions; j++) {
            points[i + j] = Math.random() // n position
          }
        }
      },
      attributes = {}
    }: Partial<PointCloudOptions> = {}
  ) {
    const points = new Float32Array(particles * dimensions).fill(0) // The point position

    fillFunction(points, dimensions)

    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({ size: dimensions, data: points })
    })

    super(gl, attr)
  }
}
