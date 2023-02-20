import { Obj, TransformFeedback, Renderer, Program, Mesh, Triangle, Uniform, PointCloud, GeometryAttribute, Camera, Plane, Texture } from './dist/index.modern.js';
import { Vec2 } from 'https://cdn.skypack.dev/wtc-math@1.0.17'
import { particleCloudV, particleCloudF } from "./particleShaders.js"
import { logoV, logoF} from "./logoShaders.js"
import { bgV, bgF } from "./bgShaders.js";

function repl(frag, repl) {
  for (let i in repl) {
    frag = frag.replaceAll(`%%${i}%%`, repl[i])
  }
  return frag
}
class ParticleSimulation {
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

  constructor({
    dimensions = new Vec2(window.innerWidth, window.innerHeight),
    container = document.body,
    autoResize = true,
    uniforms = {},
    numParticles = 128 * 128,
    simDimensions = 3,
    rendererProps = {}
  } = {}) {
    this.render = this.render.bind(this)
    this.resize = this.resize.bind(this)
    this.autoResize = autoResize

    this.dpr = 2

    this.dimensions = dimensions
    this.simDimensions = simDimensions
    this.numParticles = numParticles

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

    this.renderer = new Renderer({ ...rendererProps, dpr: this.dpr })
    const gl = (this.gl = this.renderer.gl)
    gl.clearColor(0, 0, 0, 1)
    // gl.colorMask(false, false, false, true)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    // gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    // gl.blendFunc(gl.ONE, gl.ONE)

    if (this.autoResize) {
      window.addEventListener('resize', this.resize, false)
      this.resize()
    } else {
      this.renderer.dimensions = dimensions
    }

    this.scene = new Obj();

    this.createBackground();
    this.createLogo();
    this.createPointCloud();

    this.playing = false

    container.appendChild(this.gl.canvas)
  }

  createBackground() {
    const vertex = bgV
    const fragment = bgF
    
    const sprite = new Plane(this.gl, {
      width: this.dimensions.x * this.dpr,
      height: this.dimensions.y * this.dpr
    })

    const program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: {
        u_time: this.u_time,
        u_resolution: this.u_resolution
      }
    })

    this.bgMesh = new Mesh(this.gl, {
      geometry: sprite,
      program: program
    })
  }

  createLogo() {
    const vertex = logoV
    const fragment = repl(logoF, { seed: Math.random() * 100 - 50 });

    const img = new Image();
    const texture = new Texture(this.gl, { generateMipmaps: false})
    const logoUniform = new Uniform({
      name: 'u_logo',
      value: texture,
      kind: 'sampler'
    })
    img.addEventListener('load', () => {
      texture.image = img
      texture.update();
      
    const sprite = new Plane(this.gl, { width: 587 * 3, height: 504 * 3 })

    const program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: {
        u_logo: logoUniform,
        u_time: this.u_time,
        u_resolution: this.u_resolution
      }
    })

    const mesh = new Mesh(this.gl, {
      geometry: sprite,
      program: program
    })
    // mesh.setParent(this.scene)
    this.logoMesh = mesh
    this.playing = true
    });
    img.src = "./logo-shadow-2x.png";

  }

  createPointCloud() {
    const vertex = particleCloudV
    const fragment = particleCloudF

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
    
    for (
      let i = 0;
      i < this.numParticles * 4;
      i += 4
    ) {
      

      this.properties[i] = .5 + .5 * Math.random();     // density
      this.properties[i + 1] = .8 + Math.random() * .2; // drift
      this.properties[i + 2] = this.position[i / 2 + 1] * .17;                      // age
      this.properties[i + 3] = Math.random()
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

    window.particleProgram = particleProgram;

    this.particleMesh = new Mesh(this.gl, {
      mode: this.gl.POINTS,
      geometry: cloud,
      program: particleProgram
    })
    // this.particleMesh.setParent(this.scene)
  }

  render(t) {
    const diff = t - this.lastTime
    this.lastTime = t

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    const v = this.u_time.value
    this.u_time.value = v + diff * 0.00005

    window.mesh = this.mesh

    let gl = this.gl

    // gl.colorMask(false, false, false, true)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    // gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.blendEquation(gl.FUNC_ADD)
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    // gl.blendFunc(gl.ONE, gl.ONE)

    this.renderer.render({
      scene: this.bgMesh,
      camera: this.camera,
      update: this.update,
      sort: this.sort,
      frustumCull: this.frustumCull,
      clear: this.clear,
      viewport: this.viewport
    });
    this.renderer.render({
      scene: this.particleMesh,
      camera: this.camera,
      update: this.update,
      sort: this.sort,
      frustumCull: this.frustumCull,
      clear: false,
      viewport: this.viewport
    })
    if(this.logoMesh) {
      
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      this.renderer.render({
        scene: this.logoMesh,
        camera: this.camera,
        update: this.update,
        sort: this.sort,
        frustumCull: this.frustumCull,
        viewport: this.viewport,
        clear: false
      })
    }
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
}

const s = new ParticleSimulation({
  numParticles: 3000,
  simDimensions: 2,
  rendererProps: {
    preserveDrawingBuffer: true,
    depth: false,
    alpha: false,
    premultipliedAlpha: true
  }
})