import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import type { Obj } from '../../core/Object'
import type { Camera } from '../../core/Camera'
import { Renderer, type RendererOptions } from '../../core/Renderer'
import { Uniform } from '../../core/Uniform'

/**
 * Tagged template literal for inline GLSL. A no-op at runtime; exists so
 * editors with a GLSL extension can syntax-highlight the string contents.
 *
 * @example
 * const frag = glsl`
 *   #version 300 es
 *   precision highp float;
 *   out vec4 colour;
 *   void main() { colour = vec4(1.); }
 * `
 */
export const glsl = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string =>
  strings.raw.reduce(
    (acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''),
    ''
  )

/**
 * Reads GLSL source from a `<script>` element in the page. Useful when you
 * want to keep shaders inline in HTML rather than in separate `.frag` files.
 *
 * @param selector - CSS selector for the script element containing the GLSL source.
 * @throws {Error} If no element is found for the given selector.
 *
 * @example
 * // HTML: <script type="x-shader/x-fragment" id="myFrag">...</script>
 * const frag = heredoc('#myFrag')
 */
export const heredoc = (selector: string): string => {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`heredoc: no element matches "${selector}"`)
  return el.textContent ?? ''
}

/** Options passed to the {@link ScrollScene} constructor. */
export interface ScrollSceneOptions {
  /** The DOM element this scene is anchored to. */
  element: HTMLElement
  /** The scene graph root to render. */
  scene: Obj
  /** Optional camera. Defaults to the renderer's orthographic camera if omitted. */
  camera?: Camera
  /**
   * When `true` (default), the GL viewport is locked to the element's bounds each frame, so all coordinates are relative to the element. When `false`, the viewport is left unlocked at the renderer level and it's up to you to use the `u_origin` uniform for element-relative math in your shader.
   */
  useViewport?: boolean
  /**
   * When `true` (default), the renderer clears the scissored region before
   * drawing this scene. Set to `false` to composite on top of previously
   * rendered scenes — useful for particle overlays.
   */
  clipToViewport?: boolean
  /**
   * When `true` (default), the renderer clears the scissored region before
   * drawing this scene. Set to `false` to composite on top of previously
   * rendered scenes — useful for particle overlays.
   */
  clearOnRender?: boolean
  /**
   * When `true`, exposes a `u_elementSize` uniform (`vec2`) that describes
   * the element's dimensions in canvas NDC units. Use this in your vertex
   * shader to position geometry in element-local coordinates while keeping
   * the full canvas clip volume (so rendering can bleed outside the element):
   *
   * ```glsl
   * gl_Position = vec4(a_position.xy * u_elementSize + u_origin.zw, a_position.z, 1.0);
   * ```
   *
   * A vertex at `(0.4, 0)` (edge of a `width: 0.8` plane) will land 40 % of
   * the element's width from its centre, regardless of canvas size.
   *
   * Combine with `useViewport: false` and `clipToViewport: false` to allow
   * rendering beyond the element boundary (e.g. isometric layer bleed).
   */
  elementSpace?: boolean
  /**
   * Extra margin (in pixels) applied to all four sides of the viewport when
   * determining whether the element is visible. A positive value keeps the
   * scene active while the element is that many pixels off-screen; a negative
   * value deactivates it before it fully leaves.
   *
   * Passed directly to `IntersectionObserver` as `rootMargin`.
   *
   * @default 0
   */
  margin?: number
  /** Called immediately before the scene is rendered each frame. */
  onBeforeRender?: (delta: number, rect: DOMRect) => void
  /** Called immediately after the scene is rendered each frame. */
  onAfterRender?: (delta: number, rect: DOMRect) => void
}

