import {
  Renderer,
  RenderTarget,
  Framebuffer,
  DollyCamera,
  Obj,
  Mesh,
  Program,
  Uniform,
  Triangle,
  LineGeometry,
  GeometryAttribute,
  lineExtrudeGLSL,
  Vec2,
  Vec3
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import fullscreenVert from './fullscreen.vert'
import initFrag from './init.frag'
import simFrag from './sim.frag'
import copyFrag from './copy.frag'
import trailFrag from './trail.frag'
import blendFrag from './blend.frag'
import outputFrag from './output.frag'
import textureFrag from './texture.frag'

// 16,384 particles swirling through a force field, each drawn as a ribbon
// through its last few positions. A WebGL2 rebuild of an old WebGL1 sketch
// that drew velocity-stretched quads.
//
// Each frame:
//   1. One simulation pass writes position and velocity together (two
//      colour attachments), ping-ponging between two targets.
//   2. The new positions are copied into a ring of `length` blocks in a
//      history texture.
//   3. One ribbon geometry of `length` points is instanced once per
//      particle. Its vertex shader reads the particle's history and extrudes
//      it with the library's line extrusion (`lineExtrudeGLSL`).
//   4. The frame is mixed into the last one for a little smear, then shown.

// Particles per side of the simulation texture; the panel can change it
let size = 128
const COUNTS = {
  '1,024': 32,
  '4,096': 64,
  '16,384': 128,
  '65,536': 256,
  '262,144': 512
}
// Trails keep up to MAX_HISTORY positions. The history texture holds one
// size × size block per position, BLOCKS_PER_ROW blocks across, so it's a
// few rows of blocks instead of one very tall column. It only has the rows
// the current length needs: 64 blocks of 262k particles would be 256 MB.
const MAX_HISTORY = 64
const BLOCKS_PER_ROW = 8

// Cosine palettes (https://iquilezles.org/articles/palettes/):
// colour = a + b * cos(2π(c * t + d))
const PALETTES = {
  Original: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [1, 1, 1],
    [0.5, 0.3, 0.2]
  ],
  Rainbow: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [1, 1, 1],
    [0, 0.33, 0.67]
  ],
  Fire: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [1, 0.7, 0.4],
    [0, 0.15, 0.2]
  ],
  Ocean: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [1, 1, 0.5],
    [0.8, 0.9, 0.3]
  ],
  Neon: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [2, 1, 0],
    [0.5, 0.2, 0.25]
  ],
  Mono: [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 0.5],
    [1, 1, 1],
    [0, 0, 0]
  ]
}

// The trails' cross-section, shaped in trail.frag
const SHAPES = { Flat: 0, Tube: 1, 'Tube teardrop': 2 }

// Everything the controls panel changes
const params = {
  palette: 'Original',
  paletteRange: 0.5, // how much of the palette the particles spread over
  paletteOffset: 0.3,
  length: 20, // points per trail
  lineWidth: 0.12,
  shape: 2, // see SHAPES
  smear: 0.5, // how much of the last frame stays
  speed: 1,
  count: size, // particles per side
  showTexture: false, // the position texture, in a corner
  zoom: 1, // camera distance from its target, as a multiple of the shot's
  background: { r: 0.09, g: 0.12, b: 0.18 }
}

