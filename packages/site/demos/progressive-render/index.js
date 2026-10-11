import {
  Renderer,
  RenderTarget,
  Program,
  Mesh,
  Drawable,
  Triangle,
  Uniform,
  Texture,
  Framebuffer,
  Vec2
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import vertex from './main.vert'
import raymarchFrag from './raymarch.frag'
import compositionFrag from './composition.frag'

// The raymarcher takes eight time samples of up to 512 steps per pixel, far
// too much to draw in one frame. Instead each frame renders one tile into
// `render`, the composition pass adds it to the image so far in
// `composition`, and the result is drawn to the screen. An export does the
// same offscreen at a bigger size, then downloads it.

const dpr = Math.min(window.devicePixelRatio, 2)
let w = window.innerWidth
let h = window.innerHeight

const renderer = new Renderer({
  dpr,
  alpha: true,
  premultipliedAlpha: true,
  // so the download button can read the canvas after the last frame
  preserveDrawingBuffer: true,
  // transparent, so the empty parts of the tile pass don't cover the image
  clearColour: [0, 0, 0, 0]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)
renderer.dimensions = new Vec2(w, h)

// The drawing buffer's real size. w * dpr isn't always a whole number (a
// 1023px window at 1.5 is 1534.5) but the canvas and targets are, and the
// composition pass reads its own last output, so any mismatch would shift
// the image a fraction of a pixel every frame.
const bufferSize = () => [gl.canvas.width, gl.canvas.height]

const progress = document.getElementById('progress')

// --- settings
// Everything the controls panel changes. Any change starts a new render,
// and settings that differ from these defaults are kept in the URL hash so
// a render can be shared. The defaults reproduce the original sketch.
const MIN_TILE = 32
const MAX_TILE = Math.round(128 * dpr)
const params = {
  // scene
  time: -1000, // where along the path the camera is
  lookAhead: 6, // how far along the path the camera aims
  offset: { x: 0, y: 0 }, // camera offset from the path
  fov: 3,
  fovWobble: 2,
  // lens
  aperture: 0,
  focus: 6,
  focusOnLight: false,
  // path
  pathAmp: { x: 10, y: 10 },
  pathFreq: { x: 0.3, y: 0.15 },
  // blocks
  spacing: 4,
  ring: 4.2,
  blockHeight: 1.2,
  thickness: 0.45,
  wobble: 0.25,
  // colour
  tint: 0,
  colourA: { r: 1, g: 0.62, b: 0.32 },
  colourB: { r: 0.3, g: 0.7, b: 0.8 },
  // light
  light: { r: 0.8, g: 0.8, b: 0.95 },
  intensity: 3,
  lightAhead: 3,
  falloff: 0.15,
  showLight: false,
  lightSize: 0.15,
  fog: 0.008,
  exposure: 1,
  // quality
  samples: 8,
  shutter: 0.0005,
  maxSteps: 512,
  stepScale: 0.1,
  far: 20,
  // tiles
  order: 'rows',
  autoTile: true,
  tile: Math.round(64 * dpr),
  // export, not part of the render
  exportSize: 3840
}
const defaults = structuredClone(params)
const NOT_SAVED = ['exportSize']

// Each preset is a set of changes from the defaults. Applying one resets
// everything else (except the time, so presets can be compared on the
// same frame).
const PRESETS = {
  Original: {},
  // a warm lamp floating ahead, everything else falling out of focus
  Lantern: {
    showLight: true,
    lightSize: 0.2,
    lightAhead: 7,
    light: { r: 1, g: 0.72, b: 0.42 },
    intensity: 4,
    aperture: 0.25,
    focusOnLight: true,
    tint: 0.5,
    colourA: { r: 1, g: 0.7, b: 0.45 },
    colourB: { r: 0.55, g: 0.35, b: 0.25 },
    fog: 0.012
  },
  // shallow focus close to the camera, so the blocks look like a model
  Miniature: {
    aperture: 0.4,
    focus: 2.5,
    lookAhead: 3,
    offset: { x: 0, y: -2 },
    fov: 2,
    fovWobble: 0
  },
  Neon: {
    tint: 1,
    colourA: { r: 1, g: 0.25, b: 0.6 },
    colourB: { r: 0.2, g: 0.9, b: 1 },
    light: { r: 0.6, g: 0.9, b: 1 },
    intensity: 4,
    showLight: true,
    lightSize: 0.1,
    exposure: 1.3
  },
  // a lazy path between big, widely spaced slabs
  Canyon: {
    ring: 7,
    spacing: 6,
    blockHeight: 2.5,
    pathAmp: { x: 4, y: 3 },
    pathFreq: { x: 0.12, y: 0.08 },
    fov: 2.2,
    fovWobble: 0,
    far: 35
  },
  // a tight, twisting path through thin, rocking blocks
  Coil: {
    pathAmp: { x: 6, y: 6 },
    pathFreq: { x: 0.6, y: 0.45 },
    ring: 3,
    wobble: 0.8,
    thickness: 0.25,
    lookAhead: 4
  },
  // a long shutter smears the rocking blocks
  Dream: {
    samples: 16,
    shutter: 0.004,
    wobble: 0.6,
    fog: 0.004,
    exposure: 1.2
  },
  // up out of the ribbon, looking down along it
  Overhead: {
    offset: { x: 0, y: 3 },
    lookAhead: 12,
    fovWobble: 0
  },
  Midnight: {
    light: { r: 0.45, g: 0.6, b: 1 },
    exposure: 0.8,
    fog: 0.015,
    showLight: true,
    lightSize: 0.08,
    lightAhead: 10,
    tint: 0.4,
    colourA: { r: 0.4, g: 0.5, b: 0.9 },
    colourB: { r: 0.8, g: 0.85, b: 1 }
  }
}
const KEEP_ON_PRESET = ['time', 'exportSize']

function loadHash() {
  let saved
  try {
    saved = JSON.parse(decodeURIComponent(location.hash.slice(1)))
  } catch {
    return
  }
  for (const key in saved) {
    // only known settings, of the right type
    if (!(key in params) || typeof saved[key] !== typeof params[key]) continue
    params[key] =
      typeof params[key] === 'object'
        ? { ...params[key], ...saved[key] }
        : saved[key]
  }
  // these are compiled into the shader, so keep them sane
  params.samples = Math.round(Math.min(16, Math.max(1, params.samples)))
  params.maxSteps = Math.round(Math.min(1024, Math.max(16, params.maxSteps)))
  params.stepScale = Math.min(1, Math.max(0.02, params.stepScale))
}
// Colour channels to two places, other numbers to four. The colour
// pickers round colours to 8 bits (0.62 comes back as 0.6196...), which
// shouldn't count as a change.
const rounded = (value) =>
  JSON.stringify(value, (key, n) => {
    if (typeof n !== 'number') return n
    const places = 'rgb'.includes(key) && key ? 100 : 10000
    return Math.round(n * places) / places
  })
function saveHash() {
  const changed = []
  for (const key in params) {
    if (NOT_SAVED.includes(key)) continue
    const value = rounded(params[key])
    if (value !== rounded(defaults[key])) changed.push(`"${key}":${value}`)
  }
  const hash = changed.length
    ? '#' + encodeURIComponent(`{${changed.join(',')}}`)
    : ''
  history.replaceState(null, '', location.pathname + location.search + hash)
}
loadHash()

// --- uniforms
const geometry = new Triangle(gl)

const noiseTexture = new Texture(gl, {
  generateMipmaps: false,
  wrapS: gl.REPEAT,
  wrapT: gl.REPEAT
})

// Shared by both programs
const u_time = new Uniform({ name: 'time', value: 100, kind: 'float' })
const u_resolution = new Uniform({
  name: 'resolution',
  value: bufferSize(),
  kind: 'float_vec2'
})
const s_noise = new Uniform({
  name: 'noise',
  value: noiseTexture,
  kind: 'texture'
})
// Composition only; the textures are set before every draw
const u_clearing = new Uniform({
  name: 'clearing',
  value: false,
  kind: 'boolean'
})
const b_render = new Uniform({
  name: 'render',
  value: noiseTexture,
  kind: 'texture'
})
const b_composition = new Uniform({
  name: 'composition',
  value: noiseTexture,
  kind: 'texture'
})

// Raymarch uniforms and how each comes from `params`
const vec2 = ({ x, y }) => [x, y]
const rgb = ({ r, g, b }, k = 1) => [r * k, g * k, b * k]
const lookSpec = {
  u_shutter: ['float', (p) => p.shutter],
  u_far: ['float', (p) => p.far],
  u_lookAhead: ['float', (p) => p.lookAhead],
  u_offset: ['float_vec2', (p) => vec2(p.offset)],
  u_fov: ['float', (p) => p.fov],
  u_fovWobble: ['float', (p) => p.fovWobble],
  u_aperture: ['float', (p) => p.aperture],
  u_focus: ['float', (p) => p.focus],
  u_focusOnLight: ['float', (p) => (p.focusOnLight ? 1 : 0)],
  u_pathAmp: ['float_vec2', (p) => vec2(p.pathAmp)],
  u_pathFreq: ['float_vec2', (p) => vec2(p.pathFreq)],
  u_spacing: ['float', (p) => p.spacing],
  u_ring: ['float', (p) => p.ring],
  u_blockHeight: ['float', (p) => p.blockHeight],
  u_thickness: ['float', (p) => p.thickness],
  u_wobble: ['float', (p) => p.wobble],
  u_colourA: ['float_vec3', (p) => rgb(p.colourA)],
  u_colourB: ['float_vec3', (p) => rgb(p.colourB)],
  u_tint: ['float', (p) => p.tint],
  u_light: ['float_vec3', (p) => rgb(p.light, p.intensity)],
  u_lightAhead: ['float', (p) => p.lightAhead],
  u_falloff: ['float', (p) => p.falloff],
  u_lightSize: ['float', (p) => (p.showLight ? p.lightSize : 0)],
  u_fog: ['float', (p) => p.fog],
  u_exposure: ['float', (p) => p.exposure]
}
const look = Object.fromEntries(
  Object.entries(lookSpec).map(([key, [kind, get]]) => [
    key,
    new Uniform({ name: key, value: get(params), kind })
  ])
)
function syncUniforms() {
  for (const key in lookSpec) look[key].value = lookSpec[key][1](params)
}

// The settings that shape the raymarch loops are compiled in (see
// raymarch.frag), so changing them builds a new program
const compiledKeys = ['samples', 'maxSteps', 'stepScale']
const raymarchProgramFor = ({ samples, maxSteps, stepScale }) =>
  new Program(gl, {
    vertex,
    fragment: raymarchFrag.replace(
      /^#version 300 es\n/,
      `#version 300 es\n#define SAMPLES ${samples}\n#define MAX_STEPS ${maxSteps}\n#define STEP_SCALE ${stepScale.toFixed(4)}\n`
    ),
    uniforms: { u_time, u_resolution, s_noise, ...look },
    depthTest: false,
    cullFace: null
  })
const compiledParams = () =>
  Object.fromEntries(compiledKeys.map((key) => [key, params[key]]))
let compiled = compiledParams()

const compositionProgram = new Program(gl, {
  vertex,
  fragment: compositionFrag,
  uniforms: { u_resolution, u_clearing, b_render, b_composition },
  depthTest: false,
  cullFace: null
})

const raymarchScene = new Drawable(gl)
const raymarchMesh = new Mesh(gl, {
  geometry,
  program: raymarchProgramFor(compiled)
})
raymarchMesh.setParent(raymarchScene)
const compositionScene = new Drawable(gl)
new Mesh(gl, { geometry, program: compositionProgram }).setParent(
  compositionScene
)

// Nearest filtering, so copying the image from one pass to the next is exact
const fboOptions = {
  minFilter: gl.NEAREST,
  texdepth: Framebuffer.TEXTYPE_HALF_FLOAT_OES,
  depth: false,
  generateMipmaps: false
}
const makeFbos = (width, height, scale) => ({
  render: new Framebuffer(gl, { ...fboOptions, dpr: scale, width, height }),
  composition: new Framebuffer(gl, { ...fboOptions, dpr: scale, width, height })
})
const screenFbos = makeFbos(w, h, dpr)

// --- tiles
// Unless it's fixed in the panel, tile size adapts to how long frames take,
// so slow GPUs (or software WebGL) stay responsive. Each order is a
// generator of [x, y, size, progress]. Tiles start at the bottom left
// (GL's y is up).
let tile = Math.round(64 * dpr)
let frameMs = 0
function nextTileSize() {
  if (!params.autoTile) tile = params.tile
  else if (frameMs > 60) tile = Math.max(MIN_TILE, Math.round(tile / 2))
  else if (frameMs && frameMs < 25) tile = Math.min(MAX_TILE, tile * 2)
  return tile
}

// Row by row, adapting the size at the start of each row
function* rows(width, height) {
  for (let y = 0; y < height;) {
    const size = nextTileSize()
    for (let x = 0; x < width; x += size) yield [x, y, size, y / height]
    y += size
  }
}

// A fixed grid, from the centre out in a spiral, or in random order
function* grid(width, height, order) {
  const size = nextTileSize()
  const cells = []
  for (let y = 0; y < height; y += size)
    for (let x = 0; x < width; x += size) cells.push([x, y])
  if (order === 'random') {
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[cells[i], cells[j]] = [cells[j], cells[i]]
    }
  } else {
    // ring by ring, sweeping around each ring
    const key = ([x, y]) => {
      const dx = x + size / 2 - width / 2
      const dy = y + size / 2 - height / 2
      return Math.round(Math.hypot(dx, dy) / size) + Math.atan2(dy, dx) / 7
    }
    cells.sort((a, b) => key(a) - key(b))
  }
  for (let i = 0; i < cells.length; i++)
    yield [...cells[i], size, i / cells.length]
}

const tilesFor = (width, height) =>
  params.order === 'rows'
    ? rows(width, height)
    : grid(width, height, params.order)

// --- jobs
// A job renders one image: to the screen, or offscreen for an export
let job = null
let looping = false
let lastFrame = 0
let screenDone = false
const tilePos = new Vec2(0, 0)
const tileSize = new Vec2(tile, tile)

function run(next) {
  if (job?.exporting) disposeExport(job)
  job = next
  lastFrame = 0
  frameMs = 0
  if (!looping) {
    looping = true
    requestAnimationFrame(renderLoop)
  }
}

// Render to the screen, cancelling any export
function start() {
  const [width, height] = bufferSize()
  screenDone = false
  run({
    width,
    height,
    fbos: screenFbos,
    tiles: tilesFor(width, height),
    clearing: true
  })
}

function renderLoop(now) {
  if (!job) {
    looping = false
    return
  }
  frameMs = lastFrame ? now - lastFrame : 0
  lastFrame = now

  const next = job.tiles.next()
  if (next.done) {
    finish(job)
    requestAnimationFrame(renderLoop)
    return
  }
  const [x, y, size, done] = next.value
  tilePos.reset(x, y)
  tileSize.reset(size, size)

  u_time.value = params.time
  u_resolution.value = [job.width, job.height]

  // Render the tile; the rest of `render` is cleared to transparent
  job.fbos.render.render(renderer, {
    scene: raymarchScene,
    clear: true,
    viewport: [tileSize, tilePos]
  })

  // Add it to the image so far
  u_clearing.value = job.clearing
  b_render.value = job.fbos.render.read.texture
  b_composition.value = job.fbos.composition.read.texture
  job.fbos.composition.render(renderer, {
    scene: compositionScene,
    clear: false
  })
  job.clearing = false

  // Show the image so far; an export leaves the screen alone
  if (!job.exporting) {
    u_clearing.value = false
    b_composition.value = job.fbos.composition.read.texture
    renderer.render({ scene: compositionScene })
  }

  const percent = Math.min(100, Math.round(done * 100))
  progress.textContent = `${job.exporting ? 'Exporting' : 'Rendering'} ${percent}%`
  requestAnimationFrame(renderLoop)
}

function finish(finished) {
  job = null
  if (!finished.exporting) {
    screenDone = true
    progress.textContent = 'Done · click to render another'
    return
  }
  download(finished)
  disposeExport(finished)
  u_resolution.value = bufferSize()
  // the export may have interrupted the screen
  if (screenDone)
    progress.textContent = `Exported ${finished.width}×${finished.height}`
  else start()
}

// --- export
function exportImage() {
  const [bw, bh] = bufferSize()
  // the long edge is the chosen size, within what the GPU allows
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  const scale = Math.min(params.exportSize, max) / Math.max(bw, bh)
  const width = Math.round(bw * scale)
  const height = Math.round(bh * scale)
  run({
    width,
    height,
    fbos: makeFbos(width, height, 1),
    tiles: tilesFor(width, height),
    clearing: true,
    exporting: true
  })
}

function disposeExport(exportJob) {
  exportJob.fbos.render.remove()
  exportJob.fbos.composition.remove()
}

// Copy the finished half-float image into 8 bits, read it back and save it
function download({ width, height, fbos }) {
  const target = new RenderTarget(gl, { width, height, depth: false })
  u_resolution.value = [width, height]
  u_clearing.value = false
  b_render.value = fbos.composition.read.texture
  b_composition.value = fbos.composition.read.texture
  renderer.render({ scene: compositionScene, target })

  const pixels = new Uint8Array(width * height * 4)
  renderer.bindFramebuffer({ buffer: target.buffer })
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  renderer.bindFramebuffer()
  target.remove()

  // GL's rows run bottom to top
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  const row = width * 4
  for (let y = 0; y < height; y++)
    image.data.set(
      pixels.subarray((height - 1 - y) * row, (height - y) * row),
      y * row
    )
  ctx.putImageData(image, 0, 0)
  canvas.toBlob((blob) => save(URL.createObjectURL(blob), true), 'image/png')
}

function save(href, revoke = false) {
  const link = document.createElement('a')
  link.download = 'progressive-render.png'
  link.href = href
  link.click()
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000)
}