/**
 * A single WebGL scene anchored to a DOM element inside a {@link ScrollRenderer}.
 *
 * Each `ScrollScene` tracks its element's position via `getBoundingClientRect()`
 * every frame and exposes a set of uniforms that are updated automatically:
 *
 * | Uniform        | Type    | Description |
 * |----------------|---------|-------------|
 * | `u_time`       | `float` | Elapsed time (increments by `delta * 0.00005` per frame). |
 * | `u_resolution` | `vec2`  | Element size in physical pixels. |
 * | `u_origin`     | `vec4`  | `.xy` — element bottom-left in physical pixels, GL canvas space (Y-up). Use with `gl_FragCoord` for element-relative fragment math. `.zw` — element centre in canvas NDC [-1, 1]. Use for vertex positioning when `useViewport` is `false`. |
 *
 * An `IntersectionObserver` automatically pauses rendering when the element
 * leaves the viewport.
 *
 * @example
 * const drawable = new Drawable(gl)
 * const scene = new ScrollScene({ element: document.querySelector('.hero'), scene: drawable })
 * new Mesh(gl, { geometry: new Triangle(gl), program }).setParent(drawable)
 * renderer.addScene(scene)
 */
export class ScrollScene {
  /** The DOM element this scene tracks. */
  element: HTMLElement
  /** The scene graph root passed to the renderer each frame. */
  scene: Obj
  /** Optional camera used when rendering this scene. */
  camera?: Camera
  /** Whether to lock the GL viewport to the element's bounds. */
  useViewport: boolean
  /** Whether to clip the GL viewport to the element's bounds. */
  clipToViewport: boolean
  /** Whether to clear the scissored region before rendering. */
  clearOnRender: boolean
  /** Whether to expose element-space coordinate helpers via `u_elementSize`. */
  elementSpace: boolean

  /** Elapsed time uniform (`float`). Increments by `delta * 0.00005` per frame. */
  u_time: Uniform
  /** Element size in physical pixels (`vec2`). */
  u_resolution: Uniform
  /**
   * Packed origin uniform (`vec4`):
   * - `.xy` — element bottom-left in physical pixels, GL canvas space (Y-up).
   * - `.zw` — element centre in canvas NDC [-1, 1].
   */
  u_origin: Uniform
  /**
   * Element dimensions in canvas NDC units (`vec2`). Only present when
   * `elementSpace: true`. Use in a vertex shader to map element-local
   * coordinates to canvas NDC:
   *
   * ```glsl
   * gl_Position = vec4(a_position.xy * u_elementSize + u_origin.zw, a_position.z, 1.0);
   * ```
   */
  u_elementSize?: Uniform
  /** All auto-updated uniforms, ready to spread into a {@link Program}'s `uniforms` option. */
  uniforms: WTCGLUniformArray

  /** Whether the element is currently intersecting the viewport. */
  visible: boolean = true

  /** @see {@link ScrollSceneOptions.onBeforeRender} */
  onBeforeRender: (delta: number, rect: DOMRect) => void
  /** @see {@link ScrollSceneOptions.onAfterRender} */
  onAfterRender: (delta: number, rect: DOMRect) => void

  #observer: IntersectionObserver

