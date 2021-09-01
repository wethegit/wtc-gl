import { WTCGLRenderingContext } from '../../types'
import { Renderer } from '../../core/Renderer'
import { Program } from '../../core/Program'
import { Mesh } from '../../core/Mesh'
import { Triangle } from '../../geometry/Triangle'
import { Uniform } from '../../core/Uniform'
import { Vec2 } from 'wtc-math'

const defaultShaderV = `
attribute vec3 position;
attribute vec2 uv;

varying vec2 v_uv;

void main() {
gl_Position = vec4(position, 1.0);
v_uv = uv;
}
`
const defaultShaderF = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform sampler2D s_noise;

uniform sampler2D b_noise;

varying vec2 v_uv;

void main() {
gl_FragColor = vec4(vec3(cos(length(v_uv+u_time))*.5+.5, sin(v_uv+u_time)*.5+.5),1);
}
`

let lastTime = 0;

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

    const diff = t - lastTime;
    lastTime = t;


    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    const v:number = this.u_time.value as number;
    this.u_time.value = v + diff * 0.00005

    if(this.post) this.post.render({ scene: this.mesh })
    else this.renderer.render({ scene: this.mesh })

    this.onAfterRender(t)
  }

  #post
  set post(p) {
    if(p.render) {
      this.#post = p

    }
  }
  get post() {
    return this.#post || null;
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
