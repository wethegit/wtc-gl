import type {
  WTCGLRenderingContext,
  WTCGLGeometryAttributeCollection
} from '../types'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'

import { Program } from './Program'

/**
 * A per-vertex value the simulation reads, updates and writes back.
 */
export interface TransformFeedbackAttribute {
  /**
   * The number of components per vertex, from 1 to 4.
   */
  size: number
  /**
   * The starting values: `count * size` floats.
   */
  data: Float32Array
  /**
   * The vertex shader output captured back into this attribute. It must be
   * one of the program's `transformFeedbackVaryings`.
   */
  varying: string
}

export interface TransformFeedbackOptions {
  /**
   * The simulation program. Its `transformFeedbackVaryings` must name every
   * attribute's `varying`, and its `transformFeedbackBufferMode` decides
   * whether the attributes share one buffer.
   */
  program: Program
  /**
   * The attributes the simulation updates, keyed by their name in the
   * vertex shader.
   */
  attributes: Record<string, TransformFeedbackAttribute>
  /**
   * Attributes the simulation reads but doesn't change, such as a rest
   * position or a random seed.
   */
  staticAttributes?: WTCGLGeometryAttributeCollection
  /**
   * The number of vertices to simulate. Defaults to the length of the first
   * attribute's data.
   */
  count?: number
  /**
   * The buffer usage hint.
   * @default gl.DYNAMIC_COPY
   */
  usage?: GLenum
}

// Passed to program.use() rather than relying on its default, which would
// allocate on every step
const USE_OPTIONS = { flipFaces: false }

// One half of the ping-pong: the buffers it holds, the geometry that reads
// them as attributes, and the transform feedback object that writes them
interface Side {
  buffers: WebGLBuffer[]
  feedback: WebGLTransformFeedback
  geometry: Geometry
  attributes: Record<string, GeometryAttribute>
}

/**
 * Runs a vertex shader over a set of per-vertex attributes and writes the
 * results back, entirely on the GPU. Use it for particles, flocking or any
 * other simulation where each vertex updates itself from its last state.
 *
 * Each `step()` runs the program once with rasterisation turned off, reading
 * the last results and capturing the outputs named in the program's
 * `transformFeedbackVaryings` into a second set of buffers, then swaps the
 * two. Draw the results by adding `attribute(name)` to any geometry:
 *
 * ```ts
 * const sim = new TransformFeedback(gl, {
 *   program: new Program(gl, {
 *     vertex: simulate,
 *     fragment: discard,
 *     transformFeedbackVaryings: ['v_position']
 *   }),
 *   attributes: {
 *     a_position: { size: 2, data: positions, varying: 'v_position' }
 *   }
 * })
 * const points = new Geometry(gl, { position: sim.attribute('a_position') })
 *
 * // Each frame
 * sim.step()
 * renderer.render({ scene })
 * ```
 */
export class TransformFeedback {
  gl: WTCGLRenderingContext
  /**
   * The simulation program.
   */
  readonly program: Program
  /**
   * The number of vertices simulated.
   */
  readonly count: number

  #options: TransformFeedbackOptions
  // Attribute names in the order of the program's varyings
  #names: string[]
  #usage: GLenum
  #interleaved: boolean
  #sides: [Side, Side]
  // The side holding the latest results
  #index = 0
  // Attributes handed out by attribute(), which always point at the latest
  // results. Keyed by name and options so repeat calls share one object.
  #outputs = new Map<string, { name: string; attribute: GeometryAttribute }>()
  // The context generation this feedback was created for
  #contextVersion: number
  // Reused for every step's draw, so stepping doesn't allocate
  #drawOptions: { program: Program; mode: GLenum }