// --- noise, then go
const img = new Image()
img.onload = () => {
  noiseTexture.image = img
  noiseTexture.needsUpdate = true
  start()
}
img.src = `${import.meta.env.BASE_URL}noise.png`

// A restored context has empty targets, so start the image again
renderer.onContextRestored = () => start()

// --- controls, collapsed until opened
const pane = new Pane({
  title: 'Controls',
  expanded: false,
  container: document.getElementById('controls')
})

// Changes made here rather than in the panel refresh it, which must not
// count as a panel change
let refreshing = false
function rerender() {
  syncUniforms()
  if (compiledKeys.some((key) => params[key] !== compiled[key])) {
    compiled = compiledParams()
    raymarchMesh.program.remove()
    raymarchMesh.program = raymarchProgramFor(compiled)
  }
  saveHash()
  start()
}
function setTime(time) {
  params.time = time
  refreshing = true
  pane.refresh()
  refreshing = false
  rerender()
}
const randomTime = () => setTime(-1000 + Math.random() * 2000)

// Re-render once a slider is let go, not on every step of a drag
pane.on('change', (e) => {
  const { key } = e.target
  if (!e.last || refreshing || key === 'preset' || NOT_SAVED.includes(key))
    return
  markCustom(key)
  rerender()
})

// --- presets
// Picking one applies it; tweaking anything afterwards shows "Custom"
const state = { preset: location.hash ? 'custom' : 'Original' }
const presetBinding = pane.addBinding(state, 'preset', {
  options: {
    ...Object.fromEntries(Object.keys(PRESETS).map((name) => [name, name])),
    Custom: 'custom'
  }
})
presetBinding.on('change', (e) => {
  if (refreshing || e.value === 'custom') return
  for (const key in defaults)
    if (!KEEP_ON_PRESET.includes(key))
      params[key] = structuredClone(defaults[key])
  Object.assign(params, structuredClone(PRESETS[e.value]))
  refreshing = true
  pane.refresh()
  refreshing = false
  focusBinding.disabled = params.focusOnLight
  rerender()
})
function markCustom(key) {
  if (key === 'time' || state.preset === 'custom') return
  state.preset = 'custom'
  refreshing = true
  presetBinding.refresh()
  refreshing = false
}

