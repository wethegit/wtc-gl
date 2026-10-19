import {
  ScrollRenderer,
  ScrollScene,
  Program,
  Mesh,
  Triangle,
  Drawable,
  Uniform,
  TransformFeedback,
  Geometry,
  GeometryAttribute
} from 'wtc-gl'

import vert from '../fs.vert'
import heroFrag from './hero.frag'
import midFrag from './mid.frag'
import endFrag from './end.frag'
import particlesVert from './particles.vert'
import particlesFrag from './particles.frag'
import simulateVert from './simulate.vert'
import simulateFrag from './simulate.frag'

// ---------------------------------------------------------------------------
// Renderer setup
// ---------------------------------------------------------------------------

// Append ?layout=absolute to try the compositor-synced layout (better on touch)
const layout =
  new URLSearchParams(location.search).get('layout') === 'absolute'
    ? 'absolute'
    : 'fixed'

const scrollRenderer = new ScrollRenderer({ layout })

Object.assign(scrollRenderer.canvas.style, {
  position: layout,
  top: '0',
  left: '0',
  width: '100%',
  // In absolute layout, preserve the height set by the renderer.
  ...(layout === 'fixed' ? { height: '100%' } : {}),
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
const seed = new GeometryAttribute({ size: 1, data: seedData })

// The simulation advances every particle on the GPU each frame...
const simulation = new TransformFeedback(gl, {
  program: new Program(gl, {
    vertex: simulateVert,
    fragment: simulateFrag,
    uniforms: { ...particleScene.uniforms, u_delta },
    transformFeedbackVaryings: ['v_position', 'v_velocity', 'v_life']
  }),
  attributes: {
    a_position: { data: posData, size: 2, varying: 'v_position' },
    a_velocity: { data: velData, size: 2, varying: 'v_velocity' },
    a_life: { data: lifeData, size: 1, varying: 'v_life' }
  },
  staticAttributes: { a_seed: seed }
})

// ...and the points are drawn from its latest results
new Mesh(gl, {
  mode: gl.POINTS,
  geometry: new Geometry(gl, {
    a_position: simulation.attribute('a_position'),
    a_life: simulation.attribute('a_life'),
    a_seed: seed
  }),
  program: new Program(gl, {
    vertex: particlesVert,
    fragment: particlesFrag,
    uniforms: { ...particleScene.uniforms },
    transparent: true
  })
}).setParent(particleDrawable)

particleScene.onBeforeRender = (delta) => {
  u_delta.value = Math.min(delta * 0.001, 0.05)
  simulation.step()
}

scrollRenderer.addScene(particleScene)

// ---------------------------------------------------------------------------

scrollRenderer.playing = true