  constructor(gl: WTCGLRenderingContext, options: TransformFeedbackOptions) {
    this.gl = gl
    this.#options = options
    this.program = options.program
    this.#usage = options.usage ?? gl.DYNAMIC_COPY
    this.#interleaved =
      this.program.transformFeedbackBufferMode === 'interleaved'
    this.#names = this.#orderAttributes()
    this.#drawOptions = { program: this.program, mode: gl.POINTS }

    const first = options.attributes[this.#names[0]]
    this.count = options.count ?? first.data.length / first.size
    for (const name of this.#names) {
      const { size, data } = options.attributes[name]
      if (data.length < this.count * size)
        throw new Error(
          `TransformFeedback attribute ${name} has ${data.length} values; ${this.count} vertices of size ${size} need ${this.count * size}`
        )
    }

    this.#sides = [this.#createSide(), this.#createSide()]
    this.#upload()

    this.#contextVersion = gl.renderer.contextVersion
    gl.renderer.track(this)
  }

  /**
   * Check the attributes against the program's varyings and return their
   * names in buffer order.
   */
  #orderAttributes(): string[] {
    const { attributes } = this.#options
    const varyings = this.program.transformFeedbackVaryings
    const names = Object.keys(attributes)

    if (!names.length)
      throw new Error('TransformFeedback needs at least one attribute')
    const missing = varyings.filter(
      (varying) => !names.some((name) => attributes[name].varying === varying)
    )
    const unknown = names.filter(
      (name) => !varyings.includes(attributes[name].varying)
    )
    // Each varying is captured into exactly one attribute
    const duplicates = varyings.filter(
      (varying) =>
        names.filter((name) => attributes[name].varying === varying).length > 1
    )
    if (missing.length || unknown.length || duplicates.length)
      throw new Error(
        "TransformFeedback attributes must match the program's transformFeedbackVaryings. " +
          (missing.length
            ? `No attribute captures ${missing.join(', ')}. `
            : '') +
          (unknown.length
            ? `${unknown.map((name) => `${name} (${attributes[name].varying})`).join(', ')} not in the program's varyings. `
            : '') +
          (duplicates.length
            ? `More than one attribute captures ${duplicates.join(', ')}.`
            : '')
      )

    return names.sort(
      (a, b) =>
        varyings.indexOf(attributes[a].varying) -
        varyings.indexOf(attributes[b].varying)
    )
  }

  /**
   * Create one side's buffers, attributes, geometry and transform feedback
   * object. The buffers are filled by `#upload()`.
   */
  #createSide(): Side {
    const { gl } = this
    const { attributes: options, staticAttributes } = this.#options
    const names = this.#names

    const buffers = this.#interleaved
      ? [gl.createBuffer()!]
      : names.map(() => gl.createBuffer()!)

