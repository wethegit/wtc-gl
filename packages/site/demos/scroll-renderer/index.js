import {
  ScrollRenderer,
  ScrollScene,
  Program,
  Mesh,
  Triangle,
  Drawable,
  Uniform,
  TransformFeedback,
  PointCloud
} from 'wtc-gl'

import vert from '../fs.vert'
import heroFrag from './hero.frag'
import midFrag from './mid.frag'
import endFrag from './end.frag'
import particlesVert from './particles.vert'
import particlesFrag from './particles.frag'

// ---------------------------------------------------------------------------
// Renderer setup
// ---------------------------------------------------------------------------

const scrollRenderer = new ScrollRenderer()

Object.assign(scrollRenderer.canvas.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: '0'
})
document.body.appendChild(scrollRenderer.canvas)

const { gl } = scrollRenderer

// ---------------------------------------------------------------------------
// Helper: full-element fragment shader scene
// ---------------------------------------------------------------------------

const makeScene = (element, fragShader) => {
  const scene = new Drawable(gl)
  const scrollScene = new ScrollScene({ element, scene })
  new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex: vert,
      fragment: fragShader,
      uniforms: { ...scrollScene.uniforms },
      transparent: true
    })
  }).setParent(scene)
  return scrollScene
}

// ---------------------------------------------------------------------------
// Scene 1 — plasma (hero)
// ---------------------------------------------------------------------------

scrollRenderer.addScene(
  makeScene(document.querySelector('.scene--hero'), heroFrag)
)

// ---------------------------------------------------------------------------
// Scene 2 — rings, UV centred on element
// ---------------------------------------------------------------------------

const midEl = document.querySelector('.scene--mid')
const midDrawable = new Drawable(gl)
const midScene = new ScrollScene({ element: midEl, scene: midDrawable })

new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: vert,
    fragment: midFrag,
    uniforms: { ...midScene.uniforms },
    transparent: true
  })
}).setParent(midDrawable)

scrollRenderer.addScene(midScene)

// ---------------------------------------------------------------------------
// Scene 3 — grid (end)
// ---------------------------------------------------------------------------

scrollRenderer.addScene(
  makeScene(document.querySelector('.scene--end'), endFrag)
)

// ---------------------------------------------------------------------------
// Scene 4 — transform feedback particles
// ---------------------------------------------------------------------------

const N = 10000

const particleEl = document.querySelector('.scene--particles')
const particleDrawable = new Drawable(gl)
const particleScene = new ScrollScene({
  element: particleEl,
  scene: particleDrawable,
  clearOnRender: false,
  useViewport: false
})

const u_delta = new Uniform({ name: 'u_delta', value: 0.016, kind: 'float' })

const particleProgram = new Program(gl, {
  vertex: particlesVert,
  fragment: particlesFrag,
  uniforms: { ...particleScene.uniforms, u_delta },
  transformFeedbackVaryings: ['v_position', 'v_velocity', 'v_life', 'v_seed'],
  transparent: true
})

const posData = new Float32Array(N * 2)
const velData = new Float32Array(N * 2)
const lifeData = new Float32Array(N)
const seedData = new Float32Array(N)

for (let i = 0; i < N; i++) {
  const angle = Math.random() * Math.PI * 2
  const speed = 0.002 + Math.random() * 0.004
  velData[i * 2] = Math.cos(angle) * speed
  velData[i * 2 + 1] = Math.sin(angle) * speed
  lifeData[i] = Math.random()
  seedData[i] = Math.random()
}

const tf = new TransformFeedback(gl, {
  program: particleProgram.program,
  transformFeedbacks: {
    a_position: {
      data: posData,
      size: 2,
      usage: gl.DYNAMIC_COPY,
      varying: 'v_position'
    },
    a_velocity: {
      data: velData,
      size: 2,
      usage: gl.DYNAMIC_COPY,
      varying: 'v_velocity'
    },
    a_life: {
      data: lifeData,
      size: 1,
      usage: gl.DYNAMIC_COPY,
      varying: 'v_life'
    },
    a_seed: {
      data: seedData,
      size: 1,
      usage: gl.STATIC_DRAW,
      varying: 'v_seed'
    }
  }
})

const cloud = new PointCloud(gl, {
  particles: N,
  dimensions: 2,
  transformFeedbacks: tf
})

new Mesh(gl, {
  mode: gl.POINTS,
  geometry: cloud,
  program: particleProgram
}).setParent(particleDrawable)

particleScene.onBeforeRender = (delta) => {
  u_delta.value = Math.min(delta * 0.001, 0.05)
}

scrollRenderer.addScene(particleScene)

// ---------------------------------------------------------------------------

scrollRenderer.playing = true
