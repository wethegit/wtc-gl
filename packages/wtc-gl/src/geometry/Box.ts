import type { WTCGLRenderingContext } from '../types'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'
import { Plane } from './Plane'

/**
 * Options for creating a {@link Box}.
 * @category Geometry
 */
export interface BoxOptions {
  /** Size along x. @default 1 */
  width: number
  /** Size along y. @default 1 */
  height: number
  /** Size along z. @default 1 */
  depth: number
  /** Number of divisions along x. @default 1 */
  widthSegments: number
  /** Number of divisions along y. @default 1 */
  heightSegments: number
  /** Number of divisions along z. @default 1 */
  depthSegments: number
  /** Extra attributes to add. The generated `position`, `normal`, `uv` and `index` replace any with the same name. @default {} */
  attributes: object
}

/**
 * A box centred on the origin. Each face is a separate grid, so the edges are
 * hard and each face has its own uvs from 0 to 1.
 * @category Geometry
 */
export class Box extends Geometry {
  /**
   * Create a box
   * @param gl - The WTCGL rendering context
   * @param options - Size and divisions; see {@link BoxOptions}.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      width = 1,
      height = 1,
      depth = 1,
      widthSegments = 1,
      heightSegments = 1,
      depthSegments = 1,
      attributes = {}
    }: Partial<BoxOptions> = {}
  ) {
    const wSegs = widthSegments
    const hSegs = heightSegments
    const dSegs = depthSegments

    const num =
      (wSegs + 1) * (hSegs + 1) * 2 +
      (wSegs + 1) * (dSegs + 1) * 2 +
      (hSegs + 1) * (dSegs + 1) * 2
    const numIndices =
      (wSegs * hSegs * 2 + wSegs * dSegs * 2 + hSegs * dSegs * 2) * 6

    const position = new Float32Array(num * 3)
    const normal = new Float32Array(num * 3)
    const uv = new Float32Array(num * 2)
    const index =
      num > 65536 ? new Uint32Array(numIndices) : new Uint16Array(numIndices)

    let i = 0
    let ii = 0

    // left, right
    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      depth,
      height,
      width,
      dSegs,
      hSegs,
      2,
      1,
      0,
      -1,
      -1,
      i,
      ii
    )
    i += (dSegs + 1) * (hSegs + 1)
    ii += dSegs * hSegs

    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      depth,
      height,
      -width,
      dSegs,
      hSegs,
      2,
      1,
      0,
      1,
      -1,
      i,
      ii
    )
    i += (dSegs + 1) * (hSegs + 1)
    ii += dSegs * hSegs

    // top, bottom
    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      width,
      depth,
      height,
      dSegs,
      wSegs,
      0,
      2,
      1,
      1,
      1,
      i,
      ii
    )
    i += (wSegs + 1) * (dSegs + 1)
    ii += wSegs * dSegs

    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      width,
      depth,
      -height,
      dSegs,
      wSegs,
      0,
      2,
      1,
      1,
      -1,
      i,
      ii
    )
    i += (wSegs + 1) * (dSegs + 1)
    ii += wSegs * dSegs

    // front, back
    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      width,
      height,
      -depth,
      wSegs,
      hSegs,
      0,
      1,
      2,
      -1,
      -1,
      i,
      ii
    )
    i += (wSegs + 1) * (hSegs + 1)
    ii += wSegs * hSegs

    Plane.buildPlane(
      position,
      normal,
      uv,
      index,
      width,
      height,
      depth,
      wSegs,
      hSegs,
      0,
      1,
      2,
      1,
      -1,
      i,
      ii
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
