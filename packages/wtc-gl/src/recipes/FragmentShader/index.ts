import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import type { Framebuffer } from '../../ext/Framebuffer'
import { Renderer, type RendererOptions } from '../../core/Renderer'
import { Program } from '../../core/Program'
import { Mesh } from '../../core/Mesh'
import { Triangle } from '../../geometry/Triangle'
import { Uniform } from '../../core/Uniform'

import defaultShaderF from './default-shader-frag.frag'
import defaultShaderV from './default-shader-vert.vert'

/**
 * Options passed to the {@link FragmentShader} constructor.
 * @category Recipes
 */
export interface FragmentShaderOptions {
  /**
   * The vertex shader. Defaults to one that passes the full-screen triangle
   * through with a `v_uv` varying.
   */
  vertex: string
  /** The fragment shader. Defaults to a demo colour gradient. */
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
  /** Called with the renderer once it's made, before the program is. */
  onInit: (renderer: Renderer) => void
  /**
   * Called each frame before rendering, with the `requestAnimationFrame`
   * timestamp in ms. Bound to the instance.
   */
  onBeforeRender: (time: number) => void
  /**
   * Called each frame after rendering, with the `requestAnimationFrame`
   * timestamp in ms. Bound to the instance.
   */
  onAfterRender: (time: number) => void
  /**
   * Options for the {@link Renderer}. The clear colour defaults to opaque
   * white.
   * @default {}
   */
  rendererProps: Partial<RendererOptions>
}

const hasWindow = typeof window !== 'undefined'
const hasDocument = typeof document !== 'undefined'

/**
 * Draws a fragment shader over the whole canvas. It makes a renderer, a
 * full-screen triangle and a program, appends the canvas to `container`, and
 * runs a render loop, keeping the canvas the size of the window unless
 * `autoResize` is off.
 *
 * The program gets two uniforms besides your own: `u_time`, which grows by
 * `delta * 0.00005` each frame (`delta` in ms, capped at 50), and
 * `u_resolution`, the canvas size in device pixels.
 *
 * @example
 * const shader = new FragmentShader({ fragment })
 * shader.playing = false // pause
 * @category Recipes
 */
export class FragmentShader {
  /** The program's uniforms: those passed in plus `u_time` and `u_resolution`. */
  uniforms: WTCGLUniformArray
  /** The size in CSS pixels. */
  dimensions: Vec2
  /** Whether the canvas follows the window size. Only read by the constructor. */
  autoResize: boolean = true
  /** Called each frame before rendering, with the frame timestamp in ms. */
  onBeforeRender: (t: number) => void
  /** Called each frame after rendering, with the frame timestamp in ms. */
  onAfterRender: (t: number) => void

  /**
   * The `u_time` uniform (`float`). Grows by `delta * 0.00005` each frame,
   * `delta` in ms and capped at 50.
   */
  u_time: Uniform
  /** The `u_resolution` uniform (`vec2`): the canvas size in device pixels. */
  u_resolution: Uniform

  /** The WebGL context. */
  gl: WTCGLRenderingContext
  /** The renderer that owns the canvas. */
  renderer: Renderer
  /** The program made from `vertex` and `fragment`. */
  program: Program
  /** The full-screen triangle mesh. */
  mesh: Mesh

  /** The timestamp of the last frame in ms, or 0 before the first. */
  lastTime: number = 0

  #ownsCanvas: boolean
  #frame: number = 0

  /**
   * Make the renderer, program and mesh, and start the render loop.
   * @param options - The shaders, uniforms, size and callbacks.
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
    onInit = () => {},
    onBeforeRender = () => {},
    onAfterRender = () => {},
    rendererProps = {}
  }: Partial<FragmentShaderOptions> = {}) {
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
      u_time: this.u_time,
      u_resolution: this.u_resolution
    })

    this.#ownsCanvas = !rendererProps.canvas
    this.renderer = new Renderer({
      clearColour: [1, 1, 1, 1],
      ...rendererProps
    })
    onInit(this.renderer)
    this.gl = this.renderer.gl
    container?.appendChild(this.gl.canvas)

    if (this.autoResize && hasWindow) {
      window.addEventListener('resize', this.resize, false)
      this.resize()
    } else {
      this.renderer.dimensions = dimensions
      this.u_resolution.value = this.dimensions.scaleNew(
        this.renderer.dpr
      ).array
    }

    const geometry = new Triangle(this.gl)

    this.program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: this.uniforms
    })

    this.mesh = new Mesh(this.gl, { geometry, program: this.program })

    this.playing = true
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

  /**
   * Restart the frame clock, so the next frame adds no time. `u_time` keeps
   * its value.
   */
  resetTime() {
    this.lastTime = 0
  }

  /**
   * Advance `u_time`, render a frame and request the next one while
   * `playing`. Bound to the instance.
   * @param t - The `requestAnimationFrame` timestamp in ms.
   */
  render(t: number) {
    if (this.lastTime === 0) this.lastTime = t
    const diff = Math.min(t - this.lastTime, 50)
    this.lastTime = t

    if (this.playing) {
      this.#frame = requestAnimationFrame(this.render)
    }

    const v: number = this.u_time.value as number
    this.u_time.value = v + diff * 0.00005

    this.onBeforeRender(t)

    if (this.post) this.post.render(this.renderer, { scene: this.mesh })
    else this.renderer.render({ scene: this.mesh })

    this.onAfterRender(t)
  }

  /**
   * Stop the render loop, remove the resize listener, and delete the mesh's
   * geometry and program. A canvas the renderer created is removed from the
   * DOM and its WebGL context released (see `Renderer.dispose()`). A canvas
   * passed in through `rendererProps.canvas` stays where it is.
   *
   * A `post` framebuffer is left alone, as it's supplied by the caller. Call
   * its `remove()` as well if nothing else uses it.
   *
   * @returns The canvas element.
   */
  destroy(): HTMLCanvasElement {
    this.playing = false
    if (hasWindow) window.removeEventListener('resize', this.resize, false)
    this.mesh.geometry.remove()
    this.program.remove()
    this.renderer.dispose()
    const canvas = this.gl.canvas as HTMLCanvasElement
    if (this.#ownsCanvas) canvas.remove()
    return canvas
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

  #playing: boolean = false
  /**
   * Start or stop the render loop. Stopping cancels the next frame and
   * restarts the frame clock.
   */
  set playing(v: boolean) {
    if (this.#playing !== true && v === true) {
      this.#frame = requestAnimationFrame(this.render)
      this.#playing = true
    } else if (v == false) {
      cancelAnimationFrame(this.#frame)
      this.lastTime = 0
      this.#playing = false
    }
  }
  /** Whether the render loop is running. */
  get playing(): boolean {
    return this.#playing === true
  }
}