// --- every setting, collapsed under "Tweak"
const tweak = pane.addFolder({ title: 'Tweak', expanded: false })

const scene = tweak.addFolder({ title: 'Scene' })
scene.addBinding(params, 'time', { min: -1000, max: 1000 })
scene.addButton({ title: 'Random time' }).on('click', randomTime)
scene.addBinding(params, 'lookAhead', {
  label: 'look ahead',
  min: 0.5,
  max: 30
})
scene.addBinding(params, 'offset', {
  label: 'camera offset',
  x: { min: -6, max: 6 },
  y: { min: -6, max: 6, inverted: true }
})
scene.addBinding(params, 'fov', { label: 'FOV', min: 0.5, max: 8 })
scene.addBinding(params, 'fovWobble', { label: 'FOV wobble', min: 0, max: 4 })

const lens = tweak.addFolder({ title: 'Lens', expanded: false })
lens.addBinding(params, 'aperture', { min: 0, max: 0.5 })
const focusBinding = lens.addBinding(params, 'focus', {
  label: 'focus distance',
  min: 0.5,
  max: 20
})
// the light sets the focus, so the distance slider has no effect
lens
  .addBinding(params, 'focusOnLight', { label: 'focus on light' })
  .on('change', (e) => (focusBinding.disabled = e.value))
