import { WTCGLRenderingContext } from '../types'
import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

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
      attributes = {}
    }: {
      particles?: number
      dimensions?: number
      fillFunction?: any
      attributes?: {}
    } = {}
  ) {
    const points = new Float32Array(particles * dimensions).fill(0) // The point position

    fillFunction(points, dimensions)

    Object.assign(attributes, {
      position: new GeometryAttribute({ size: dimensions, data: points })
    })

    super(gl, attributes)
  }
}
