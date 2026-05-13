import type { WTCGLRenderingContext } from '../../types'
import { Uniform } from '../../core/Uniform'
import { Texture } from '../../core/Texture'
import { ScrollScene, type ScrollSceneOptions } from './ScrollScene'

/**
 * Augmented 2D context type with the experimental `drawElementImage` method.
 * Requires `chrome://flags/#canvas-draw-element` to be enabled.
 * @see https://github.com/WICG/html-in-canvas
 */
interface CanvasRenderingContext2DWithElementDraw
  extends CanvasRenderingContext2D {
  drawElementImage(
    element: HTMLElement,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number
  ): void
}

/** Options passed to the {@link ScrollHTML} constructor. */
export interface ScrollHTMLOptions extends ScrollSceneOptions {
  /** The GL rendering context from the parent {@link ScrollRenderer}. */
  gl: WTCGLRenderingContext
  /**
   * The element to render as a GPU texture via the HTML-in-Canvas API.
   * This element will be moved into an internal `<canvas layoutsubtree>`
   * managed by `ScrollHTML` — it will no longer be in its original DOM
   * position.
   *
   * When omitted, `element` is used. If `element` and `htmlElement` are the
   * same node, that node is moved into the capture canvas and `element` is
   * replaced in the original DOM by a size-matched placeholder `<div>` so
   * that {@link ScrollScene}'s position tracking continues to work.
   */
  htmlElement?: HTMLElement
}

/**
 * A {@link ScrollScene} variant that renders an arbitrary `HTMLElement` into a
 * GPU texture using the experimental
 * [HTML-in-Canvas API](https://github.com/WICG/html-in-canvas) and exposes it
 * as two auto-managed uniforms:
 *
 * | Uniform       | Type        | Description |
 * |---------------|-------------|-------------|
 * | `u_html`      | `sampler2D` | Live texture of the rendered HTML element. |
 * | `u_htmlSize`  | `vec2`      | Pixel dimensions of the capture canvas. |
 *
 * **Browser support:** requires Chromium with
 * `chrome://flags/#canvas-draw-element` enabled. The class feature-detects the
 * API; if it is absent the uniforms are registered but the texture is never
 * populated.
 *
 * @example
 * const card = document.querySelector('.card')
 * const anchor = document.querySelector('.card-anchor')
 * const drawable = new Drawable(gl)
 * const scene = new ScrollHTML({ gl, element: anchor, htmlElement: card, scene: drawable })
 * new Mesh(gl, {
 *   geometry: new Plane(gl),
 *   program: new Program(gl, {
 *     vertex: vert,
 *     fragment: frag,
 *     uniforms: { ...scene.uniforms },
 *   }),
 * }).setParent(drawable)
 * renderer.addScene(scene)
 */
export class ScrollHTML extends ScrollScene {
  /** The `sampler2D` uniform pointing at the HTML texture. */
  u_html: Uniform
  /** The `vec2` uniform containing the capture canvas pixel dimensions. */
  u_htmlSize: Uniform
  /** The underlying {@link Texture} wrapping the HTML capture canvas. */
  texture: Texture

  readonly #captureCanvas: HTMLCanvasElement

  /** The internal 2D `<canvas layoutsubtree>` that captures the HTML element. Style or position it to enable pointer events on contained form elements. */
  get captureCanvas(): HTMLCanvasElement {
    return this.#captureCanvas
  }
  readonly #ctx: CanvasRenderingContext2DWithElementDraw | null
  readonly #htmlElement: HTMLElement
  readonly #placeholder: HTMLDivElement | null
  readonly #resizeObserver: ResizeObserver
  readonly #paintHandler: () => void

  /** Whether the first `paint` snapshot has been recorded. */
  #ready: boolean = false

