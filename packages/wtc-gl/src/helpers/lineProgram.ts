import type { WTCGLRenderingContext } from '../types'
import { Program } from '../core/Program'
import { Uniform } from '../core/Uniform'

import lineVertex from './line.vert'
import lineFragment from './line.frag'

export interface LineProgramOptions {
  colour: [number, number, number]
  opacity: number
  vertexColours: boolean
  /** Replaces the vertex shader, e.g. the normals helpers' */
  vertex: string
  /** Extra uniforms for a replacement vertex shader */
  uniforms: Record<string, Uniform>
}

/**
 * The unlit program the helpers draw their lines with: `u_colour` ×
 * `u_opacity`, times a `colour` attribute with `vertexColours`. Internal.
 */
export function lineProgram(
  gl: WTCGLRenderingContext,
  {
    colour = [1, 1, 1],
    opacity = 1,
    vertexColours = false,
    vertex = lineVertex,
    uniforms = {}
  }: Partial<LineProgramOptions> = {}
): Program {
  const defines = vertexColours ? '#define VERTEX_COLOURS\n' : ''
  return new Program(gl, {
    vertex: `#version 300 es\n${defines}${vertex}`,
    fragment: `#version 300 es\n${defines}${lineFragment}`,
    uniforms: {
      u_colour: new Uniform({
        name: 'colour',
        value: [...colour],
        kind: 'float_vec3'
      }),
      u_opacity: new Uniform({
        name: 'opacity',
        value: opacity,
        kind: 'float'
      }),
      u_premultiplied: new Uniform({
        name: 'premultiplied',
        value: gl.renderer?.premultipliedAlpha ? 1 : 0,
        kind: 'float'
      }),
      ...uniforms
    },
    transparent: opacity < 1,
    // Lines have no faces to cull
    cullFace: 0
  })
}
