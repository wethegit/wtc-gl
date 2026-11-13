import type { WTCGLGeometryAttribute, WTCGLRenderingContext } from '../types'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'

/**
 * Read component `c` of vertex `i` from an attribute, packed or strided.
 * Internal to the normals helpers.
 */
export function reader(attr: WTCGLGeometryAttribute) {
  const bytes = attr.data.BYTES_PER_ELEMENT
  const per = attr.stride ? attr.stride / bytes : attr.size
  const start = (attr.offset || 0) / bytes
  const data = attr.data
  return (i: number, c: number) => data[start + i * per + c]
}

/**
 * Throw unless an attribute's values are on the CPU.
 */
export function readable(
  attr: WTCGLGeometryAttribute | undefined,
  name: string,
  helper: string
): WTCGLGeometryAttribute {
  if (!attr?.data) throw new Error(`${helper}: the geometry has no ${name}`)
  if (attr.external) {
    throw new Error(
      `${helper}: the geometry's ${name} is external, so it can't be read`
    )
  }
  return attr
}

/**
 * A line per point, along its normal: each point twice, with `side` 0 and 1,
 * for normals.vert to move the second out along the normal.
 */
export function normalLines(
  gl: WTCGLRenderingContext,
  points: Float32Array,
  normals: Float32Array
): Geometry {
  const count = points.length / 3
  const position = new Float32Array(count * 6)
  const normal = new Float32Array(count * 6)
  const side = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      position[i * 6 + c] = position[i * 6 + 3 + c] = points[i * 3 + c]
      normal[i * 6 + c] = normal[i * 6 + 3 + c] = normals[i * 3 + c]
    }
    side[i * 2 + 1] = 1
  }
  return new Geometry(gl, {
    position: new GeometryAttribute({ size: 3, data: position }),
    normal: new GeometryAttribute({ size: 3, data: normal }),
    side: new GeometryAttribute({ size: 1, data: side })
  })
}
