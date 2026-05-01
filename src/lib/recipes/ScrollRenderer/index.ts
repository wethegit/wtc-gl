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
      value: [0, 0, 0, 0],
      kind: 'float_vec4'
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

    for (const scrollScene of this.#scenes) {
      if (!scrollScene.visible) continue

      if (width <= 0 || height <= 0) continue

      scrollScene.onBeforeRender(delta, rect)

      this.renderer.render({
        scene: scrollScene.scene,
        camera: scrollScene.camera,
        clear: false
      })

      scrollScene.onAfterRender(delta, rect)
    }

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
