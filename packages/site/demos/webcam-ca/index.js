import { FragmentShader, GPUSimulation, Uniform, Texture } from 'wtc-gl'
import { Pane } from 'tweakpane'

import simFragment from './sim.frag'
import renderFragment from './render.frag'
import vertex from './main.vert'

// A Life-like cellular automaton seeded by the webcam. A GPUSimulation keeps
// the automaton's state, one texel per cell: R alive, G age, and the camera
// colour (B, A) the cell was born with. Each frame its step shader applies
// the rule, seeding new cells where the camera is bright, and a
// FragmentShader draws the cells over a faint ghost of the camera.

const DPR = 2

// The size of each cell, in CSS pixels, and the rule
const params = { cellSize: 1 }

// Life-like rules in B/S notation: the neighbour counts at which a dead cell
// is born, and at which a live cell survives
const RULES = {
  'Life (B3/S23)': 'B3/S23',
  'HighLife (B36/S23)': 'B36/S23',
  'Day & Night (B3678/S34678)': 'B3678/S34678',
  'Seeds (B2/S)': 'B2/S',
  'Life without Death (B3/S012345678)': 'B3/S012345678',
  'Maze (B3/S12345)': 'B3/S12345',
  'Coral (B3/S45678)': 'B3/S45678',
  'Diamoeba (B35678/S5678)': 'B35678/S5678',
  'Anneal (B4678/S35678)': 'B4678/S35678',
  'Morley (B368/S245)': 'B368/S245',
  'Replicator (B1357/S1357)': 'B1357/S1357'
}
params.rule = RULES['Life (B3/S23)']

// A list of neighbour counts ("23") as a bitmask, bit n for count n
const mask = (digits) =>
  [...digits].reduce((bits, digit) => bits | (1 << Number(digit)), 0)
const parseRule = (rule) => {
  const [, birth = '', survive = ''] = /^B(\d*)\/S(\d*)$/.exec(rule) ?? []
  return { birth: mask(birth), survive: mask(survive) }
}

const u_birth = new Uniform({ name: 'birth', value: 0, kind: 'int' })
const u_survive = new Uniform({ name: 'survive', value: 0, kind: 'int' })
const setRule = (rule) => {
  const { birth, survive } = parseRule(rule)
  u_birth.value = birth
  u_survive.value = survive
}
setRule(params.rule)

const u_webcam = new Uniform({ name: 'webcam', value: null, kind: 'texture' })
const u_camResolution = new Uniform({
  name: 'camResolution',
  value: [1280, 720],
  kind: 'float_vec2'
})

// ── The canvas ────────────────────────────────────────────────────────────
// Drawn by a FragmentShader. The simulation's uniforms join its own once
// the simulation exists, below, so the draw reads the latest state.
const shader = new FragmentShader({
  fragment: renderFragment,
  vertex,
  rendererProps: { dpr: DPR },
  uniforms: { b_webcam: u_webcam, u_camResolution },
  onBeforeRender() {
    if (webcamTexture.image) webcamTexture.needsUpdate = true
    u_webcam.value = webcamTexture
    sim.step()
  }
})
const { gl } = shader

// A 1×1 black texture until the camera is ready
let webcamTexture = new Texture(gl, {
  data: new Uint8Array([0, 0, 0, 255]),
  width: 1,
  height: 1,
  generateMipmaps: false,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  wrapS: gl.CLAMP_TO_EDGE,
  wrapT: gl.CLAMP_TO_EDGE
})
u_webcam.value = webcamTexture

// ── The automaton ─────────────────────────────────────────────────────────
// One texel per cell: as many cells as fit across the canvas
const gridSize = () => {
  const cell = params.cellSize * DPR
  return [
    Math.ceil((shader.dimensions.width * DPR) / cell),
    Math.ceil((shader.dimensions.height * DPR) / cell)
  ]
}

const sim = new GPUSimulation(gl, {
  size: gridSize(),
  fragment: simFragment,
  // The world wraps around at the edges
  wrap: gl.REPEAT,
  // Half floats are plenty for alive, age and a colour
  type: gl.HALF_FLOAT,
  uniforms: {
    b_webcam: u_webcam,
    u_camResolution,
    u_birth,
    u_survive,
    // The canvas size, for the camera's aspect
    u_screen: shader.u_resolution
  }
})
// The draw reads the state and the grid size. Its program keeps the shader's
// uniforms object, so adding to it is enough.
shader.uniforms.b_state = sim.uniforms.b_state
shader.uniforms.u_gridSize = sim.uniforms.u_resolution

window.addEventListener('resize', () => sim.resize(gridSize()))

// ── The camera ────────────────────────────────────────────────────────────
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    const video = document.createElement('video')
    video.srcObject = stream
    video.autoplay = true
    video.playsInline = true
    video.muted = true
    await video.play()
    u_camResolution.value = [video.videoWidth, video.videoHeight]

    webcamTexture = new Texture(gl, {
      image: video,
      generateMipmaps: false,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      flipY: true
    })
  } catch (e) {
    console.warn('Webcam unavailable — running with random seeding only:', e)
  }
}

initWebcam()

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
pane
  .addBinding(params, 'cellSize', {
    label: 'cell size',
    min: 1,
    max: 12,
    step: 1,
    format: (v) => `${v}px`
  })
  // A new cell size is a new grid: the automaton starts again on it
  .on('change', () => sim.resize(gridSize()))
pane
  .addBinding(params, 'rule', { label: 'rule', options: RULES })
  .on('change', ({ value }) => setRule(value))
