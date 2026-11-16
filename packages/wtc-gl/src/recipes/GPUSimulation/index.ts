import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import { Geometry } from '../../geometry/Geometry'
import { GeometryAttribute } from '../../geometry/GeometryAttribute'
import { Triangle } from '../../geometry/Triangle'
import { Mesh } from '../../core/Mesh'
import { Program, type ProgramOptions } from '../../core/Program'
import { RenderTarget } from '../../core/RenderTarget'
import type { Texture } from '../../core/Texture'
import { Uniform } from '../../core/Uniform'

/**
 * The starting values for a {@link GPUSimulation}: a function of each item's
 * index and texel, giving a `vec4` per state (a plain array when there's one
 * state, otherwise an object by state name), or an array of data per state
 * name. Anything left out starts at 0.
 * @category Recipes
 */
export type GPUSimulationInitial =
  | ((
      index: number,
      x: number,
      y: number
    ) => ArrayLike<number> | Record<string, ArrayLike<number>>)
  | Record<string, Float32Array>

/**
 * Options for a {@link GPUSimulation}.
 * @category Recipes
 */
export interface GPUSimulationOptions {
  /**
   * The width and height of the state textures, in texels: one item per
   * texel. A number is square.
   * @default 64
   */
  size: number | [number, number]
  /**
   * The names of the state textures, at most 4. The step shader writes them
   * in this order (`layout(location = 0)` first), and reads each as
   * `b_<name>`.
   * @default ['state']
   */
  state: string[]
  /** The step shader (GLSL 3.00): reads `b_<name>`, writes each state. */
  fragment: string
  /** The step pass's vertex shader. Defaults to a full-screen pass that passes `v_uv`. */
  vertex: string
  /** More uniforms for the step shader, and for `points`. @default {} */
  uniforms: WTCGLUniformArray
  /** The starting state; see {@link GPUSimulationInitial}. Without it, everything starts at 0. */
  initial: GPUSimulationInitial
  /** The texture type: `gl.FLOAT`, or `gl.HALF_FLOAT` for half the memory. @default gl.FLOAT */
  type: number
  /** How reads past the edge wrap: `gl.REPEAT` for a world that wraps around. @default gl.CLAMP_TO_EDGE */
  wrap: number
  /** How the state textures are filtered when read. @default gl.NEAREST */
  filter: number
}

/**
 * Options for {@link GPUSimulation.points}: the program options, with the
 * shaders required.
 * @category Recipes
 */
export type GPUSimulationPointsOptions = Partial<ProgramOptions> &
  Pick<ProgramOptions, 'vertex' | 'fragment'>

const STEP_VERTEX = /* glsl */ `#version 300 es
in vec3 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position, 1.0);
}`

/**
 * A simulation that runs on the GPU, keeping its state in float textures:
 * one texel per item, up to 4 values per state texture, and up to 4 state
 * textures written in one pass. Each `step()` draws your fragment shader
 * over every texel, reading the last state and writing the next, then swaps
 * the two. Draw the results with `points()`, or read `b_<name>` in any shader.
 *
 * ```ts
 * const sim = new GPUSimulation(gl, {
 *   size: 128, // 16,384 particles
 *   state: ['position', 'velocity'],
 *   fragment: step, // layout(location = 0) out vec4 position; layout(location = 1) out vec4 velocity;
 *   initial: (i) => ({ position: [Math.random() - 0.5, Math.random() - 0.5, 0, 1] })
 * })
 * const particles = sim.points({ vertex, fragment })
 *
 * // each frame
 * sim.step(delta)
 * renderer.render({ scene: particles })
 * ```
 *
 * `sim.uniforms` holds `u_resolution` (the state size in texels), `u_time`
 * and `u_delta` (in seconds), a `b_<name>` sampler per state, and your own.
 * Spread them into any program: they're updated in place, so it always reads
 * the latest state. Float textures need `EXT_color_buffer_float`, which the
 * renderer turns on where it's available.
 * @category Recipes
 */
