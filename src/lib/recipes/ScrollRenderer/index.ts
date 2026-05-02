import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import type { Obj } from '../../core/Object'
import type { Camera } from '../../core/Camera'
import { Renderer, type RendererOptions } from '../../core/Renderer'
import { Uniform } from '../../core/Uniform'

export interface ScrollSceneOptions {
  element: HTMLElement
  scene: Obj
  camera?: Camera
  useViewport?: boolean
  clearOnRender?: boolean
  onBeforeRender?: (delta: number, rect: DOMRect) => void
  onAfterRender?: (delta: number, rect: DOMRect) => void
}

export class ScrollScene {
  element: HTMLElement
  scene: Obj
  camera?: Camera
  useViewport: boolean
  clearOnRender: boolean

  u_time: Uniform
  u_resolution: Uniform
  u_origin: Uniform
  uniforms: WTCGLUniformArray

  visible: boolean = true

  onBeforeRender: (delta: number, rect: DOMRect) => void
  onAfterRender: (delta: number, rect: DOMRect) => void

  #observer: IntersectionObserver

  constructor({
    element,
    scene,
    camera,
    useViewport = true,
    clearOnRender = true,
    onBeforeRender = () => {},
    onAfterRender = () => {}
  }: ScrollSceneOptions) {
    this.element = element
    this.scene = scene
    this.camera = camera
    this.useViewport = useViewport
    this.clearOnRender = clearOnRender
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
      value: [0, 0],
      kind: 'float_vec2'
    })
    this.uniforms = {
      u_time: this.u_time,
      u_resolution: this.u_resolution,
      u_origin: this.u_origin
    }

    this.#observer = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting
    })
    this.#observer.observe(element)
  }

  /**
   * Converts the element's current bounding rect to GL viewport coordinates.
   * canvasHeight must be in physical pixels (renderer.dimensions.height * dpr).
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

  destroy() {
    this.#observer.disconnect()
  }
}

export interface ScrollRendererOptions {
  rendererProps?: Partial<RendererOptions>
  onBeforeRender?: (delta: number) => void
  onAfterRender?: (delta: number) => void
}

export class ScrollRenderer {
  renderer: Renderer
  gl: WTCGLRenderingContext

  onBeforeRender: (delta: number) => void
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

  get canvas(): HTMLCanvasElement {
    return this.gl.canvas
  }

  resize() {
    const el = document.documentElement
    this.renderer.dimensions = new Vec2(el.clientWidth, el.clientHeight)
  }

  addScene(scene: ScrollScene) {
    this.#scenes.push(scene)
  }

  removeScene(scene: ScrollScene) {
    this.#scenes = this.#scenes.filter((s) => s !== scene)
  }

  render(t: number) {
    const delta = t - this.#lastTime
    this.#lastTime = t

    if (this.#playing) requestAnimationFrame(this.render)

    this.onBeforeRender(delta)

    const { gl } = this
    const { dpr } = this.renderer
    const canvasWidth = this.renderer.dimensions.width * dpr
    const canvasHeight = this.renderer.dimensions.height * dpr

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

      scrollScene.onBeforeRender(delta, rect)

      if (scrollScene.useViewport) {
        gl.scissor(x, y, width, height)
        this.renderer.render({
          scene: scrollScene.scene,
          camera: scrollScene.camera,
          clear: scrollScene.clearOnRender,
          viewport: [new Vec2(width, height), new Vec2(x, y)]
        })
      } else {
        gl.disable(gl.SCISSOR_TEST)
        this.renderer.render({
          scene: scrollScene.scene,
          camera: scrollScene.camera,
          clear: false
        })
        gl.enable(gl.SCISSOR_TEST)
      }

      scrollScene.onAfterRender(delta, rect)
    }

    gl.disable(gl.SCISSOR_TEST)

    this.onAfterRender(delta)
  }

  set playing(v: boolean) {
    if (!this.#playing && v) {
      requestAnimationFrame(this.render)
      this.#playing = true
    } else if (!v) {
      this.#lastTime = 0
      this.#playing = false
    }
  }

  get playing(): boolean {
    return this.#playing
  }

  destroy() {
    this.playing = false
    window.removeEventListener('resize', this.resize)
    this.#scenes.forEach((s) => s.destroy())
  }
}
