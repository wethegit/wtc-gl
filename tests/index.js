import { TransformFeedback, Renderer, Program, Mesh, Triangle, Uniform, PointCloud, GeometryAttribute, Camera } from './dist/index.modern.js';
import { Vec2 } from 'https://cdn.skypack.dev/wtc-math@1.0.17'

const defaultShaderV = `#version 300 es

in vec2 position;

layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_velocity;

out vec2 v_position;
out vec2 v_velocity;

uniform vec2 u_resolution;
uniform float u_time;

// Grab from https://www.shadertoy.com/view/4djSRW
#define MOD3 vec3(.1031,.11369,.13787)
vec3 hash33(vec3 p3) {
	p3 = fract(p3 * MOD3);
    p3 += dot(p3, p3.yxz+19.19);
    return -1.0 + 2.0 * fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
}
float simplex_noise(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    
    // thx nikita: https://www.shadertoy.com/view/XsX3zB
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
	vec3 i1 = e * (1.0 - e.zxy);
	vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    
    vec3 d1 = d0 - (i1 - 1.0 * K2);
    vec3 d2 = d0 - (i2 - 2.0 * K2);
    vec3 d3 = d0 - (1.0 - 3.0 * K2);
    
    vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
    vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
    
    return dot(vec4(31.316), n);
}

void main() {
  v_position = a_position + a_velocity;
  float a = simplex_noise(vec3(v_position*.01, u_time*.1)) * 3.141596 * 2.;

  v_velocity = a_velocity * .98 + vec2(cos(a), sin(a)) * .1;
  v_position = v_position;

  if(v_position.x > u_resolution.x + 10.) v_position.x = -5.;
  if(v_position.x < -10.) v_position.x = u_resolution.x + 5.;
  if(v_position.y > u_resolution.y + 10.) v_position.y = -5.;
  if(v_position.y < -10.) v_position.y = u_resolution.y + 5.;
  
  gl_PointSize = 10.;
  gl_Position = vec4(v_position / u_resolution * 2. - 1., 0., 1.);
}`
const defaultShaderF = `#version 300 es
precision highp float;

out vec4 color;

uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_PointCoord.xy - .5;
  
  float opacity = clamp(smoothstep(.5, 0., length(uv)), 0., 1.);
  
  // if(opacity < .01) discard;
  // color = vec4(1)*opacity;
  color = vec4(1,1,1,opacity);
}`

class ParticleSimulation {
  uniforms
  dimensions
  autoResize = true
  onBeforeRender
  onAfterRender

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
    vertex = defaultShaderV,
    fragment = defaultShaderF,
    dimensions = new Vec2(window.innerWidth, window.innerHeight),
    container = document.body,
    autoResize = true,
    uniforms = {},
    onBeforeRender = (t) => {},
    onAfterRender = (t) => {},
    numParticles = 128 * 128,
    simDimensions = 3,
    createGeometry = null,
    rendererProps = {}
  } = {}) {
    this.onBeforeRender = onBeforeRender.bind(this)
    this.onAfterRender = onAfterRender.bind(this)
    this.render = this.render.bind(this)
    this.resize = this.resize.bind(this)
    this.autoResize = autoResize

    this.dpr = Math.min(window.devicePixelRatio, 2);

    this.dimensions = dimensions.scaleNew(this.dpr);
    this.simDimensions = simDimensions

    this.numParticles = numParticles

    this.position = new Float32Array(numParticles * this.simDimensions)
    this.velocity = new Float32Array(numParticles * this.simDimensions)
    for (
      let i = 0;
      i < numParticles * this.simDimensions;
      i += this.simDimensions
    ) {
      this.position[i] = Math.random() * this.dimensions.x
      this.position[i + 1] = Math.random() * this.dimensions.y

      this.velocity[i] = 0
      this.velocity[i + 1] = 0
    }

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

    this.simDimensions = simDimensions

    this.program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: this.uniforms,
      transformFeedbackVaryings: ['v_position', 'v_velocity']
    })

    this.transformFeedbacks = new TransformFeedback(this.gl, {
      program: this.program.program,
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
        }
      }
    })

    if (createGeometry && typeof createGeometry == 'function') {
      createGeometry.bind(this)()
    } else {
      this.createGeometry()
    }

    this.mesh = new Mesh(this.gl, {
      mode: this.gl.POINTS,
      geometry: this.cloud,
      program: this.program
    })

    this.playing = true

    container.appendChild(this.gl.canvas)
  }

  createGeometry() {
    let positions = this.position;
    this.cloud = new PointCloud(this.gl, {
      fillFunction: (points, dimensions) => {
        for(let i = 0; i < points.length; i++) {
          points[i] = positions[i];
        }
      },
      particles: this.numParticles,
      dimensions: this.simDimensions,
      attributes: {
        position: new GeometryAttribute({ size: 2, data: this.position })
      },
      transformFeedbacks: this.transformFeedbacks
    })
  }

  render(t) {
    const diff = t - this.lastTime
    this.lastTime = t

    if (this.playing) {
      requestAnimationFrame(this.render)
    }

    const v = this.u_time.value
    this.u_time.value = v + diff * 0.00005

    this.onBeforeRender(t, this)
    window.mesh = this.mesh

    let gl =this.gl;

    // gl.colorMask(false, false, false, true)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    // gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    // gl.blendFunc(gl.ONE, gl.ONE)

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
  numParticles: 256*256,
  simDimensions: 2,
  rendererProps: {
    preserveDrawingBuffer: true,
    depth: false,
    alpha: false,
    premultipliedAlpha: false
  }
})