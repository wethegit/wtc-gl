import { Uniform } from '../core/Uniform'

export interface LightsOptions {
  /**
   * The direction towards the directional light, in world space. It's
   * normalised.
   * @default [-0.45, 0.7, 0.55]
   */
  direction: [number, number, number]
  /** The directional light's colour. @default [1, 1, 1] */
  colour: [number, number, number]
  /** The directional light's strength. @default 0.75 */
  intensity: number
  /** The hemisphere light from above (world +Y). @default [0.3, 0.32, 0.36] */
  sky: [number, number, number]
  /** The hemisphere light from below. @default [0.1, 0.09, 0.08] */
  ground: [number, number, number]
  /** Flat light added everywhere. @default 0.05 */
  ambient: number
}

/**
 * The lights for `LitProgram`, or for a custom shader that uses
 * `litShading`: one directional light, a sky/ground hemisphere and flat
 * ambient light, all in world space.
 *
 * Pass the same `Lights` to every program that should share them. The
 * programs hold the same `Uniform` instances, so changing a light here
 * changes it everywhere, without allocating. A custom program adds them by
 * spreading `lights.uniforms` into its own uniforms.
 *
 * ```ts
 * const lights = new Lights({ direction: [-1, 1, 1], ambient: 0.1 })
 * const red = new LitProgram(gl, { lights, colour: [1, 0.2, 0.1] })
 * const shiny = new LitProgram(gl, { lights, specular: 0.6 })
 * lights.direction = [0, 1, 0] // both update
 * ```
 */
export class Lights {
  /** The light uniforms, shared by every program using these lights. */
  readonly uniforms: {
    u_lightDirection: Uniform
    u_lightColour: Uniform
    u_lightIntensity: Uniform
    u_skyColour: Uniform
    u_groundColour: Uniform
    u_ambient: Uniform
  }

  constructor({
    direction = [-0.45, 0.7, 0.55],
    colour = [1, 1, 1],
    intensity = 0.75,
    sky = [0.3, 0.32, 0.36],
    ground = [0.1, 0.09, 0.08],
    ambient = 0.05
  }: Partial<LightsOptions> = {}) {
    this.uniforms = {
      u_lightDirection: new Uniform({
        name: 'lightDirection',
        value: [0, 1, 0],
        kind: 'float_vec3'
      }),
      u_lightColour: new Uniform({
        name: 'lightColour',
        value: [...colour],
        kind: 'float_vec3'
      }),
      u_lightIntensity: new Uniform({
        name: 'lightIntensity',
        value: intensity,
        kind: 'float'
      }),
      u_skyColour: new Uniform({
        name: 'skyColour',
        value: [...sky],
        kind: 'float_vec3'
      }),
      u_groundColour: new Uniform({
        name: 'groundColour',
        value: [...ground],
        kind: 'float_vec3'
      }),
      u_ambient: new Uniform({
        name: 'ambient',
        value: ambient,
        kind: 'float'
      })
    }
    this.direction = direction
  }

  /** The direction towards the directional light, in world space. */
  get direction(): [number, number, number] {
    return [...(this.uniforms.u_lightDirection.value as number[])] as [
      number,
      number,
      number
    ]
  }
  set direction(value: ArrayLike<number>) {
    const length = Math.hypot(value[0], value[1], value[2]) || 1
    const d = this.uniforms.u_lightDirection.value as number[]
    d[0] = value[0] / length
    d[1] = value[1] / length
    d[2] = value[2] / length
  }

  /** The directional light's colour. */
  get colour(): [number, number, number] {
    return [...(this.uniforms.u_lightColour.value as number[])] as [
      number,
      number,
      number
    ]
  }
  set colour(value: ArrayLike<number>) {
    copy(this.uniforms.u_lightColour, value)
  }

  /** The directional light's strength. */
  get intensity(): number {
    return this.uniforms.u_lightIntensity.value as number
  }
  set intensity(value: number) {
    this.uniforms.u_lightIntensity.value = value
  }

  /** The hemisphere light from above. */
  get sky(): [number, number, number] {
    return [...(this.uniforms.u_skyColour.value as number[])] as [
      number,
      number,
      number
    ]
  }
  set sky(value: ArrayLike<number>) {
    copy(this.uniforms.u_skyColour, value)
  }

  /** The hemisphere light from below. */
  get ground(): [number, number, number] {
    return [...(this.uniforms.u_groundColour.value as number[])] as [
      number,
      number,
      number
    ]
  }
  set ground(value: ArrayLike<number>) {
    copy(this.uniforms.u_groundColour, value)
  }

  /** Flat light added everywhere. */
  get ambient(): number {
    return this.uniforms.u_ambient.value as number
  }
  set ambient(value: number) {
    this.uniforms.u_ambient.value = value
  }
}

/** Copy an RGB value into a uniform's existing array. */
function copy(uniform: Uniform, value: ArrayLike<number>) {
  const target = uniform.value as number[]
  target[0] = value[0]
  target[1] = value[1]
  target[2] = value[2]
}
