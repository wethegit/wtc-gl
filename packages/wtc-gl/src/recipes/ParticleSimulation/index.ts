import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import { Renderer } from '../../core/Renderer'
import { Program } from '../../core/Program'
import { Mesh } from '../../core/Mesh'
import { Uniform } from '../../core/Uniform'
import { PointCloud } from '../../geometry/PointCloud'
import { GeometryAttribute } from '../../geometry/GeometryAttribute'
import { Camera } from '../../core/Camera'
import { Framebuffer } from '../../ext/Framebuffer'

import defaultShaderF from './default-shader-frag.frag'
import defaultShaderV from './default-shader-vert.vert'

const hasWindow = typeof window !== 'undefined'
const hasDocument = typeof document !== 'undefined'

/**
 * Options passed to the {@link ParticleSimulation} constructor.
 * @category Recipes
 */
export interface ParticleSimulationOptions {
  /**
   * The vertex shader. Defaults to one that draws each particle as a 2 pixel
   * point, at the position it reads from a `b_position` texture.
   */
  vertex: string
  /** The fragment shader. Defaults to one that fills each point with `v_colour`. */
  fragment: string
  /**
   * The size in CSS pixels, used when `autoResize` is off. Defaults to the
   * window size, or 500 × 500 when there's no window.
   */
  dimensions: Vec2
  /**
   * The element the canvas is appended to. Defaults to `document.body`, or
   * `null` (don't append) when there's no document.
   */
  container: HTMLElement | null
  /**
   * Whether the canvas follows the window size. When off, `dimensions` is
   * used.
   * @default true
   */
  autoResize: boolean
  /**
   * Extra uniforms for the program, alongside `u_time` and `u_resolution`.
   * @default {}
   */
  uniforms: WTCGLUniformArray
  /**
   * Called each frame before rendering, with the `requestAnimationFrame`
   * timestamp in ms. Bound to the instance.
   */
  onBeforeRender: (delta: number) => void
  /**
   * Called each frame after rendering, with the `requestAnimationFrame`
   * timestamp in ms. Bound to the instance.
   */
  onAfterRender: (delta: number) => void
  /**
   * The width and height of the simulation textures. There's a particle for
   * each texel, `textureSize²` in all.
   * @default 128
   */
  textureSize: number
  /**
   * The number of position components per particle in the default geometry.
   * @default 3
   */
  simDimensions: number
  /**
   * Replaces the default geometry. Called bound to the instance, and must set
   * `this.cloud` to a `PointCloud`. Defaults to the
   * {@link ParticleSimulation.createGeometry} method.
   */
  createGeometry: () => void
  /**
   * Options for the {@link Renderer}. The clear colour defaults to opaque
   * black.
   * @default {}
   */
  rendererProps: object
}

/**
 * Draws a set of particles as points, with a render loop and window
 * resizing. There's a particle for each texel of a `textureSize` ×
 * `textureSize` texture, and each has a `reference` attribute holding its
 * texel's coordinates, so the vertex shader can read its state from
 * simulation textures, such as a {@link Framebuffer} updated each frame.
 *
 * The program gets two uniforms besides your own: `u_time`, which grows by
 * `delta * 0.00005` each frame (`delta` in ms), and `u_resolution`, the
 * canvas size.
 * @category Recipes
 */
export class ParticleSimulation {
  /** The program's uniforms: those passed in plus `u_time` and `u_resolution`. */
  uniforms
  /** The size in CSS pixels. */
  dimensions
  /** Whether the canvas follows the window size. Only read by the constructor. */
  autoResize = true
  /** Called each frame before rendering, with the frame timestamp in ms. */
  onBeforeRender
  /** Called each frame after rendering, with the frame timestamp in ms. */
  onAfterRender

  /** The `u_time` uniform (`float`). Grows by `delta * 0.00005` each frame, `delta` in ms. */
  u_time
  /**
   * The `u_resolution` uniform (`vec2`): the canvas size in device pixels.
   * With `autoResize` off it stays at `dimensions`, in CSS pixels.
   */
  u_resolution