const dpr = Math.min(window.devicePixelRatio, 2)
const renderer = new Renderer({
  dpr,
  clearColour: [0.05, 0.15, 0.35, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const triangle = new Triangle(gl)
const fullscreen = (fragment, uniforms) =>
  new Mesh(gl, {
    geometry: triangle,
    program: new Program(gl, {
      vertex: fullscreenVert,
      fragment,
      uniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: 0
    })
  })

// --- simulation state: position in textures[0], velocity in textures[1]
const stateOptions = {
  width: size,
  height: size,
  colour: 2,
  type: gl.FLOAT,
  internalFormat: gl.RGBA32F,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  depth: false,
  generateMipmaps: false
}
let state = new RenderTarget(gl, stateOptions)
let nextState = new RenderTarget(gl, stateOptions)

const historyRows = () => Math.ceil(params.length / BLOCKS_PER_ROW)
const history = new RenderTarget(gl, {
  width: size * BLOCKS_PER_ROW,
  height: size * historyRows(),
  type: gl.FLOAT,
  internalFormat: gl.RGBA32F,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  depth: false,
  generateMipmaps: false
})

const u_time = new Uniform({ name: 'time', value: -10000, kind: 'float' })
const u_delta = new Uniform({ name: 'delta', value: 0, kind: 'float' })
const u_seed = new Uniform({ name: 'seed', value: 0, kind: 'float' })
const u_transition = new Uniform({
  name: 'transition',
  value: 0,
  kind: 'float'
})

const init = fullscreen(initFrag, { u_seed })
const simUniforms = {
  b_position: new Uniform({ name: 'position', kind: 'texture' }),
  b_velocity: new Uniform({ name: 'velocity', kind: 'texture' }),
  u_time,
  u_delta
}
const sim = fullscreen(simFrag, simUniforms)
const copyUniforms = {
  b_position: new Uniform({ name: 'position', kind: 'texture' }),
  u_offset: new Uniform({ name: 'offset', value: [0, 0], kind: 'float_vec2' })
}
const copy = fullscreen(copyFrag, copyUniforms)

// Copy the current positions into history block `block`
const blockSize = new Vec2(size, size)
const blockPosition = new Vec2(0, 0)
function writeHistory(block) {
  blockPosition.x = (block % BLOCKS_PER_ROW) * size
  blockPosition.y = Math.floor(block / BLOCKS_PER_ROW) * size
  copyUniforms.b_position.value = state.textures[0]
  copyUniforms.u_offset.value = [blockPosition.x, blockPosition.y]
  renderer.render({
    scene: copy,
    target: history,
    clear: false,
    viewport: [blockSize, blockPosition]
  })
}

let head = 0 // the history block holding the newest positions

// Every block starts at the current positions, so trails grow out of them
function fillHistory() {
  for (let i = 0; i < params.length; i++) writeHistory(i)
  head = params.length - 1
}

function reset() {
  u_seed.value = Math.random() * 1000
  renderer.render({ scene: init, target: state })
  fillHistory()
}

function step(delta) {
  simUniforms.b_position.value = state.textures[0]
  simUniforms.b_velocity.value = state.textures[1]
  u_delta.value = delta
  renderer.render({ scene: sim, target: nextState })
  ;[state, nextState] = [nextState, state]

  head = (head + 1) % params.length
  writeHistory(head)
}

// --- trails: one ribbon of `length` points, instanced once per particle.
// Its own positions aren't used; the shader reads them from the history.
const ids = (count) => new Float32Array(count).map((_, i) => i)
const ribbonPoints = (length) =>
  new Array(length).fill(0).flatMap((_, i) => [i, 0, 0])
const ribbon = new LineGeometry(gl, {
  points: ribbonPoints(params.length),
  width: (t) => 0.15 + 0.85 * t, // thin at the tail
  attributes: {
    instance: new GeometryAttribute({
      size: 1,
      data: ids(size * size),
      instanced: 1
    })
  }
})

const trailVert = `#version 300 es
precision highp float;

in float side;
in vec2 uv;
in float width;
in float instance;

uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;
uniform vec2 u_resolution;
uniform float u_lineWidth;
uniform sampler2D b_history;
uniform float u_head;
uniform float u_history; // points per trail
uniform float u_size; // particles per side of the simulation texture
uniform vec3 u_paletteA;
uniform vec3 u_paletteB;
uniform vec3 u_paletteC;
uniform vec3 u_paletteD;
uniform vec2 u_paletteSpread; // range, offset

out vec3 v_colour;
out float v_t;
out float v_across; // -1 to 1 across the ribbon

const float BLOCKS_PER_ROW = ${BLOCKS_PER_ROW}.;

${lineExtrudeGLSL}

// Point k of this particle's trail, from 0 (oldest) to u_history - 1 (newest)
vec3 trailPoint(float k) {
  float block = mod(u_head + 1. + k, u_history);
  vec2 corner = vec2(mod(block, BLOCKS_PER_ROW), floor(block / BLOCKS_PER_ROW)) * u_size;
  vec2 particle = vec2(mod(instance, u_size), floor(instance / u_size));
  return texelFetch(b_history, ivec2(corner + particle), 0).xyz;
}

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.74));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  float k = floor(uv.x * (u_history - 1.) + .5);
  vec3 position = trailPoint(k);
  // at the ends, mirror the neighbour that's there
  vec3 prev = k > 0. ? trailPoint(k - 1.) : 2. * position - trailPoint(k + 1.);
  vec3 next = k < u_history - 1. ? trailPoint(k + 1.) : 2. * position - trailPoint(k - 1.);

  // A particle that escaped jumps back to the centre; hide that segment
  float w = width * u_lineWidth;
  if (distance(position, prev) > 20. || distance(position, next) > 20.) w = 0.;

  v_t = uv.x;
  v_across = uv.y * 2. - 1.;
  float h = hash21(vec2(mod(instance, u_size), floor(instance / u_size)) / u_size);
  v_colour = palette(
    h * u_paletteSpread.x + u_paletteSpread.y,
    u_paletteA, u_paletteB, u_paletteC, u_paletteD
  );

  // world-unit width, so near trails are thicker than far ones
  gl_Position = lineExtrude(
    u_projectionMatrix, u_modelViewMatrix,
    position, prev, next, side, w,
    u_resolution, 1., 4.
  );
}`

const resolution = new Float32Array(2)
const trailUniforms = {
  u_resolution: new Uniform({
    name: 'resolution',
    value: resolution,
    kind: 'float_vec2'
  }),
  u_lineWidth: new Uniform({
    name: 'lineWidth',
    value: params.lineWidth,
    kind: 'float'
  }),
  u_history: new Uniform({
    name: 'history',
    value: params.length,
    kind: 'float'
  }),
  u_size: new Uniform({ name: 'size', value: size, kind: 'float' }),
  u_paletteA: new Uniform({ name: 'paletteA', kind: 'float_vec3' }),
  u_paletteB: new Uniform({ name: 'paletteB', kind: 'float_vec3' }),
  u_paletteC: new Uniform({ name: 'paletteC', kind: 'float_vec3' }),
  u_paletteD: new Uniform({ name: 'paletteD', kind: 'float_vec3' }),
  u_paletteSpread: new Uniform({ name: 'paletteSpread', kind: 'float_vec2' }),
  b_history: new Uniform({
    name: 'history',
    value: history.texture,
    kind: 'texture'
  }),
  u_head: new Uniform({ name: 'head', value: 0, kind: 'float' }),
  u_shape: new Uniform({ name: 'shape', value: params.shape, kind: 'int' }),
  u_transition
}
const trails = new Mesh(gl, {
  geometry: ribbon,
  program: new Program(gl, {
    vertex: trailVert,
    fragment: trailFrag,
    uniforms: trailUniforms,
    cullFace: 0
  }),
  // the ribbon's own positions aren't where the particles are
  frustumCulled: false
})
trails.addBeforeRender(() => {
  resolution[0] = renderer.state.viewport.width
  resolution[1] = renderer.state.viewport.height
  trailUniforms.u_head.value = head
})
// Palette and trail settings from `params`
function syncTrails() {
  const [a, b, c, d] = PALETTES[params.palette]
  trailUniforms.u_paletteA.value = a
  trailUniforms.u_paletteB.value = b
  trailUniforms.u_paletteC.value = c
  trailUniforms.u_paletteD.value = d
  trailUniforms.u_paletteSpread.value = [
    params.paletteRange,
    params.paletteOffset
  ]
  trailUniforms.u_lineWidth.value = params.lineWidth
  trailUniforms.u_shape.value = params.shape
}
syncTrails()

// A new length restarts every trail from where its particle is now
function setLength(length) {
  params.length = length
  trailUniforms.u_history.value = length
  ribbon.setPoints(ribbonPoints(length))
  history.resize(size * BLOCKS_PER_ROW, size * historyRows())
  fillHistory()
}

// A new count resizes the simulation and history in place, changes how
// many ribbons are drawn, and starts the particles again
function setCount(count) {
  size = count
  state.resize(size, size)
  nextState.resize(size, size)
  history.resize(size * BLOCKS_PER_ROW, size * historyRows())
  blockSize.reset(size, size)
  const instance = ribbon.attributes.instance
  instance.data = ids(size * size)
  instance.count = size * size
  instance.needsUpdate = true
  ribbon.setInstancedCount(size * size)
  trailUniforms.u_size.value = size
  reset()
}

const particles = new Obj()
trails.setParent(particles)

// --- post: the frame, a smeared copy, and the output
let width = window.innerWidth
let height = window.innerHeight
const frame = new RenderTarget(gl, {
  width: width * dpr,
  height: height * dpr
})
const smear = new Framebuffer(gl, {
  width,
  height,
  dpr,
  depth: false,
  minFilter: gl.NEAREST,
  // 8 bits can't hold a fade this slow: dim pixels round to the same value
  // each frame and never quite go out
  texdepth: Framebuffer.TEXTYPE_HALF_FLOAT_OES
})
const blendUniforms = {
  b_frame: new Uniform({
    name: 'frame',
    value: frame.texture,
    kind: 'texture'
  }),
  b_previous: new Uniform({ name: 'previous', kind: 'texture' }),
  u_smear: new Uniform({ name: 'smear', value: params.smear, kind: 'float' })
}
const blend = fullscreen(blendFrag, blendUniforms)
const outputUniforms = {
  b_image: new Uniform({ name: 'image', kind: 'texture' }),
  u_transition
}
const output = fullscreen(outputFrag, outputUniforms)

// The position texture, drawn over the output in the bottom-right corner
const textureUniforms = {
  b_position: new Uniform({ name: 'position', kind: 'texture' }),
  u_rect: new Uniform({ name: 'rect', value: [0, 0, 0, 0], kind: 'float_vec4' })
}
const textureView = fullscreen(textureFrag, textureUniforms)
const textureSize = new Vec2()
const texturePosition = new Vec2()
function showTexture() {
  // 256 CSS pixels, or a quarter of the screen on a small one
  const side = Math.min(256, width / 4, height / 4) * dpr
  const margin = 16 * dpr
  textureSize.reset(side, side)
  texturePosition.reset(width * dpr - side - margin, margin)
  textureUniforms.b_position.value = state.textures[0]
  textureUniforms.u_rect.value = [
    texturePosition.x,
    texturePosition.y,
    side,
    side
  ]
  renderer.render({
    scene: textureView,
    clear: false,
    viewport: [textureSize, texturePosition]
  })
}

// --- camera shots, from the original, at half scale
const v = (x, y, z) => new Vec3(x * 0.5, y * 0.5, z * 0.5)
const far = new Vec3(-25, 75, 100)
far.length = 100
const SHOTS = [
  [v(0, 0, 40), v(0, 0, 0), v(0, 3, 30), v(0, 0, 0), 50],
  [v(0, -30, 30), v(0, 30, 0), v(0, -30, 0), v(0, 30, 0), 20],
  [v(0, 100, 0), v(0, 0, 0), v(0, 20, 40), v(0, 20, -20), 40],
  [v(0, 20, 40), v(15, 0, -20), v(0, 20, 40), v(-15, 0, -20), 20],
  [v(0, 20, -60), v(5, 0, 0), v(0, 30, 50), v(5, 0, 0), 50],
  [v(0, -20, 0), v(0, 0, 0), v(10, 80, 10), v(0, 0, 0), 40],
  [v(30, 0, 0), v(20, 0, 0), v(30, 0, 30), v(0, 0, 0), 15],
  [v(80, 0, 0), v(0, 0, 0), v(0, 0, 80), v(0, 0, 0), 40],
  [v(0, 10, 0), v(0, 0, 0), v(10, 10, 60), v(0, 0, 0), 40],
  [far.scaleNew(0.1), v(0, 0, 0), far.scaleNew(0.5), v(0, 0, 0), 30],
  [v(0, 2, 30), v(-5, 0, 0), v(0, 5, -20), v(0, 0, 0), 30],
  [v(0, 5, 0), v(0, 0, 0), v(0, 40, 5), v(0, 0, 0), 30]
].map(([from, fromTarget, to, toTarget, duration]) => ({
  from,
  fromTarget,
  to,
  toTarget,
  duration
}))

// The shots drive the camera until you drag; then it's yours to orbit (and
// right-drag to pan) until the next shot. Zoom is handled below rather than
// by DollyCamera, so it works in both modes.
const camera = new DollyCamera(
  { element: gl.canvas, enableZoom: false, ease: 0.15, inertia: 0.85 },
  { fov: 100, near: 0.5, far: 500 }
)
const shotPosition = new Vec3()
let shot = SHOTS[0]
let shotTime = 0
let orbiting = false

const ease = (d) => (d < 0.5 ? 4 * d ** 3 : 1 - (-2 * d + 2) ** 3 * 0.5)
const lerpInto = (out, a, b, t) =>
  out.reset(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)

// The zoom eases towards params.zoom, so wheel steps glide
let zoom = params.zoom
let appliedZoom = zoom
function aim(delta) {
  zoom += (params.zoom - zoom) * (1 - Math.exp(-delta * 8))

  if (orbiting) {
    // keep your view, only changing its distance with the zoom
    camera.sphericalTarget.radius *= zoom / appliedZoom
  } else {
    const t = ease(Math.min(shotTime / shot.duration, 1))
    const target = camera.target
    lerpInto(target, shot.fromTarget, shot.toTarget, t)
    lerpInto(shotPosition, shot.from, shot.to, t)
    // along the line from the target, keeping the shot's direction
    camera.setPosition(
      target.x + (shotPosition.x - target.x) * zoom,
      target.y + (shotPosition.y - target.y) * zoom,
      target.z + (shotPosition.z - target.z) * zoom
    )
  }
  appliedZoom = zoom
  camera.update()
}

function startShot(index) {
  shot = SHOTS[index]
  shotTime = 0
  u_time.value = -10000
  // the shot takes the camera back, without any leftover spin
  orbiting = false
  camera.sphericalDelta.theta = 0
  camera.sphericalDelta.phi = 0
  camera.panDelta.reset(0, 0, 0)
}

// Fade to white, change shot, fade back
let fading = false
function nextShot() {
  if (fading) return
  fading = true
  setTimeout(() => {
    startShot(Math.floor(Math.random() * SHOTS.length))
    fading = false
  }, 2000)
}

// --- interaction: drag to orbit, scroll to zoom, click for the next shot
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const setZoom = (value) => {
  params.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
  pane.refresh()
}
gl.canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    // exponential, so each notch zooms by the same proportion
    setZoom(params.zoom * Math.exp(e.deltaY * 0.001))
  },
  { passive: false }
)
let playing = true
// DollyCamera does the orbiting; this only tells a drag (take the camera)
// from a click (next shot)
let pressed = false
let dragged = false
const down = new Vec2()
gl.canvas.addEventListener('pointerdown', (e) => {
  pressed = true
  dragged = false
  down.reset(e.clientX, e.clientY)
})
window.addEventListener('pointermove', (e) => {
  if (!pressed || dragged) return
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
    dragged = true
    orbiting = true
  }
})
window.addEventListener('pointerup', () => (pressed = false))
gl.canvas.addEventListener('click', () => {
  if (playing && !dragged) nextShot()
})
const playButton = document.getElementById('play')
playButton.addEventListener('click', () => {
  playing = !playing
  playButton.textContent = playing ? 'Pause' : 'Play'
  playButton.setAttribute('aria-pressed', String(!playing))
})

