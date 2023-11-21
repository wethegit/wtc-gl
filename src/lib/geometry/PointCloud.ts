import type { WTCGLRenderingContext } from '../types'
import { TransformFeedback } from '../core/TransformFeedback'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

export interface PointCloudOptions {
  particles: number
  dimensions: number
  fillFunction: (p: Float32Array, d: number) => void
  attributes: object
  transformFeedbacks: TransformFeedback
}

export class PointCloud extends Geometry {
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
      attributes = {},
      transformFeedbacks
    }: Partial<PointCloudOptions> = {}
  ) {
    const points = new Float32Array(particles * dimensions).fill(0) // The point position

    fillFunction(points, dimensions)

    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({ size: dimensions, data: points })
    })

    super(gl, attr, transformFeedbacks)
  }
}