export class GPUSimulation {
  /** The rendering context. */
  gl: WTCGLRenderingContext
  /** The state's width and height, in texels. */
  size: [number, number]
  /** The number of items: one per texel. */
  count: number
  /** The names of the state textures. */
  state: string[]
  /** The uniforms: `u_resolution`, `u_time`, `u_delta`, `b_<name>` per state, and yours. */
  uniforms: WTCGLUniformArray
  /** The latest state textures, by name. */
  textures: Record<string, Texture> = {}
  /** Each item's texel centre in the state textures, as (x, y) pairs from 0 to 1. */
  references: Float32Array
  /** The program the step pass draws with. */
  program: Program

  /** The `u_time` uniform: the simulated time, in seconds. */
  u_time: Uniform
  /** The `u_delta` uniform: the last step's time, in seconds. */
  u_delta: Uniform
  /** The `u_resolution` uniform: the state size, in texels. */
  u_resolution: Uniform

  #initial?: GPUSimulationInitial
  #type: number
  #wrap: number
  #filter: number
  #read!: RenderTarget
  #write!: RenderTarget
  #samplers: Record<string, Uniform> = {}
  #mesh: Mesh
  #points: Mesh[] = []

  /**
   * Make the state textures and the step pass, and write the starting state.
   * @param gl - The rendering context.
   * @param options - The simulation's options; see {@link GPUSimulationOptions}.
   */
  constructor(
    gl: WTCGLRenderingContext,
    {
      size = 64,
      state = ['state'],
      fragment,
      vertex = STEP_VERTEX,
      uniforms = {},
      initial,
      type = gl.FLOAT,
      wrap = gl.CLAMP_TO_EDGE,
      filter = gl.NEAREST
    }: Partial<GPUSimulationOptions> & Pick<GPUSimulationOptions, 'fragment'>
  ) {
    if (state.length < 1 || state.length > 4) {
      throw new Error('A GPUSimulation has between 1 and 4 state textures')
    }
    this.gl = gl
    this.state = state
    this.#initial = initial
    this.#type = type
    this.#wrap = wrap
    this.#filter = filter

    this.u_time = new Uniform({ name: 'u_time', value: 0, kind: 'float' })
    this.u_delta = new Uniform({ name: 'u_delta', value: 0, kind: 'float' })
    this.u_resolution = new Uniform({
      name: 'u_resolution',
      value: [1, 1],
      kind: 'float_vec2'
    })
    for (const name of state) {
      this.#samplers[name] = new Uniform({
        name: `b_${name}`,
        value: null as unknown as Texture,
        kind: 'texture'
      })
    }
    this.uniforms = {
      ...uniforms,
      u_time: this.u_time,
      u_delta: this.u_delta,
      u_resolution: this.u_resolution,
      ...Object.fromEntries(
        state.map((name) => [`b_${name}`, this.#samplers[name]])
      )
    }

    this.program = new Program(gl, {
      vertex,
      fragment,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false
    })
    this.#mesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: this.program,
      frustumCulled: false
    })

    this.size = [0, 0]
    this.count = 0
    this.references = new Float32Array(0)
    this.resize(size)
  }

  /**
   * Advance the simulation: draw the step shader over every texel, reading
   * the current state and writing the next, then swap. `u_time` grows by
   * `delta` and `u_delta` is set to it.
   * @param delta - The time to step by, in seconds. Defaults to 1/60.
   */
  step(delta: number = 1 / 60): void {
    this.u_delta.value = delta
    this.u_time.value = (this.u_time.value as number) + delta
    this.gl.renderer.render({
      scene: this.#mesh,
      target: this.#write,
      clear: false
    })
    const read = this.#read
    this.#read = this.#write
    this.#write = read
    this.#bindState()
  }

  /**
   * A mesh that draws one point per item. Its program gets the simulation's
   * uniforms (so `b_<name>` is the latest state) plus any of yours, and a
   * `reference` attribute: the item's texel in the state textures, to read
   * its state with `texture(b_position, reference)`.
   * @param options - The program options, with the vertex and fragment shaders.
   * @returns The points mesh. The simulation frees it in `remove()`.
   */
  points({ uniforms = {}, ...options }: GPUSimulationPointsOptions): Mesh {
    const program = new Program(this.gl, {
      ...options,
      uniforms: { ...this.uniforms, ...uniforms }
    })
    const geometry = new Geometry(this.gl, {
      // Points are placed by the vertex shader; this only sets the count
      position: new GeometryAttribute({
        size: 3,
        data: new Float32Array(this.count * 3)
      }),
      reference: new GeometryAttribute({ size: 2, data: this.references })
    })
    const mesh = new Mesh(this.gl, {
      geometry,
      program,
      mode: this.gl.POINTS,
      frustumCulled: false
    })
    this.#points.push(mesh)
    return mesh
  }

  /** Write the starting state again, and set `u_time` back to 0. */
  reset(): void {
    const [width] = this.size
    const data = this.state.map(() => new Float32Array(this.count * 4))
    const initial = this.#initial
    if (typeof initial === 'function') {
      for (let index = 0; index < this.count; index++) {
        const x = index % width
        const y = Math.floor(index / width)
        const values = initial(index, x, y)
        this.state.forEach((name, s) => {
          const v = isArrayLike(values)
            ? s === 0
              ? values
              : undefined
            : values[name]
          if (v)
            for (let k = 0; k < 4 && k < v.length; k++)
              data[s][index * 4 + k] = v[k]
        })
      }
    } else if (initial) {
      this.state.forEach((name, s) => {
        const values = initial[name]
        if (values) data[s].set(values.subarray(0, data[s].length))
      })
    }

    // Upload into the current state's textures now, rather than whenever
    // each is next read, so a state the step shader doesn't read can't be
    // overwritten later. Half-float textures take float data.
    this.#read.textures.forEach((texture, s) => {
      texture.type = this.gl.FLOAT
      texture.data = data[s]
      texture.needsUpdate = true
      texture.update()
    })
    this.u_time.value = 0
    this.u_delta.value = 0
  }

  /**
   * Change the number of items. The state is made again and reset.
   * @param size - The new width and height in texels, or one number for a square.
   */
  resize(size: number | [number, number]): void {
    const [width, height] = typeof size === 'number' ? [size, size] : size
    this.#read?.remove()
    this.#write?.remove()
    this.size = [width, height]
    this.count = width * height
    this.u_resolution.value = [width, height]

    const gl = this.gl
    const target = () =>
      new RenderTarget(gl, {
        width,
        height,
        colour: this.state.length,
        type: this.#type,
        format: gl.RGBA,
        internalFormat: this.#type === gl.FLOAT ? gl.RGBA32F : gl.RGBA16F,
        minFilter: this.#filter,
        magFilter: this.#filter,
        wrapS: this.#wrap,
        wrapT: this.#wrap,
        depth: false,
        generateMipmaps: false
      })
    this.#read = target()
    this.#write = target()

    this.references = new Float32Array(this.count * 2)
    for (let index = 0; index < this.count; index++) {
      this.references[index * 2] = ((index % width) + 0.5) / width
      this.references[index * 2 + 1] =
        (Math.floor(index / width) + 0.5) / height
    }
    this.reset()
    this.#bindState()
  }

  /**
   * Free the state textures, the step pass, and the meshes `points` made.
   */
  remove(): void {
    this.#read.remove()
    this.#write.remove()
    this.#mesh.geometry.remove()
    this.program.remove()
    for (const mesh of this.#points) {
      mesh.geometry.remove()
      mesh.program.remove()
    }
    this.#points = []
  }

  /** Point `b_<name>` and `textures` at the current state. */
  #bindState(): void {
    this.state.forEach((name, s) => {
      const texture = this.#read.textures[s]
      this.#samplers[name].value = texture
      this.textures[name] = texture
    })
  }
}

const isArrayLike = (
  value: ArrayLike<number> | Record<string, ArrayLike<number>>
): value is ArrayLike<number> =>
  Array.isArray(value) || ArrayBuffer.isView(value)
