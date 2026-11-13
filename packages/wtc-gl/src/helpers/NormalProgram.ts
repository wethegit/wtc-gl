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
 * a mesh in place of its own program to check its normals. Changing an option
 * recompiles the shaders with `setShaders`. It needs a camera to draw.
 */
export class NormalProgram extends Program {
  #options: NormalProgramOptions

  constructor(
    gl: WTCGLRenderingContext,
    {
      space = 'view',
      flatShading = false,
      doubleSided = false,
      instanced = false
    }: Partial<NormalProgramOptions> = {}
  ) {
    const options = { space, flatShading, doubleSided, instanced }
    super(gl, {
      ...normalSources(options),
      cullFace: doubleSided ? 0 : gl.BACK
    })
    this.#options = options
  }

  /** The space the normals are shown in. Recompiles. */
  get space(): 'view' | 'world' {
    return this.#options.space
  }
  set space(value: 'view' | 'world') {
    this.#set('space', value)
  }

  /** Show each triangle's face normal. Recompiles. */
  get flatShading(): boolean {
    return this.#options.flatShading
  }
  set flatShading(value: boolean) {
    this.#set('flatShading', value)
  }

  /** Draw the back faces too, with their normals flipped. Recompiles. */
  get doubleSided(): boolean {
    return this.#options.doubleSided
  }
  set doubleSided(value: boolean) {
    if (this.#set('doubleSided', value)) {
      this.cullFace = value ? 0 : this.gl.BACK
    }
  }

  /** Read each instance's matrix from `InstancedMesh`. Recompiles. */
  get instanced(): boolean {
    return this.#options.instanced
  }
  set instanced(value: boolean) {
    this.#set('instanced', value)
  }

  /** Change one option and recompile. Returns whether it changed. */
  #set<K extends keyof NormalProgramOptions>(
    key: K,
    value: NormalProgramOptions[K]
  ): boolean {
    if (this.#options[key] === value) return false
    this.#options = { ...this.#options, [key]: value }
    this.setShaders(normalSources(this.#options))
    return true
  }
}

/** The vertex and fragment sources for a set of options. */
function normalSources(options: NormalProgramOptions) {
  const defines =
    (options.space === 'world' ? '#define WORLD_SPACE\n' : '') +
    (options.flatShading ? '#define FLAT_SHADING\n' : '') +
    (options.doubleSided ? '#define DOUBLE_SIDED\n' : '') +
    (options.instanced ? '#define INSTANCED\n' : '')
  return {
    vertex: `#version 300 es\n${defines}${normalVertex}`,
    fragment: `#version 300 es\n${defines}${normalFragment}`
  }
}
