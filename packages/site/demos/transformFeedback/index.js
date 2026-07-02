import {
  Obj,
  TransformFeedback,
  Renderer,
  Program,
  Mesh,
  Uniform,
  PointCloud,
  GeometryAttribute,
  Camera,
  Vec2
} from 'wtc-gl'

import vertex from './particles.vert'
import fragment from './particle.frag'

class TFParticles {
  uniforms
  dimensions
  autoResize = true

  u_time
  u_resolution

  gl
  renderer
  program
  mesh

  numParticles
  simDimensions

  references
  properties

  cloud

  lastTime = 0
  timeMultiplier = 1

  constructor({
    dimensions = new Vec2(window.innerWidth, window.innerHeight),
    canvas,
    // autoResize = true,
    uniforms = {},
    numParticles = 128 * 128,
    simDimensions = 3,
    onBeforeRender,
    rendererProps = {}
  } = {}) {
    this.render = this.render.bind(this)
    this.resize = this.resize.bind(this)

    this.dpr = 2

    this.dimensions = dimensions
    this.simDimensions = simDimensions
    this.numParticles = numParticles

    this.u_time = new Uniform({
      name: 'time',
      value: -100 + Math.random() * 200,
      kind: 'float'
    })
    this.u_resolution = new Uniform({
      name: 'resolution',
      value: this.dimensions.array,
      kind: 'float_vec2'
    })

    this.uniforms = Object.assign({}, uniforms, {
      u_time: this.u_time,
      u_resolution: this.u_resolution
    })

    this.renderer = new Renderer({ ...rendererProps, dpr: this.dpr })
    console.log(this.renderer)
    const gl = (this.gl = this.renderer.gl)
    gl.clearColor(0, 0, 0, 1)
    // gl.disable(gl.DEPTH_TEST)
    gl.depthMask(false)
    gl.enable(gl.BLEND)

    this.scene = new Obj()

    this.createPointCloud()

    this.playing = false

    document.body.appendChild(this.gl.canvas)

    window.addEventListener('resize', this.resize, false)
    this.resize()
  }

  createPointCloud() {
    this.position = new Float32Array(this.numParticles * this.simDimensions)
    this.velocity = new Float32Array(this.numParticles * this.simDimensions)
    this.properties = new Float32Array(this.numParticles * 4)
    for (
      let i = 0;
      i < this.numParticles * this.simDimensions;
      i += this.simDimensions
    ) {
      this.position[i] = Math.random() * this.dimensions.x * this.dpr
      this.position[i + 1] = Math.random() * this.dimensions.y * this.dpr

      this.velocity[i] = Math.random() * 10 - 5
      this.velocity[i + 1] = Math.random() * 5
    }

    for (let i = 0; i < this.numParticles * 4; i += 4) {
      this.properties[i] = 0.4 + 0.6 * Math.random() // density
      this.properties[i + 1] = 0.8 + Math.random() * 0.2 // drift
      this.properties[i + 2] = this.position[i / 2 + 1] * 0.17 // age
      this.properties[i + 3] = Math.random() * Math.random()
    }

    const particleProgram = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: this.uniforms,
      transformFeedbackVaryings: ['v_position', 'v_velocity', 'v_properties']
    })

    this.transformFeedbacks = new TransformFeedback(this.gl, {
      program: particleProgram.program,
      transformFeedbacks: {
        a_position: {
          data: this.position,
          size: this.simDimensions,
          usage: this.gl.STREAM_COPY,
          varying: 'v_position'
        },
        a_velocity: {
          data: this.velocity,
          size: this.simDimensions,
          usage: this.gl.STREAM_COPY,
          varying: 'v_velocity'
        },
        a_properties: {
          data: this.properties,
          size: 4,
          usage: this.gl.STREAM_COPY,
          varying: 'v_properties'
        }
      }
    })

    let positions = this.position
    const cloud = new PointCloud(this.gl, {
      fillFunction: (points, dimensions) => {
        for (let i = 0; i < points.length; i++) {
          points[i] = positions[i]
        }
      },
      particles: this.numParticles,
      dimensions: this.simDimensions,
      attributes: {
        position: new GeometryAttribute({ size: 2, data: this.position })
      },
      transformFeedbacks: this.transformFeedbacks
    })

    this.particleMesh = new Mesh(this.gl, {
      mode: this.gl.POINTS,
      geometry: cloud,
      program: particleProgram
    })
    // this.particleMesh.setParent(this.scene)
  }

  render(t) {
    // console.log('ss')
    const firstRun = this.lastTime == 0
    const diff = t - this.lastTime
    this.lastTime = t

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    if (firstRun) return

    const v = this.u_time.value
    const new_u_time = v + diff * 0.00005 * this.timeMultiplier
    this.u_time.value = new_u_time

    let gl = this.gl

    // gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    //gl.blendEquation(gl.FUNC_ADD)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    this.renderer.render({
      scene: this.particleMesh,
      camera: this.camera,
      update: this.update,
      sort: this.sort,
      frustumCull: this.frustumCull,
      clear: false,
      viewport: this.viewport
    })
  }

  resize() {
    this.dimensions = new Vec2(window.innerWidth, window.innerHeight)
    this.u_resolution.value = this.dimensions.scaleNew(this.renderer.dpr).array
    this.renderer.dimensions = this.dimensions
  }

  _post
  set post(p) {
    if (p.render) {
      this._post = p
    }
  }
  get post() {
    return this._post || null
  }

  _playing = false
  set playing(v) {
    if (this._playing !== true && v === true) {
      requestAnimationFrame(this.render)
      this._playing = true
    } else {
      this._playing = false
    }
  }
  get playing() {
    return this._playing === true
  }

  // Getters and setters for renderer

  _camera
  set camera(v) {
    if (v == null || v instanceof Camera) {
      this._camera = v
    }
  }
  get camera() {
    return this._camera
  }

  _update = true
  set update(v) {
    this._update = v === true
  }
  get update() {
    return this._update
  }

  _sort
  set sort(v) {
    this._sort = v === true
  }
  get sort() {
    return this._sort
  }

  _frustumCull
  set frustumCull(v) {
    this._frustumCull = v === true
  }
  get frustumCull() {
    return this._frustumCull
  }

  _clear
  set clear(v) {
    this._clear = v === true
  }
  get clear() {
    return this._clear
  }

  _viewport
  set viewport(v) {
    if (
      (v instanceof Array && v[0] instanceof Vec2 && v[1] instanceof Vec2) ||
      v == null
    )
      this._viewport = v
  }
  get viewport() {
    return this._viewport
  }

  set progress(value) {
    this.uniforms.u_progress.value = value
  }

  get progress() {
    return this.uniforms.u_progress.value
  }

  set fadeOut(v) {
    if (v == true) {
      this.timeMultiplier = 5
      this.u_fadeout.value = this.u_time.value
    }
  }
  get fadeOut() {
    return this.u_fadeout.value
  }
  set direction(v) {
    this.u_direction.value = v
  }
  get direction() {
    return this.u_direction.value
  }
}

const particles = new TFParticles({
  numParticles: 100000,
  simDimensions: 2,
  rendererProps: {
    // depth: false,
    premultipliedAlpha: true
  }
})
particles.playing = true
