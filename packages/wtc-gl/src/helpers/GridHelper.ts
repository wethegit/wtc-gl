import type { WTCGLRenderingContext } from '../types'
import { Mesh } from '../core/Mesh'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'
import { lineProgram } from './lineProgram'

type RGB = [number, number, number]

export interface GridHelperOptions {
  /** The width and depth of the grid. @default 10 */
  size: number
  /** The number of squares along each side. @default 10 */
  divisions: number
  /** @default [0.6, 0.6, 0.6] */
  colour: RGB
  /** The colour of the two lines through the centre. @default [0.35, 0.35, 0.35] */
  centreColour: RGB
}

/**
 * A square grid of lines on the XZ plane, centred on the origin, like a
 * floor. The lines through the centre, when there are any, get
 * `centreColour`. Drawn with `gl.LINES`, so the lines are one pixel wide, and
 * pulled slightly towards the camera so it can lie on a surface. It needs a
 * camera to draw.
 */
export class GridHelper extends Mesh {
  constructor(
    gl: WTCGLRenderingContext,
    {
      size = 10,
      divisions = 10,
      colour = [0.6, 0.6, 0.6],
      centreColour = [0.35, 0.35, 0.35]
    }: Partial<GridHelperOptions> = {}
  ) {
    const half = size / 2
    const step = size / divisions
    const lines = divisions + 1
    const position = new Float32Array(lines * 2 * 2 * 3)
    const colours = new Float32Array(lines * 2 * 2 * 3)

    let v = 0
    const vertex = (x: number, z: number, c: RGB) => {
      position.set([x, 0, z], v * 3)
      colours.set(c, v * 3)
      v++
    }
    for (let i = 0; i < lines; i++) {
      const t = -half + i * step
      const c = i * 2 === divisions ? centreColour : colour
      // Along x, then along z
      vertex(-half, t, c)
      vertex(half, t, c)
      vertex(t, -half, c)
      vertex(t, half, c)
    }

    super(gl, {
      geometry: new Geometry(gl, {
        position: new GeometryAttribute({ size: 3, data: position }),
        colour: new GeometryAttribute({ size: 3, data: colours })
      }),
      program: lineProgram(gl, { vertexColours: true }),
      mode: gl.LINES
    })
  }
}