  /** The WebGL context. */
  gl: WTCGLRenderingContext
  /** The renderer that owns the canvas. */
  renderer: Renderer
  /** The program made from `vertex` and `fragment`. */
  program: Program
  /** The points mesh, drawn with `gl.POINTS`. */
  mesh: Mesh

  /** The width and height of the simulation textures. */
  textureSize: number
  /** The number of particles: `textureSize²`. */
  particles: number
  /** `particles * 4`: the length of an RGBA array with a texel per particle. */
  textureArraySize: number
  /** The number of position components per particle in the default geometry. */
  simDimensions: number

  /**
   * Each particle's texel coordinates in the simulation textures, from 0 to
   * 1, two per particle. The data for the `reference` attribute.
   */
  references: Float32Array

  /** The particles' geometry, set by `createGeometry`. */
  cloud?: PointCloud

  /** The timestamp of the last frame in ms. */
  lastTime = 0

  /**
   * Make the renderer, geometry, program and mesh, and start the render loop.
   * @param options - The shaders, uniforms, particle count and callbacks.
   */
  constructor({
    vertex = defaultShaderV,
    fragment = defaultShaderF,
    dimensions = hasWindow
      ? new Vec2(window.innerWidth, window.innerHeight)
      : new Vec2(500, 500),
    container = hasDocument ? document.body : null,
    autoResize = true,
    uniforms = {},
    onBeforeRender = () => {},
    onAfterRender = () => {},
    textureSize = 128,
    simDimensions = 3,
    createGeometry,
    rendererProps = {}
  }: Partial<ParticleSimulationOptions> = {}) {
    this.onBeforeRender = onBeforeRender.bind(this)
    this.onAfterRender = onAfterRender.bind(this)
    this.render = this.render.bind(this)
    this.resize = this.resize.bind(this)
    this.autoResize = autoResize

    this.dimensions = dimensions

    this.u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })
    this.u_resolution = new Uniform({
      name: 'resolution',
      value: this.dimensions.array,
      kind: 'float_vec2'
    })

    this.uniforms = Object.assign({}, uniforms, {
      /** The `u_time` uniform. */
      u_time: this.u_time,
      /** The `u_resolution` uniform. */
      u_resolution: this.u_resolution
    })

    this.renderer = new Renderer({
      clearColour: [0, 0, 0, 1],
      ...rendererProps
    })
    this.gl = this.renderer.gl

    if (this.autoResize && hasWindow) {
      window.addEventListener('resize', this.resize, false)
      this.resize()
    } else {
      this.renderer.dimensions = dimensions
    }

    this.textureSize = textureSize
    this.particles = Math.pow(this.textureSize, 2)
    this.textureArraySize = this.particles * 4
    this.simDimensions = simDimensions

    this.references = new Float32Array(this.particles * 2).fill(0) // The references - used for texture lookups

    if (createGeometry && typeof createGeometry === 'function') {
      createGeometry.bind(this)()
    } else {
      this.createGeometry()
    }

    this.program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: this.uniforms
    })

    if (!this.cloud)
      throw new Error('createGeometry must set this.cloud to a PointCloud')

    this.mesh = new Mesh(this.gl, {
      mode: this.gl.POINTS,
      geometry: this.cloud,
      program: this.program
    })

    this.playing = true

    container?.appendChild(this.gl.canvas)
  }

  /**
   * Make the default geometry: a `PointCloud` of `particles` points with
   * `simDimensions` components each, at random between -200 and 200, plus
   * the `reference` attribute. The `createGeometry` option replaces this.
   */
  createGeometry() {
    this.cloud = new PointCloud(this.gl, {
      fillFunction: (points, dimensions) => {
        for (let i = 0; i < points.length; i += 2) {
          const index = i / 2

          const pos = new Vec2(
            index % this.textureSize,
            Math.floor(index / this.textureSize)
          )

          this.references[i] = pos.x / this.textureSize // x position of the texture particle representing this ant
          this.references[i + 1] = pos.y / this.textureSize // y position of the texture particle representing this ant
        }
        for (let i = 0; i < points.length; i += dimensions) {
          for (let j = 0; j < dimensions; j++) {
            points[i + j] = Math.random() * 400 - 200 // n position
          }
        }
      },
      particles: this.particles,
      dimensions: this.simDimensions,
      attributes: {
        reference: new GeometryAttribute({ size: 2, data: this.references })
      }
    })
  }

  /**
   * Advance `u_time`, render a frame with the current render settings and
   * request the next one while `playing`. Bound to the instance.
   * @param t - The `requestAnimationFrame` timestamp in ms.
   */
  render(t: number) {
    const diff = t - this.lastTime
    this.lastTime = t

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    const v = this.u_time.value as number
    this.u_time.value = v + diff * 0.00005

    this.onBeforeRender(t)

    if (this.post)
      this.post.render(this.renderer, {
        scene: this.mesh,
        camera: this.camera,
        update: this.update,
        sort: this.sort,
        frustumCull: this.frustumCull,
        clear: this.clear,
        viewport: this.viewport
      })
    else
      this.renderer.render({
        scene: this.mesh,
        camera: this.camera,
        update: this.update,
        sort: this.sort,
        frustumCull: this.frustumCull,
        clear: this.clear,
        viewport: this.viewport
      })

    this.onAfterRender(t)
  }

  /**
   * Size the canvas to the window and update `u_resolution`. Bound to the
   * instance, and called on the window's `resize` event when `autoResize` is
   * on.
   */
  resize() {
    this.dimensions = hasWindow
      ? new Vec2(window.innerWidth, window.innerHeight)
      : new Vec2(500, 500)
    this.u_resolution.value = this.dimensions.scaleNew(this.renderer.dpr).array
    this.renderer.dimensions = this.dimensions
  }

  #post: Framebuffer | null = null
  /** Set a framebuffer to render into, or null to render to the canvas. */
  set post(p) {
    this.#post = p
  }
  /** The framebuffer frames are rendered into instead of the canvas, or null. */
  get post() {
    return this.#post
  }

  #playing = false
  /**
   * Start or stop the render loop. Stopping lets an already requested frame
   * run, then stops.
   */
  set playing(v) {
    if (this.#playing !== true && v === true) {
      requestAnimationFrame(this.render)
      this.#playing = true
    } else if (v == false) {
      this.#playing = false
    }
  }
  /** Whether the render loop is running. */
  get playing() {
    return this.#playing === true
  }

  // Getters and setters for renderer

  #camera: undefined | Camera
  /** Set the camera. Anything but a `Camera`, null or undefined is ignored. */
  set camera(v) {
    if (v == null || v instanceof Camera) {
      this.#camera = v
    }
  }
  /** The camera passed to the renderer, if any. */
  get camera() {
    return this.#camera
  }

  #update: boolean = true
  /** Set whether to update world matrices. Anything but `true` turns it off. */
  set update(v) {
    this.#update = v === true
  }
  /** Whether the renderer updates world matrices before drawing. */
  get update() {
    return this.#update
  }

  #sort: boolean = true
  /** Set whether to sort. Anything but `true` turns it off. */
  set sort(v) {
    this.#sort = v === true
  }
  /** Whether the renderer sorts the render list. */
  get sort() {
    return this.#sort
  }

  #frustumCull: boolean = true
  /** Set whether to frustum cull. Anything but `true` turns it off. */
  set frustumCull(v) {
    this.#frustumCull = v === true
  }
  /** Whether the renderer frustum culls against the camera. */
  get frustumCull() {
    return this.#frustumCull
  }

  #clear: boolean | undefined
  /** Set whether to clear. Anything but `true` turns it off. */
  set clear(v) {
    this.#clear = v === true
  }
  /**
   * Whether the renderer clears before drawing. Undefined until set, which
   * leaves it to the renderer's `autoClear`.
   */
  get clear() {
    return this.#clear
  }

  #viewport: [Vec2, Vec2] | undefined
  /** Set the viewport. Anything but a pair of `Vec2`s, null or undefined is ignored. */
  set viewport(v) {
    if (
      (v instanceof Array && v[0] instanceof Vec2 && v[1] instanceof Vec2) ||
      v == null
    )
      this.#viewport = v
  }
  /** The viewport as `[size, position]` in pixels, or undefined for the whole canvas. */
  get viewport() {
    return this.#viewport
  }
}
