import {
  WTCGLRenderingContext,
  WTCGLBlendFunction,
  WTCGLBlendEquation,
  WTCGLUniformMap,
  WTCGLAttributeMap,
  WTCGLActiveInfo
} from '../../types'
import { Renderer } from '../../core/Renderer'
import { Program } from '../../core/Program'
import { Mesh } from '../../core/Mesh'
import { Triangle } from '../../geometry/Triangle'
import { Uniform } from '../../core/Uniform'
import { Vec2 } from 'wtc-math'

const defaultShaderV = require('./vertex.gl')
const defaultShaderF = require('./fragment.gl')

interface WTCGLUniformArray {
  [index: string]: Uniform
}

class FragmentShader {
  uniforms: WTCGLUniformArray
  dimensions: Vec2
  autoResize: boolean = true
  onBeforeRender: (t: number) => {}
  onAfterRender: (t: number) => {}

  u_time: Uniform
  u_resolution: Uniform

  gl: WTCGLRenderingContext
  renderer: Renderer
  program: Program
  mesh: Mesh

  constructor({
    vertex = defaultShaderV,
    fragment = defaultShaderF,
    dimensions = new Vec2(window.innerWidth, window.innerHeight),
    container = document.body,
    autoResize = true,
    uniforms = {},
    onBeforeRender = (t: number) => {},
    onAfterRender = (t: number) => {}
  }: {
    vertex?: string
    fragment?: string
    dimensions?: Vec2
    container?: HTMLElement
    autoResize?: boolean
    uniforms?: WTCGLUniformArray
    onBeforeRender?: (delta: number) => void
    onAfterRender?: (delta: number) => void
  } = {}) {
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

    this.renderer = new Renderer()
    this.gl = this.renderer.gl
    container.appendChild(this.gl.canvas)
    this.gl.clearColor(1, 1, 1, 1)

    if (this.autoResize) {
      window.addEventListener('resize', this.resize, false)
      this.resize()
    } else {
      this.renderer.dimensions = dimensions
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
    this.dimensions = new Vec2(window.innerWidth, window.innerHeight)
    this.u_resolution.value = this.dimensions.array
    this.renderer.dimensions = this.dimensions
  }

  render(t) {
    this.onBeforeRender(t)

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    this.u_time.value = t * 0.0001

    this.renderer.render({ scene: this.mesh })

    this.onBeforeRender(t)
  }

  #playing: boolean = false
  set playing(v: boolean) {
    if (this.#playing !== true && v === true) {
      requestAnimationFrame(this.render)
      this.#playing = true
    } else {
      this.#playing = false
    }
  }
  get playing(): boolean {
    return this.#playing === true
  }
}

export { FragmentShader }