// --- controls, collapsed until opened
const pane = new Pane({
  title: 'Controls',
  expanded: false,
  container: document.getElementById('controls')
})
const colour = pane.addFolder({ title: 'Colour' })
colour
  .addBinding(params, 'palette', {
    options: Object.fromEntries(Object.keys(PALETTES).map((k) => [k, k]))
  })
  .on('change', syncTrails)
colour
  .addBinding(params, 'paletteRange', { label: 'range', min: 0, max: 1 })
  .on('change', syncTrails)
colour
  .addBinding(params, 'paletteOffset', { label: 'offset', min: 0, max: 1 })
  .on('change', syncTrails)
colour
  .addBinding(params, 'background', { color: { type: 'float' } })
  .on('change', ({ value: { r, g, b } }) => {
    renderer.clearColour = [r, g, b, 1]
  })
const trailsFolder = pane.addFolder({ title: 'Trails' })
trailsFolder
  .addBinding(params, 'count', { label: 'particles', options: COUNTS })
  .on('change', (e) => setCount(e.value))
// The slider has its own value: the trails only change length when it's
// let go, so mid-drag the simulation and the ribbon still agree
const trailLength = { length: params.length }
trailsFolder
  .addBinding(trailLength, 'length', { min: 2, max: MAX_HISTORY, step: 1 })
  .on('change', (e) => e.last && setLength(e.value))