    // In interleaved mode the attributes share one buffer, one vertex's
    // values after another, in varying order
    const stride = this.#interleaved
      ? names.reduce((total, name) => total + options[name].size, 0) * 4
      : 0
    let offset = 0
    const attributes: Record<string, GeometryAttribute> = {}
    names.forEach((name, i) => {
      const { size, data } = options[name]
      attributes[name] = new GeometryAttribute({
        size,
        stride,
        offset,
        count: this.count,
        data,
        buffer: buffers[this.#interleaved ? 0 : i],
        external: true
      })
      if (this.#interleaved) offset += size * 4
    })

    const geometry = new Geometry(gl, { ...staticAttributes, ...attributes })
    // Static attributes may hold more vertices than the simulation
    geometry.setDrawRange(0, this.count)

    const feedback = this.#createFeedback(buffers)

    return { buffers, feedback, geometry, attributes }
  }

  /**
   * Create a transform feedback object that writes into `buffers`.
   */
  #createFeedback(buffers: WebGLBuffer[]): WebGLTransformFeedback {
    const { gl } = this
    const feedback = gl.createTransformFeedback()!
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback)
    buffers.forEach((buffer, i) =>
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, i, buffer)
    )
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
    // bindBufferBase also sets the general binding, which would stop the
    // buffers being used as vertex attributes
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null)
    return feedback
  }

  /**
   * Fill both sides' buffers from the attributes' starting data.
   */
  #upload(): void {
    const { gl } = this
    const { attributes } = this.#options
    const names = this.#names

    let data: Float32Array[]
    if (this.#interleaved) {
      const sizes = names.map((name) => attributes[name].size)
      const vertexSize = sizes.reduce((total, size) => total + size, 0)
      const interleaved = new Float32Array(this.count * vertexSize)
      for (let v = 0, o = 0; v < this.count; v++) {
        names.forEach((name, i) => {
          const size = sizes[i]
          interleaved.set(
            attributes[name].data.subarray(v * size, (v + 1) * size),
            o
          )
          o += size
        })
      }
      data = [interleaved]
    } else {
      data = names.map((name) =>
        attributes[name].data.subarray(0, this.count * attributes[name].size)
      )
    }

    for (const side of this.#sides) {
      side.buffers.forEach((buffer, i) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, data[i], this.#usage)
      })
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.renderer.state.boundBuffer = null

    this.#index = 0
    this.#pointOutputs()
  }

  /**
   * Point the output attributes at the side holding the latest results.
   */
  #pointOutputs(): void {
    const side = this.#sides[this.#index]
    // A stored callback, so this doesn't allocate a closure on every step
    this.#outputs.forEach(this.#pointOutput, side)
  }

  #pointOutput(
    this: Side,
    output: { name: string; attribute: GeometryAttribute }
  ): void {
    output.attribute.buffer = this.attributes[output.name].buffer
  }

  /**
   * An attribute holding the simulation's latest values, to add to any
   * geometry. Its buffer follows the results after each `step()`, and
   * repeat calls with the same options return the same object. Its values
   * live on the GPU, so a mesh using it as `position` isn't frustum culled
   * unless you set `geometry.bounds` yourself.
   * @param name - The attribute's name, as passed in `attributes`.
   * @param options - `instanced` makes it a per-instance attribute that
   * advances once every `instanced` instances, e.g. to draw one instanced
   * shape per simulated vertex.
   */
  attribute(
    name: string,
    { instanced = 0 }: { instanced?: number } = {}
  ): GeometryAttribute {
    const side = this.#sides[this.#index].attributes[name]
    if (!side)
      throw new Error(`TransformFeedback has no attribute called ${name}`)

    const key = `${name}:${instanced}`
    let output = this.#outputs.get(key)
    if (!output) {
      const { size, offset, stride, buffer } = side
      output = {
        name,
        attribute: new GeometryAttribute({
          size,
          offset,
          stride,
          instanced,
          count: this.count,
          data: this.#options.attributes[name].data,
          buffer,
          external: true
        })
      }
      this.#outputs.set(key, output)
    }
    return output.attribute
  }

  /**
   * Run the simulation once. Nothing is drawn: the program's outputs are
   * captured, and become the input to the next step.
   */
  step(): void {
    const { gl, program } = this
    const renderer = gl.renderer
    if (renderer.contextLost || !program.linked) return

    const read = this.#sides[this.#index]
    const write = this.#sides[1 - this.#index]

    program.use(USE_OPTIONS)
    renderer.enable(gl.RASTERIZER_DISCARD)
    // A buffer being captured into can't be bound anywhere else, and the
    // last geometry to point at the results may have left it bound here
    if (renderer.state.boundBuffer !== null) {
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
      renderer.state.boundBuffer = null
    }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, write.feedback)
    gl.beginTransformFeedback(gl.POINTS)
    read.geometry.draw(this.#drawOptions)
    gl.endTransformFeedback()
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
    renderer.disable(gl.RASTERIZER_DISCARD)

    this.#index = 1 - this.#index
    this.#pointOutputs()
  }

  /**
   * Start the simulation again from the attributes' `data`. Change `data`
   * first to start from somewhere new.
   */
  reset(): void {
    this.#upload()
  }

  /**
   * Rebuild after the WebGL context has been restored. Called by the
   * renderer. The simulation starts again from the attributes' `data`.
   */
  restoreContext(): void {
    if (this.#contextVersion === this.gl.renderer.contextVersion) return
    this.#contextVersion = this.gl.renderer.contextVersion

    // The varyings are set when the program links, so relink it first
    this.program.restoreContext()

    // Everything from the old context is already gone, so nothing to delete.
    // The geometries restore their own vertex arrays and static attributes.
    for (const side of this.#sides) {
      side.buffers = side.buffers.map(() => this.gl.createBuffer()!)
      this.#names.forEach((name, i) => {
        side.attributes[name].buffer = side.buffers[this.#interleaved ? 0 : i]
      })
      side.feedback = this.#createFeedback(side.buffers)
    }

    this.#upload()
  }

  /**
   * Delete the buffers, vertex arrays and transform feedback objects. The
   * static attributes' buffers are deleted too. The program is left alone.
   */
  remove(): void {
    const { gl } = this
    for (const side of this.#sides) {
      side.buffers.forEach((buffer) => gl.deleteBuffer(buffer))
      gl.deleteTransformFeedback(side.feedback)
      side.geometry.remove()
    }
    gl.renderer.untrack(this)
  }
}
