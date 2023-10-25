import { WTCGLRenderingContext } from '../types'
import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

class Triangle extends Geometry {
  constructor(gl: WTCGLRenderingContext, { attributes = {} } = {}) {
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

export { Triangle }
