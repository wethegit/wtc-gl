import type { WTCGLRenderingContext } from '../types'
import { Program } from '../core/Program'

import normalVertex from './normal.vert'
import normalFragment from './normal.frag'

export interface NormalProgramOptions {
  /**
   * The space the normals are shown in. In `'view'` space the colours follow
   * the camera; in `'world'` space they stay put as the camera moves.
   * @default 'view'
   */
  space: 'view' | 'world'
  /** Show each triangle's face normal. @default false */
  flatShading: boolean
  /** Draw the back faces too, with their normals flipped. @default false */
  doubleSided: boolean
  /** Read each instance's matrix from `InstancedMesh`. @default false */
  instanced: boolean
}

/**
 * A debugging program that colours a mesh by its normals: each axis from -1
 * to 1 becomes a colour channel from 0 to 1, so a normal pointing along +x is
 * pink-red, +y is light green and +z is lilac-blue.
 *
 * One `NormalProgram` can be shared by any number of meshes, and swapped onto
 * a mesh in place of its own program to check its normals. The options change
 * the shaders, so they're fixed when the program is made. It needs a camera
 * to draw.
 */
export class NormalProgram extends Program {
  constructor(
    gl: WTCGLRenderingContext,
    {
      space = 'view',
      flatShading = false,
      doubleSided = false,
      instanced = false
    }: Partial<NormalProgramOptions> = {}
  ) {
    const defines =
      (space === 'world' ? '#define WORLD_SPACE\n' : '') +
      (flatShading ? '#define FLAT_SHADING\n' : '') +
      (doubleSided ? '#define DOUBLE_SIDED\n' : '') +
      (instanced ? '#define INSTANCED\n' : '')

    super(gl, {
      vertex: `#version 300 es\n${defines}${normalVertex}`,
      fragment: `#version 300 es\n${defines}${normalFragment}`,
      cullFace: doubleSided ? 0 : gl.BACK
    })
  }
}
