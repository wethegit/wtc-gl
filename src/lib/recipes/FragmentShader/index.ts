import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import type { Framebuffer } from '../../ext/Framebuffer'
import { Renderer } from '../../core/Renderer'
import { Program } from '../../core/Program'
import { Mesh } from '../../core/Mesh'
import { Triangle } from '../../geometry/Triangle'
import { Uniform } from '../../core/Uniform'

import defaultShaderF from './default-shader-frag.frag'
import defaultShaderV from './default-shader-vert.vert'

export interface FragmentShaderOptions {
  vertex: string
  fragment: string
  dimensions: Vec2
  container: HTMLElement
  autoResize: boolean
  uniforms: WTCGLUniformArray
  onInit: (renderer: Renderer) => void
  onBeforeRender: (delta: number) => void
  onAfterRender: (delta: number) => void
  rendererProps: object
}

const hasWindow = typeof window !== 'undefined'

export class FragmentShader {
  uniforms: WTCGLUniformArray
  dimensions: Vec2
  autoResize: boolean = true
  onBeforeRender: (t: number) => void
  onAfterRender: (t: number) => void

  u_time: Uniform
  u_resolution: Uniform

  gl: WTCGLRenderingContext
  renderer: Renderer
  program: Program
  mesh: Mesh

  lastTime: number = 0

  constructor({
    vertex = defaultShaderV,
    fragment = defaultShaderF,
    dimensions = hasWindow
      ? new Vec2(window.innerWidth, window.innerHeight)
      : new Vec2(500, 500),
    container = document.body,
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

    this.renderer = new Renderer(rendererProps)
    onInit(this.renderer)
    this.gl = this.renderer.gl
    container.appendChild(this.gl.canvas)
    this.gl.clearColor(1, 1, 1, 1)

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

  resize() {
    this.dimensions = hasWindow
      ? new Vec2(window.innerWidth, window.innerHeight)
      : new Vec2(500, 500)
    this.u_resolution.value = this.dimensions.scaleNew(this.renderer.dpr).array
    this.renderer.dimensions = this.dimensions
  }

  resetTime() {
    this.lastTime = 0
  }

  render(t: number) {
    const diff = t - this.lastTime
    this.lastTime = t

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    const v: number = this.u_time.value as number
    this.u_time.value = v + diff * 0.00005

    this.onBeforeRender(t)

    if (this.post) this.post.render(this.renderer, { scene: this.mesh })
    else this.renderer.render({ scene: this.mesh })

    this.onAfterRender(t)
  }

  #post: Framebuffer
  set post(p) {
    this.#post = p
  }
  get post() {
    return this.#post || null
  }

  #playing: boolean = false
  set playing(v: boolean) {
    if (this.#playing !== true && v === true) {
      requestAnimationFrame(this.render)
      this.#playing = true
    } else if (v == false) {
      this.lastTime = 0
      this.#playing = false
    }
  }
  get playing(): boolean {
    return this.#playing === true
  }
}
