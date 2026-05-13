import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext } from '../../types'
import { Renderer, type RendererOptions } from '../../core/Renderer'
import { ScrollScene } from './ScrollScene'

/** Options passed to the {@link ScrollRenderer} constructor. */
export interface ScrollRendererOptions {
  /**
   * Props forwarded to the underlying {@link Renderer}. `autoClear` is always
   * overridden to `false`.
   *
   * Pass `canvas` here to use an existing `<canvas>` element instead of
   * letting the renderer create one. This is particularly useful in React,
   * where you can attach a `ref` to a `<canvas>` and pass the element in:
   *
   * ```tsx
   * const canvasRef = useRef<HTMLCanvasElement>(null)
   * // inside useEffect:
   * new ScrollRenderer({ rendererProps: { canvas: canvasRef.current } })
   * ```
   *
   * When supplying your own canvas you are responsible for positioning it
   * (fixed, full-viewport, pointer-events: none) and for removing it from the
   * DOM on teardown.
   */
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
 *
 * @example <caption>React — pass a canvas ref so React owns the DOM node</caption>
 * // In your component:
 * const canvasRef = useRef<HTMLCanvasElement>(null)
 * useEffect(() => {
 *   const renderer = new ScrollRenderer({ rendererProps: { canvas: canvasRef.current! } })
 *   renderer.playing = true
 *   return () => { renderer.destroy() }  // canvas stays in the DOM; React removes it
 * }, [])
 * // In JSX:
 * <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
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
   * Removes a previously registered scene from the render loop.
   *
   * This does **not** call {@link ScrollScene.destroy} — the caller is
   * responsible for disconnecting the scene's `IntersectionObserver` by
   * calling `scene.destroy()` when it is no longer needed.
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
   * registered scenes (disconnecting their `IntersectionObserver`s).
   *
   * Returns the underlying `<canvas>` element so callers can remove it from
   * the DOM if they own it. When using a React-managed canvas (passed via
   * `rendererProps.canvas`) you don't need the return value — React will
   * remove the element itself on unmount.
   *
   * @returns The canvas element.
   */
  destroy(): HTMLCanvasElement {
    this.playing = false
    window.removeEventListener('resize', this.resize)
    this.#scenes.forEach((s) => s.destroy())
    return this.canvas
  }
}