trailsFolder
  .addBinding(params, 'lineWidth', { label: 'width', min: 0.01, max: 0.6 })
  .on('change', syncTrails)
trailsFolder
  .addBinding(params, 'smear', { min: 0, max: 0.995 })
  .on('change', (e) => (blendUniforms.u_smear.value = e.value))
trailsFolder
  .addBinding(params, 'shape', { options: SHAPES })
  .on('change', syncTrails)
trailsFolder.addBinding(params, 'speed', { min: 0, max: 3 })
trailsFolder.addBinding(params, 'showTexture', { label: 'texture' })
const cameraFolder = pane.addFolder({ title: 'Camera' })
cameraFolder.addBinding(params, 'zoom', { min: MIN_ZOOM, max: MAX_ZOOM })
cameraFolder.addButton({ title: 'Reset zoom' }).on('click', () => setZoom(1))

// --- resize, restore and run
function resize() {
  width = window.innerWidth
  height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
  frame.resize(width * dpr, height * dpr)
  smear.resize(width, height)
  blendUniforms.b_frame.value = frame.texture
}
window.addEventListener('resize', resize)
resize()

// A restored context has empty targets, so the particles start again
renderer.onContextRestored = reset

reset()
startShot(0)

let then = performance.now()
function run(now) {
  requestAnimationFrame(run)
  const delta = Math.min(0.5, (now - then) / 1000)
  then = now

  if (playing) {
    shotTime += delta
    if (shotTime > shot.duration) nextShot()
    u_time.value += delta * 0.05 * params.speed
    u_transition.value = Math.min(
      1,
      Math.max(0, u_transition.value + (fading ? delta : -delta) * 0.5)
    )
    step(delta * params.speed)
  }
  aim(delta)

  renderer.render({ scene: particles, camera, target: frame })

  blendUniforms.b_previous.value = smear.read.texture
  smear.render(renderer, { scene: blend })
  outputUniforms.b_image.value = smear.read.texture
  renderer.render({ scene: output })
  if (params.showTexture) showTexture()
}
requestAnimationFrame(run)
