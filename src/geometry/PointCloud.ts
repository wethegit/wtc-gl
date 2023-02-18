import { WTCGLRenderingContext } from '../types'
import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'
import { TransformFeedback } from '../core/TransformFeedback'

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
    }: {
      particles?: number
      dimensions?: number
      fillFunction?: any
      attributes?: {}
      transformFeedbacks?: TransformFeedback
    } = {}
  ) {
    const points = new Float32Array(particles * dimensions).fill(0) // The point position

    fillFunction(points, dimensions)

    Object.assign(attributes, {
      position: new GeometryAttribute({ size: dimensions, data: points })
    })

    super(gl, attributes, transformFeedbacks)
  }
}