  constructor({
    gl,
    htmlElement,
    element,
    onBeforeRender,
    ...rest
  }: ScrollHTMLOptions) {
    // Wrap onBeforeRender so we can inject our per-frame capture
    let captureThisFrame: (() => void) | null = null
    super({
      element,
      onBeforeRender: (delta, rect) => {
        captureThisFrame?.()
        onBeforeRender?.(delta, rect)
      },
      ...rest
    })

    const isSameElement = !htmlElement || htmlElement === element
    this.#htmlElement = htmlElement ?? element

    // If htmlElement and element are the same node we need a placeholder in
    // the original DOM position so ScrollScene's rect tracking still works.
    if (isSameElement) {
      const rect = element.getBoundingClientRect()
      const ph = document.createElement('div')
      Object.assign(ph.style, {
        display: 'block',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        visibility: 'hidden',
        pointerEvents: 'none'
      })
      element.parentNode?.insertBefore(ph, element)
      this.#placeholder = ph
    } else {
      this.#placeholder = null
    }

    // ── Capture canvas ───────────────────────────────────────────────────
    // A separate <canvas layoutsubtree> is used to capture the HTML element.
    // It is appended to document.body at a stable position so the browser
    // includes it in layout and fires `paint` events on it.
    this.#captureCanvas = document.createElement('canvas')
    this.#captureCanvas.setAttribute('layoutsubtree', '')
    Object.assign(this.#captureCanvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      // Visually hidden behind the WebGL canvas but still composited so the
      // browser does layout and fires `paint` events.
      zIndex: '-1',
      opacity: '0'
    })
    document.body.appendChild(this.#captureCanvas)
    this.#captureCanvas.appendChild(this.#htmlElement)

    const ctx = this.#captureCanvas.getContext(
      '2d'
    ) as CanvasRenderingContext2DWithElementDraw | null
    this.#ctx = ctx

    // ── Texture ──────────────────────────────────────────────────────────
    this.texture = new Texture(gl, {
      generateMipmaps: false,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE
    })

    this.u_html = new Uniform({
      name: 'u_html',
      value: this.texture,
      kind: 'texture'
    })
    this.u_htmlSize = new Uniform({
      name: 'u_htmlSize',
      value: [0, 0],
      kind: 'float_vec2'
    })

    this.uniforms.u_html = this.u_html
    this.uniforms.u_htmlSize = this.u_htmlSize

    // ── Size management ──────────────────────────────────────────────────
    const applySize = (w: number, h: number) => {
      const dpr = window.devicePixelRatio
      this.#captureCanvas.width = Math.round(w * dpr)
      this.#captureCanvas.height = Math.round(h * dpr)
      this.#captureCanvas.style.width = `${w}px`
      this.#captureCanvas.style.height = `${h}px`
      if (this.#placeholder) {
        this.#placeholder.style.width = `${w}px`
        this.#placeholder.style.height = `${h}px`
      }
    }

    this.#resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { inlineSize: w, blockSize: h } = entry.contentBoxSize[0]
        applySize(w, h)
      }
    })
    this.#resizeObserver.observe(this.#htmlElement)

    const initialRect = this.#htmlElement.getBoundingClientRect()
    applySize(initialRect.width || 300, initialRect.height || 150)

    // ── Paint event ──────────────────────────────────────────────────────
    // The `paint` event fires when the browser has a new snapshot ready.
    // After the first snapshot we can call drawElementImage every frame.
    this.#paintHandler = () => {
      this.#ready = true
      this.#capture()
    }
    this.#captureCanvas.addEventListener('paint', this.#paintHandler)

    // Hook into each frame via the wrapped onBeforeRender
    captureThisFrame = () => {
      if (this.#ready) this.#capture()
    }
  }

  #capture() {
    const ctx = this.#ctx
    if (!ctx || typeof ctx.drawElementImage !== 'function') return

    const w = this.#captureCanvas.width
    const h = this.#captureCanvas.height
    if (w === 0 || h === 0) return

    ctx.clearRect(0, 0, w, h)
    ctx.drawElementImage(this.#htmlElement, 0, 0, w, h)

    this.texture.image = this.#captureCanvas
    this.texture.needsUpdate = true
    this.u_htmlSize.value = [w, h]
  }

  /**
   * Disconnects all observers, removes the capture canvas, and restores the
   * HTML element to `document.body` if it was moved.
   *
   * The placeholder `<div>` (inserted when `htmlElement === element`) is also
   * removed.
   */
  destroy() {
    this.#resizeObserver.disconnect()
    this.#captureCanvas.removeEventListener('paint', this.#paintHandler)

    // Return the HTML element to document.body so callers can re-attach it
    if (this.#htmlElement.parentNode === this.#captureCanvas) {
      document.body.appendChild(this.#htmlElement)
    }

    this.#captureCanvas.remove()
    this.#placeholder?.remove()

    super.destroy()
  }
}