focusBinding.disabled = params.focusOnLight

const world = tweak.addFolder({ title: 'Path & blocks', expanded: false })
world.addBinding(params, 'pathAmp', {
  label: 'path swing',
  x: { min: 0, max: 30 },
  y: { min: 0, max: 30 }
})
world.addBinding(params, 'pathFreq', {
  label: 'path freq',
  x: { min: 0, max: 1 },
  y: { min: 0, max: 1 }
})
world.addBinding(params, 'spacing', { min: 1, max: 10 })
world.addBinding(params, 'ring', { label: 'ring radius', min: 1, max: 12 })
world.addBinding(params, 'blockHeight', {
  label: 'block height',
  min: 0.2,
  max: 4
})
world.addBinding(params, 'thickness', { min: 0.05, max: 0.5 })
world.addBinding(params, 'wobble', { min: 0, max: 1.5 })

const colour = tweak.addFolder({ title: 'Colour', expanded: false })
colour.addBinding(params, 'tint', { min: 0, max: 1 })
colour.addBinding(params, 'colourA', {
  label: 'colour A',
  color: { type: 'float' }
})
colour.addBinding(params, 'colourB', {
  label: 'colour B',
  color: { type: 'float' }
})

const lighting = tweak.addFolder({ title: 'Light', expanded: false })
lighting.addBinding(params, 'light', {
  label: 'colour',
  color: { type: 'float' }
})
lighting.addBinding(params, 'intensity', { min: 0, max: 10 })
lighting.addBinding(params, 'lightAhead', {
  label: 'distance',
  min: -10,
  max: 30
})
lighting.addBinding(params, 'falloff', { min: 0.01, max: 1 })
lighting.addBinding(params, 'showLight', { label: 'visible' })
lighting.addBinding(params, 'lightSize', { label: 'size', min: 0.02, max: 1 })
lighting.addBinding(params, 'fog', { min: 0, max: 0.05 })
lighting.addBinding(params, 'exposure', { min: 0, max: 4 })

