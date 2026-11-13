import type { WTCGLRenderingContext } from '../types'
import { Program } from '../core/Program'
import { Texture } from '../core/Texture'
import { Uniform } from '../core/Uniform'
import { blankTexture } from '../core/blankTexture'
import { Lights } from './Lights'

import shadingSource from './lit-shading.glsl'
import litVertex from './lit.vert'
import litFragment from './lit.frag'

/**
 * The lighting `LitProgram` uses, as GLSL for custom shaders: the `Lights`
 * uniforms and
 *
 * `vec3 litShade(base, normal, view, viewRotation, specular, shininess)`
 *
 * where `normal` and `view` (towards the camera) are view-space unit vectors
 * and `viewRotation` is `mat3(u_viewMatrix)`. Add it after the shader's
 * precision statement, and spread `lights.uniforms` into the program's
 * uniforms. It doesn't declare `u_viewMatrix`, so the shader can.
 */
export const litShading: string = shadingSource

export interface LitProgramOptions {
  /** The lights to share. @default a new `Lights()` */
  lights: Lights
  /** The surface colour. @default [1, 1, 1] */
  colour: [number, number, number]
  /** @default 1 */
  opacity: number
  /** A texture multiplied with the colour, read with the `uv` attribute. */
  map: Texture | null
  /** The strength of a Blinn-Phong highlight. 0 is plain Lambert. @default 0 */
  specular: number
  /** How tight the highlight is. @default 32 */
  shininess: number
  /** Discard fragments with a lower alpha. @default 0 */
  alphaTest: number
  /** Multiply by a `colour` attribute (vec3). @default false */
  vertexColours: boolean
  /** Shade each triangle flat, from its face normal. @default false */
  flatShading: boolean
  /** Draw and light the back faces too. @default false */
  doubleSided: boolean
  /**
   * Read each instance's matrix and colour from `InstancedMesh`. The colour
   * multiplies the surface colour. @default false
   */
  instanced: boolean
  /** @default opacity < 1 */
  transparent: boolean
  /** @default true */
  depthTest: boolean
  /** @default true */
  depthWrite: boolean
}

/**
 * A program that lights any mesh with a `position` and `normal`: Lambert
 * diffuse, an optional Blinn-Phong highlight, and a colour, a texture `map`
 * (read with `uv`) or both. The light comes from `Lights`, one directional
 * light, a sky/ground hemisphere and ambient, which many programs can share.
 *
 * ```ts
 * const lights = new Lights()
 * const mesh = new Mesh(gl, {
 *   geometry: new Sphere(gl),
 *   program: new LitProgram(gl, { lights, colour: [1, 0.4, 0.2], specular: 0.5 })
 * })
 * ```
 *
 * It needs a camera to draw: the lighting is done in view space, from the
 * matrices the mesh sets. `vertexColours`, `flatShading`, `doubleSided` and
 * `instanced` (for `InstancedMesh`) change the shaders, so they're fixed when
 * the program is made. The colour, opacity, map, specular and shininess can
 * be changed at any time.
 *
 * For a custom shader with the same lighting, use `litShading`.
 */
export class LitProgram extends Program {
  /** The lights, whose uniforms this program shares. */
  readonly lights: Lights

  constructor(
    gl: WTCGLRenderingContext,
    {
      lights = new Lights(),
      colour = [1, 1, 1],
      opacity = 1,
      map = null,
      specular = 0,
      shininess = 32,
      alphaTest = 0,
      vertexColours = false,
      flatShading = false,
      doubleSided = false,
      instanced = false,
      transparent = opacity < 1,
      depthTest = true,
      depthWrite = true
    }: Partial<LitProgramOptions> = {}
  ) {
    const uniforms: Record<string, Uniform> = {
      ...lights.uniforms,
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
      u_map: new Uniform({
        name: 'map',
        value: map ?? blankTexture(gl),
        kind: 'texture'
      }),
      u_useMap: new Uniform({
        name: 'useMap',
        value: map ? 1 : 0,
        kind: 'float'
      }),
      u_specular: new Uniform({
        name: 'specular',
        value: specular,
        kind: 'float'
      }),
      u_shininess: new Uniform({
        name: 'shininess',
        value: shininess,
        kind: 'float'
      }),
      u_alphaTest: new Uniform({
        name: 'alphaTest',
        value: alphaTest,
        kind: 'float'
      }),
      u_premultiplied: new Uniform({
        name: 'premultiplied',
        value: gl.renderer?.premultipliedAlpha ? 1 : 0,
        kind: 'float'
      })
    }

    const defines =
      (flatShading ? '#define FLAT_SHADING\n' : '') +
      (vertexColours ? '#define VERTEX_COLOURS\n' : '') +
      (doubleSided ? '#define DOUBLE_SIDED\n' : '') +
      (instanced ? '#define INSTANCED\n' : '')

    super(gl, {
      vertex: `#version 300 es\n${defines}${litVertex}`,
      fragment: `#version 300 es\n${defines}precision highp float;\n${litShading}\n${litFragment}`,
      uniforms,
      transparent,
      depthTest,
      depthWrite,
      cullFace: doubleSided ? 0 : gl.BACK
    })

    this.lights = lights
  }

  /** The surface colour. */
  get colour(): [number, number, number] {
    return [...(this.uniforms.u_colour.value as number[])] as [
      number,
      number,
      number
    ]
  }
  set colour(value: ArrayLike<number>) {
    const c = this.uniforms.u_colour.value as number[]
    c[0] = value[0]
    c[1] = value[1]
    c[2] = value[2]
  }

  get opacity(): number {
    return this.uniforms.u_opacity.value as number
  }
  set opacity(value: number) {
    this.uniforms.u_opacity.value = value
  }

  /** The texture multiplied with the colour, or null for none. */
  get map(): Texture | null {
    return this.uniforms.u_useMap.value
      ? (this.uniforms.u_map.value as Texture)
      : null
  }
  set map(value: Texture | null) {
    this.uniforms.u_map.value = value ?? blankTexture(this.gl)
    this.uniforms.u_useMap.value = value ? 1 : 0
  }

  /** The strength of the Blinn-Phong highlight. 0 is plain Lambert. */
  get specular(): number {
    return this.uniforms.u_specular.value as number
  }
  set specular(value: number) {
    this.uniforms.u_specular.value = value
  }

  /** How tight the highlight is. */
  get shininess(): number {
    return this.uniforms.u_shininess.value as number
  }
  set shininess(value: number) {
    this.uniforms.u_shininess.value = value
  }
}