  constructor({
    element,
    scene,
    camera,
    useViewport = true,
    clipToViewport = true,
    clearOnRender = true,
    elementSpace = false,
    margin = 0,
    onBeforeRender = () => {},
    onAfterRender = () => {}
  }: ScrollSceneOptions) {
    this.element = element
    this.scene = scene
    this.camera = camera
    this.useViewport = useViewport
    this.clipToViewport = clipToViewport
    this.clearOnRender = clearOnRender
    this.elementSpace = elementSpace
    this.onBeforeRender = onBeforeRender
    this.onAfterRender = onAfterRender

    this.u_time = new Uniform({ name: 'u_time', value: 0, kind: 'float' })
    this.u_resolution = new Uniform({
      name: 'u_resolution',
      value: [0, 0],
      kind: 'float_vec2'
    })
    this.u_origin = new Uniform({
      name: 'u_origin',
      value: [0, 0, 0, 0],
      kind: 'float_vec4'
    })
    this.uniforms = {
      u_time: this.u_time,
      u_resolution: this.u_resolution,
      u_origin: this.u_origin
    }

    if (elementSpace) {
      this.u_elementSize = new Uniform({
        name: 'u_elementSize',
        value: [0, 0],
        kind: 'float_vec2'
      })
      this.uniforms.u_elementSize = this.u_elementSize
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        this.visible = entries[0].isIntersecting
      },
      { rootMargin: `${margin}px` }
    )
    this.#observer.observe(element)
  }

  /**
   * Converts the element's current bounding rect to GL viewport coordinates.
   *
   * @param canvasHeight - Canvas height in physical pixels (`renderer.dimensions.height * dpr`).
   * @param dpr - Device pixel ratio from the renderer.
   * @returns GL-space `x`, `y`, `width`, `height` (all in physical pixels) plus the raw `DOMRect`.
   */
  glRect(
    canvasHeight: number,
    dpr: number
  ): { x: number; y: number; width: number; height: number; rect: DOMRect } {
    const rect = this.element.getBoundingClientRect()
    return {
      x: Math.round(rect.left * dpr),
      y: Math.round(canvasHeight - rect.bottom * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr),
      rect
    }
  }

  /** Disconnects the `IntersectionObserver`. Call when removing the scene permanently. */
  destroy() {
    this.#observer.disconnect()
  }
}

/** Options passed to the {@link ScrollRenderer} constructor. */
export interface ScrollRendererOptions {
  /** Props forwarded to the underlying {@link Renderer}. `autoClear` is always overridden to `false`. */
  rendererProps?: Partial<RendererOptions>
  /** Called once per frame before any scenes are rendered. */
  onBeforeRender?: (delta: number) => void
  /** Called once per frame after all scenes are rendered. */
  onAfterRender?: (delta: number) => void
}

/**
 * Renders multiple independent WebGL scenes on a single fixed canvas, each
 * scissor-tested to a DOM element's exact pixel bounds.
 *
 * A single `requestAnimationFrame` loop drives all registered {@link ScrollScene}
 * instances. Scenes outside the viewport are skipped automatically via
 * `IntersectionObserver`. The canvas is cleared to transparent once per frame
 * before the scissored passes run.
 *
 * @example
 * const renderer = new ScrollRenderer()
 * Object.assign(renderer.canvas.style, {
 *   position: 'fixed', inset: '0', width: '100%', height: '100%',
 *   pointerEvents: 'none', zIndex: '0',
 * })
 * document.body.appendChild(renderer.canvas)
 *
 * const scene = new ScrollScene({ element: document.querySelector('.hero'), scene: drawable })
 * renderer.addScene(scene)
 * renderer.playing = true
 */
export class ScrollRenderer {
  /** The underlying {@link Renderer} instance. */
  renderer: Renderer
  /** The WebGL rendering context. */
  gl: WTCGLRenderingContext

  /** @see {@link ScrollRendererOptions.onBeforeRender} */
  onBeforeRender: (delta: number) => void
  /** @see {@link ScrollRendererOptions.onAfterRender} */
  onAfterRender: (delta: number) => void

  #scenes: ScrollScene[] = []
  #lastTime: number = 0
  #playing: boolean = false

