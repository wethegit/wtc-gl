import {
  FragmentShader,
  Uniform,
  Triangle,
  Program,
  Mesh,
  Framebuffer,
  Texture
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import simFragment from './sim.frag'
import renderFragment from './render.frag'
import vertex from './main.vert'

let caFBO = null
let simMesh = null
let webcamTexture = null

// Shared uniform references — updated each frame in onBeforeRender
const u_state = new Uniform({ name: 'state', value: null, kind: 'texture' })
const u_webcam = new Uniform({ name: 'webcam', value: null, kind: 'texture' })
const u_camResolution = new Uniform({
  name: 'camResolution',
  value: [1280, 720],
  kind: 'float_vec2'
})

// The size of each simulation cell, in CSS pixels. The shaders work in
// device pixels, so the uniform holds it times the renderer's pixel ratio.
const params = { cellSize: 1 }
const DPR = 2
const u_cellSize = new Uniform({
  name: 'cellSize',
  value: params.cellSize * DPR,
  kind: 'float'
})

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

const FSWrapper = new FragmentShader({
  fragment: renderFragment,
  vertex,
  rendererProps: { dpr: DPR },
  uniforms: {
    b_state: u_state,
    b_webcam: u_webcam,
    u_camResolution,
    u_cellSize,
    u_birth,
    u_survive
  },
  onBeforeRender() {
    if (!caFBO || !simMesh) return

    // Mark webcam texture dirty so the GPU uploads the new video frame
    if (webcamTexture) webcamTexture.needsUpdate = true

    // Point sim shader at the current read buffer
    u_state.value = caFBO.read.texture
    u_webcam.value = webcamTexture

    // Run one CA generation into the write buffer, then swap
    caFBO.render(this.renderer, { scene: simMesh })

    // After swap, read now holds the just-computed generation
    u_state.value = caFBO.read.texture
  }
})

const { gl, uniforms, renderer, dimensions } = FSWrapper

// Sim pass — shares uniforms so it gets u_resolution, u_time, b_state, b_webcam
const geometry = new Triangle(gl)
const simProgram = new Program(gl, { vertex, fragment: simFragment, uniforms })
simMesh = new Mesh(gl, { geometry, program: simProgram })

// CA runs at CSS-pixel resolution (dpr:1) so u_resolution in the sim shader matches
caFBO = new Framebuffer(gl, {
  dpr: DPR,
  name: 'state',
  width: dimensions.width,
  height: dimensions.height,
  texdepth: Framebuffer.TEXTYPE_UNSIGNED_BYTE,
  tiling: Framebuffer.IMAGETYPE_MIRROR,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  generateMipmaps: false,
  depth: false
})

// Placeholder 1×1 black texture so shaders work before camera is ready
const placeholderData = new Uint8Array([0, 0, 0, 255])
webcamTexture = new Texture(gl, {
  data: placeholderData,
  width: 1,
  height: 1,
  generateMipmaps: false,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  wrapS: gl.CLAMP_TO_EDGE,
  wrapT: gl.CLAMP_TO_EDGE
})

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

window.addEventListener('resize', () => {
  caFBO.resize(FSWrapper.dimensions.width, FSWrapper.dimensions.height)
})

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
  .on('change', ({ value, last }) => {
    u_cellSize.value = value * DPR
    // Start the automaton again on the new grid once the slider is let go:
    // resizing makes fresh, empty state targets
    if (last !== false) {
      caFBO.resize(FSWrapper.dimensions.width, FSWrapper.dimensions.height)
    }
  })
pane
  .addBinding(params, 'rule', { label: 'rule', options: RULES })
  .on('change', ({ value }) => setRule(value))
