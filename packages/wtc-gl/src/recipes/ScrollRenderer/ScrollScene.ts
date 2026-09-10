import type { WTCGLUniformArray } from '../../types'
import type { Obj } from '../../core/Object'
import type { Camera } from '../../core/Camera'
import { Uniform } from '../../core/Uniform'

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
  /**
   * CSS class added to the element when the scene is successfully registered
   * with a {@link ScrollRenderer} (i.e. when WebGL is confirmed working).
   * Useful for revealing content that should only be visible when WebGL is
   * active — hide it by default in CSS, then show it via this class.
   */
  initializedClass?: string
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
 * Note that in a renderer using `layout: 'absolute'` the canvas extends
 * `renderer.overscanPx` beyond the viewport on both ends, so "canvas space"
 * is larger than the viewport.
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

  /** @see {@link ScrollSceneOptions.initializedClass} */
  initializedClass?: string

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
    initializedClass = 'scroll-scene--initialized',
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
    this.initializedClass = initializedClass
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
   * @param offsetY - Distance in CSS px that the canvas top sits above the
   *   viewport top (the overscan band in absolute layout). `0` in fixed layout.
   * @returns GL-space `x`, `y`, `width`, `height` (all in physical pixels) plus the raw `DOMRect`.
   */
  glRect(
    canvasHeight: number,
    dpr: number,
    offsetY: number = 0
  ): { x: number; y: number; width: number; height: number; rect: DOMRect } {
    const rect = this.element.getBoundingClientRect()
    return {
      x: Math.round(rect.left * dpr),
      y: Math.round(canvasHeight - (rect.bottom + offsetY) * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr),
      rect
    }
  }

  /**
   * Disconnects the `IntersectionObserver`. Call when permanently removing
   * this scene — either directly or via {@link ScrollRenderer.removeScene}.
   */
  destroy() {
    this.#observer.disconnect()
  }
}