  constructor({
    rendererProps = {},
    onBeforeRender = () => {},
    onAfterRender = () => {}
  }: ScrollRendererOptions = {}) {
    this.renderer = new Renderer({
      alpha: true,
      ...rendererProps,
      autoClear: false
    })
    this.gl = this.renderer.gl

    this.onBeforeRender = onBeforeRender
    this.onAfterRender = onAfterRender

    this.render = this.render.bind(this)
    this.resize = this.resize.bind(this)

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  /** The underlying `<canvas>` element. Append this to the document yourself. */
  get canvas(): HTMLCanvasElement {
    return this.gl.canvas
  }

  /**
   * Synchronises the GL canvas buffer size with the layout viewport.
   *
   * Uses `document.documentElement.clientWidth/clientHeight` rather than
   * `window.innerWidth/innerHeight` because on systems with classic
   * (non-overlay) scrollbars `innerWidth` includes the scrollbar gutter,
   * while a `position:fixed; width:100%` canvas does not — causing every
   * scissor rect to clip a few pixels short on the trailing edge.
   *
   * Called automatically on construction and on every `resize` event.
   */
  resize() {
    const el = document.documentElement
    this.renderer.dimensions = new Vec2(el.clientWidth, el.clientHeight)
  }

  /**
   * Registers a scene with the renderer. Scenes are rendered in insertion order.
   *
   * @param scene - The {@link ScrollScene} to add.
   */
  addScene(scene: ScrollScene) {
    this.#scenes.push(scene)
  }

  /**
   * Removes a previously registered scene.
   *
   * @param scene - The {@link ScrollScene} to remove.
   */
  removeScene(scene: ScrollScene) {
    this.#scenes = this.#scenes.filter((s) => s !== scene)
  }

  /**
   * The main render loop — called internally via `requestAnimationFrame`.
   * Do not call this directly; use the `playing` setter instead.
   *
   * @param t - Timestamp provided by `requestAnimationFrame`.
   */
  render(t: number) {
    const delta = t - this.#lastTime
    this.#lastTime = t

    if (this.#playing) requestAnimationFrame(this.render)

    this.onBeforeRender(delta)

    const { gl } = this
    const { dpr } = this.renderer
    const canvasWidth = this.renderer.dimensions.width * dpr
    const canvasHeight = this.renderer.dimensions.height * dpr

    // Clear the full canvas to transparent before scissored scene renders
    this.renderer.bindFramebuffer()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.enable(gl.SCISSOR_TEST)

    for (const scrollScene of this.#scenes) {
      if (!scrollScene.visible) continue

      const { x, y, width, height, rect } = scrollScene.glRect(
        canvasHeight,
        dpr
      )

      if (width <= 0 || height <= 0) continue

      scrollScene.u_time.value =
        (scrollScene.u_time.value as number) + delta * 0.00005
      scrollScene.u_resolution.value = [width, height]
      scrollScene.u_origin.value = [
        x,
        y,
        ((x + width * 0.5) / canvasWidth) * 2 - 1,
        ((y + height * 0.5) / canvasHeight) * 2 - 1
      ]
      if (scrollScene.elementSpace && scrollScene.u_elementSize) {
        scrollScene.u_elementSize.value = [
          (width / canvasWidth) * 2,
          (height / canvasHeight) * 2
        ]
      }

      scrollScene.onBeforeRender(delta, rect)

      const vp = scrollScene.useViewport
        ? ([new Vec2(width, height), new Vec2(x, y)] as [Vec2, Vec2])
        : undefined

      if (scrollScene.clipToViewport) {
        gl.scissor(x, y, width, height)
        this.renderer.render({
          scene: scrollScene.scene,
          camera: scrollScene.camera,
          clear: scrollScene.clearOnRender,
          viewport: vp
        })
      } else {
        gl.disable(gl.SCISSOR_TEST)
        this.renderer.render({
          scene: scrollScene.scene,
          camera: scrollScene.camera,
          clear: false,
          viewport: vp
        })
        gl.enable(gl.SCISSOR_TEST)
      }

      scrollScene.onAfterRender(delta, rect)
    }

    gl.disable(gl.SCISSOR_TEST)

    this.onAfterRender(delta)
  }

  /**
   * Controls the render loop. Setting to `true` starts `requestAnimationFrame`;
   * setting to `false` stops it.
   */
  set playing(v: boolean) {
    if (!this.#playing && v) {
      requestAnimationFrame(this.render)
      this.#playing = true
    } else if (!v) {
      this.#lastTime = 0
      this.#playing = false
    }
  }

  /** Whether the render loop is currently running. */
  get playing(): boolean {
    return this.#playing
  }

  /**
   * Stops the render loop, removes the resize listener, and destroys all
   * registered scenes. Call when tearing down the renderer.
   */
  destroy() {
    this.playing = false
    window.removeEventListener('resize', this.resize)
    this.#scenes.forEach((s) => s.destroy())
  }
}