const quality = tweak.addFolder({ title: 'Quality', expanded: false })
quality.addBinding(params, 'samples', { min: 1, max: 16, step: 1 })
quality.addBinding(params, 'shutter', { min: 0, max: 0.005 })
quality.addBinding(params, 'maxSteps', {
  label: 'max steps',
  min: 16,
  max: 1024,
  step: 1
})
quality.addBinding(params, 'stepScale', {
  label: 'step scale',
  min: 0.02,
  max: 1
})
quality.addBinding(params, 'far', { label: 'far clip', min: 2, max: 120 })

const tiles = tweak.addFolder({ title: 'Tiles', expanded: false })
tiles.addBinding(params, 'order', {
  options: { rows: 'rows', 'centre out': 'centre', random: 'random' }
})
tiles.addBinding(params, 'autoTile', { label: 'adaptive' })
tiles.addBinding(params, 'tile', {
  label: 'fixed size',
  min: MIN_TILE,
  max: 512,
  step: 1
})

const output = pane.addFolder({ title: 'Export & share' })
output.addBinding(params, 'exportSize', {
  label: 'size',
  options: { '4K (3840)': 3840, '6K (5760)': 5760 }
})
output.addButton({ title: 'Export PNG' }).on('click', exportImage)
const copyButton = output.addButton({ title: 'Copy link' })
copyButton.on('click', async () => {
  saveHash()
  try {
    await navigator.clipboard.writeText(location.href)
    copyButton.title = 'Copied'
  } catch {
    copyButton.title = 'Copy failed'
  }
  setTimeout(() => (copyButton.title = 'Copy link'), 1500)
})

// --- interaction
gl.canvas.addEventListener('click', randomTime)

document
  .getElementById('download')
  .addEventListener('click', () => save(gl.canvas.toDataURL('image/png')))

let resizeTimeout
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    w = window.innerWidth
    h = window.innerHeight
    renderer.dimensions = new Vec2(w, h)
    u_resolution.value = bufferSize()
    screenFbos.render.resize(w, h)
    screenFbos.composition.resize(w, h)
    start()
  }, 100)
})
