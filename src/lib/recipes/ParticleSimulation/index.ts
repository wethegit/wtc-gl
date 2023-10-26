import { Vec2 } from 'wtc-math'

import type { WTCGLRenderingContext, WTCGLUniformArray } from '../../types'
import { Renderer } from '../../core/Renderer'
import { Program } from '../../core/Program'
import { Mesh } from '../../core/Mesh'
import { Uniform } from '../../core/Uniform'
import { PointCloud } from '../../geometry/PointCloud'
import { GeometryAttribute } from '../../geometry/GeometryAttribute'
import { Camera } from '../../core/Camera'
import { Framebuffer } from '../../ext/Framebuffer'

import defaultShaderF from './default-shader-frag.frag'
import defaultShaderV from './default-shader-vert.vert'

const hasWindow = typeof window !== 'undefined'

export interface ParticleSimulationOptions {
  vertex: string
  fragment: string
  dimensions: Vec2
  container: HTMLElement
  autoResize: boolean
  uniforms: WTCGLUniformArray
  onBeforeRender: (delta: number) => void
  onAfterRender: (delta: number) => void
  textureSize: number
  simDimensions: number
  createGeometry: () => void
  rendererProps: object
}

export class ParticleSimulation {
  uniforms
  dimensions
  autoResize = true
  onBeforeRender
  onAfterRender

  u_time
  u_resolution

  gl: WTCGLRenderingContext
  renderer: Renderer
  program: Program
  mesh: Mesh

  textureSize: number
  particles: number
  textureArraySize: number
  simDimensions: number

  references: Float32Array

  cloud: PointCloud

  lastTime = 0

  constructor({
    vertex = defaultShaderV,
    fragment = defaultShaderF,
    dimensions = hasWindow
      ? new Vec2(window.innerWidth, window.innerHeight)
      : new Vec2(500, 500),
    container = document.body,
    autoResize = true,
    uniforms = {},
    onBeforeRender = () => {},
    onAfterRender = () => {},
    textureSize = 128,
    simDimensions = 3,
    createGeometry,
    rendererProps = {}
  }: Partial<ParticleSimulationOptions> = {}) {
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
    this.gl = this.renderer.gl
    this.gl.clearColor(0, 0, 0, 1)

    if (this.autoResize && hasWindow) {
      window.addEventListener('resize', this.resize, false)
      this.resize()
    } else {
      this.renderer.dimensions = dimensions
    }

    this.textureSize = textureSize
    this.particles = Math.pow(this.textureSize, 2)
    this.textureArraySize = this.particles * 4
    this.simDimensions = simDimensions

    this.references = new Float32Array(this.particles * 2).fill(0) // The references - used for texture lookups

    if (createGeometry && typeof createGeometry === 'function') {
      createGeometry.bind(this)()
    } else {
      this.createGeometry()
    }

    this.program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: this.uniforms
    })

    this.mesh = new Mesh(this.gl, {
      mode: this.gl.POINTS,
      geometry: this.cloud,
      program: this.program
    })

    this.playing = true

    container.appendChild(this.gl.canvas)
  }

  createGeometry() {
    this.cloud = new PointCloud(this.gl, {
      fillFunction: (points, dimensions) => {
        for (let i = 0; i < points.length; i += 2) {
          const index = i / 2

          const pos = new Vec2(
            index % this.textureSize,
            Math.floor(index / this.textureSize)
          )

          this.references[i] = pos.x / this.textureSize // x position of the texture particle representing this ant
          this.references[i + 1] = pos.y / this.textureSize // y position of the texture particle representing this ant
        }
        for (let i = 0; i < points.length; i += dimensions) {
          for (let j = 0; j < dimensions; j++) {
            points[i + j] = Math.random() * 400 - 200 // n position
          }
        }
      },
      particles: this.particles,
      dimensions: this.simDimensions,
      attributes: {
        reference: new GeometryAttribute({ size: 2, data: this.references })
      }
    })
  }

  render(t) {
    const diff = t - this.lastTime
    this.lastTime = t

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    const v = this.u_time.value as number
    this.u_time.value = v + diff * 0.00005

    this.onBeforeRender(t, this)

    if (this.post)
      this.post.render(this.renderer, {
        scene: this.mesh,
        camera: this.camera,
        update: this.update,
        sort: this.sort,
        frustumCull: this.frustumCull,
        clear: this.clear,
        viewport: this.viewport
      })
    else
      this.renderer.render({
        scene: this.mesh,
        camera: this.camera,
        update: this.update,
        sort: this.sort,
        frustumCull: this.frustumCull,
        clear: this.clear,
        viewport: this.viewport
      })

    this.onAfterRender(t)
  }

  resize() {
    this.dimensions = hasWindow
      ? new Vec2(window.innerWidth, window.innerHeight)
      : new Vec2(500, 500)
    this.u_resolution.value = this.dimensions.scaleNew(this.renderer.dpr).array
    this.renderer.dimensions = this.dimensions
  }

  #post: Framebuffer
  set post(p) {
    if (p.render) {
      this.#post = p
    }
  }
  get post() {
    return this.#post || null
  }

  #playing = false
  set playing(v) {
    if (this.#playing !== true && v === true) {
      requestAnimationFrame(this.render)
      this.#playing = true
    } else if (v == false) {
      this.#playing = false
    }
  }
  get playing() {
    return this.#playing === true
  }

  // Getters and setters for renderer

  #camera: null | Camera
  set camera(v) {
    if (v == null || v instanceof Camera) {
      this.#camera = v
    }
  }
  get camera() {
    return this.#camera
  }

  #update: boolean = true
  set update(v) {
    this.#update = v === true
  }
  get update() {
    return this.#update
  }

  #sort: boolean = true
  set sort(v) {
    this.#sort = v === true
  }
  get sort() {
    return this.#sort
  }

  #frustumCull: boolean = true
  set frustumCull(v) {
    this.#frustumCull = v === true
  }
  get frustumCull() {
    return this.#frustumCull
  }

  #clear: boolean | null
  set clear(v) {
    this.#clear = v === true
  }
  get clear() {
    return this.#clear
  }

  #viewport: [Vec2, Vec2] | null
  set viewport(v) {
    if (
      (v instanceof Array && v[0] instanceof Vec2 && v[1] instanceof Vec2) ||
      v == null
    )
      this.#viewport = v
  }
  get viewport() {
    return this.#viewport
  }
}
