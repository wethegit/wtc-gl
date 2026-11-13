import type { WTCGLRenderingContext } from '../types'
import { Mesh } from '../core/Mesh'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'
import { lineProgram } from './lineProgram'

type RGB = [number, number, number]

export interface AxesHelperOptions {
  /** The length of each axis. @default 1 */
  size: number
  /** Extend each axis through the origin to -size as well. @default false */
  symmetric: boolean
  /** @default red */
  xColour: RGB
  /** @default green */
  yColour: RGB
  /** @default blue */
  zColour: RGB
}

/**
 * The x, y and z axes as red, green and blue lines from the origin. Add it to
 * the scene to show the world's axes, or as a child of an object to show its
 * local frame. Drawn with `gl.LINES`, so the lines are one pixel wide. It
 * needs a camera to draw.
 */
export class AxesHelper extends Mesh {
  constructor(
    gl: WTCGLRenderingContext,
    {
      size = 1,
      symmetric = false,
      xColour = [0.95, 0.3, 0.3],
      yColour = [0.35, 0.8, 0.35],
      zColour = [0.3, 0.5, 1]
    }: Partial<AxesHelperOptions> = {}
  ) {
    const start = symmetric ? -size : 0
    // prettier-ignore
    const position = new Float32Array([
      start, 0, 0, size, 0, 0,
      0, start, 0, 0, size, 0,
      0, 0, start, 0, 0, size
    ])
    const colour = new Float32Array(
      [xColour, xColour, yColour, yColour, zColour, zColour].flat()
    )

    super(gl, {
      geometry: new Geometry(gl, {
        position: new GeometryAttribute({ size: 3, data: position }),
        colour: new GeometryAttribute({ size: 3, data: colour })
      }),
      program: lineProgram(gl, { vertexColours: true }),
      mode: gl.LINES
    })
  }
}
