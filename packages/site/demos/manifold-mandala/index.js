import {
  Obj,
  Renderer,
  RenderTarget,
  Program,
  Mesh,
  Uniform,
  DollyCamera,
  Triangle,
  Geometry,
  GeometryAttribute,
  Vec2,
  Vec3
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import ringVert from './ring.vert'
import ringFrag from './ring.frag'
import postFrag from './post.frag'
import { SHAPES, buildModule, rand, pick, chance } from './shapes.js'

const TAU = Math.PI * 2

// --- worlds (palettes). New rings adopt the current world, so a change
// sweeps through the mandala from the centre outward.
const WORLDS = [
  {
    name: 'Meadow',
    // yellow core, green body, pink lattice
    inner: [0.98, 0.9, 0.32],
    outer: [0.6, 0.78, 0.32],
    accent: [0.93, 0.4, 0.47],
    accent2: [0.86, 0.6, 0.2],
    bg: [
      [1.0, 0.97, 0.88],
      [0.98, 0.8, 0.7],
      [0.82, 0.93, 0.9]
    ]
  },
  {
    name: 'Lagoon',
    inner: [0.4, 0.88, 0.86],
    outer: [0.22, 0.46, 0.78],
    accent: [1.0, 0.55, 0.28],
    accent2: [0.96, 0.86, 0.52],
    bg: [
      [0.93, 0.97, 1.0],
      [0.8, 0.88, 0.98],
      [0.99, 0.9, 0.84]
    ]
  },
  {
    name: 'Lavender',
    inner: [0.8, 0.64, 0.96],
    outer: [0.46, 0.36, 0.76],
    accent: [0.45, 0.9, 0.7],
    accent2: [0.98, 0.76, 0.86],
    bg: [
      [0.97, 0.94, 1.0],
      [0.92, 0.84, 0.98],
      [0.87, 0.97, 0.93]
    ]
  },
  {
    name: 'Ember',
    inner: [0.99, 0.6, 0.32],
    outer: [0.82, 0.22, 0.28],
    accent: [0.32, 0.34, 0.5],
    accent2: [0.99, 0.86, 0.56],
    bg: [
      [1.0, 0.95, 0.9],
      [0.99, 0.82, 0.74],
      [0.95, 0.9, 0.8]
    ]
  },
  {
    name: 'Sorbet',
    // sorbet: mint core, sea-green body, coral lattice
    inner: [0.72, 0.96, 0.78],
    outer: [0.3, 0.7, 0.55],
    accent: [0.98, 0.45, 0.42],
    accent2: [0.99, 0.82, 0.45],
    bg: [
      [0.95, 1.0, 0.95],
      [0.86, 0.96, 0.9],
      [1.0, 0.9, 0.86]
    ]
  },
  {
    name: 'Teal & gold',
    // deep teal body, gold core, magenta lattice
    inner: [0.98, 0.82, 0.4],
    outer: [0.12, 0.42, 0.48],
    accent: [0.95, 0.35, 0.55],
    accent2: [0.55, 0.85, 0.92],
    bg: [
      [0.94, 0.98, 0.97],
      [0.84, 0.93, 0.93],
      [0.99, 0.93, 0.82]
    ]
  },
  {
    name: 'Rose',
    // rose body, blush core, olive lattice
    inner: [1.0, 0.78, 0.82],
    outer: [0.86, 0.38, 0.52],
    accent: [0.36, 0.55, 0.32],
    accent2: [0.98, 0.9, 0.7],
    bg: [
      [1.0, 0.95, 0.95],
      [0.98, 0.86, 0.88],
      [0.9, 0.95, 0.86]
    ]
  },
  {
    name: 'Sky',
    // sky body, lemon core, red lattice
    inner: [0.98, 0.96, 0.6],
    outer: [0.36, 0.62, 0.92],
    accent: [0.92, 0.3, 0.36],
    accent2: [0.7, 0.9, 0.98],
    bg: [
      [0.96, 0.98, 1.0],
      [0.86, 0.93, 1.0],
      [1.0, 0.98, 0.86]
    ]
  },
  {
    name: 'Moss',
    // moss body, chartreuse core, lavender lattice
    inner: [0.82, 0.92, 0.5],
    outer: [0.34, 0.52, 0.28],
    accent: [0.7, 0.52, 0.92],
    accent2: [0.96, 0.72, 0.5],
    bg: [
      [0.97, 0.98, 0.92],
      [0.9, 0.94, 0.82],
      [0.93, 0.9, 0.98]
    ]
  },
  {
    name: 'Slate',
    // muted: slate body, peach core, teal lattice
    inner: [0.98, 0.8, 0.66],
    outer: [0.42, 0.46, 0.56],
    accent: [0.2, 0.68, 0.66],
    accent2: [0.96, 0.6, 0.5],
    bg: [
      [0.97, 0.96, 0.95],
      [0.9, 0.9, 0.92],
      [0.98, 0.9, 0.84]
    ]
  }
]
let worldIndex = Math.floor(Math.random() * WORLDS.length)
let world = WORLDS[worldIndex]

// Everything the controls panel changes. Ring layout applies as rings
// regrow; the rest is live.
const params = {
  // rings
  ringCount: 30,
  ringStep: 1.15, // radius step between slots
  rMin: 2.5,
  depth: 26, // front-to-back extent of the funnel
  // each ring picks a module width in this range; narrower modules mean
  // more instances around the ring
  widthMin: 1.5,
  widthMax: 3.4,
  maxHeroes: 3,
  heroChance: 0.3,
  // motion
  speed: 1,
  spin: 1, // multiplies each ring's own spin speed
  swirl: 0.035, // how far the vortex winds either way
  roll: 0.015, // whole-mandala roll, rad/s
  // atmosphere
  fog: 40,
  fogDist: 15, // fog starts this far in front of the camera's target
  fov: 85,
  // auto
  autoOrbit: true,
  idleDelay: 5,
  autoWorld: true, // next world every 45s
  reroll: true // a random ring regrows every 2.2s
}

// --- renderer
const dpr = Math.min(window.devicePixelRatio, 2)
const d = new Vec2(window.innerWidth, window.innerHeight)

// The scene pass clears to transparent: alpha 0 marks empty pixels as sky
const renderer = new Renderer({
  dpr,
  width: d.width,
  height: d.height,
  clearColour: [0, 0, 0, 0]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

// The G-buffer is float; without this extension there's nothing to show
if (!gl.getExtension('EXT_color_buffer_float'))
  document.documentElement.classList.add('no-float')

// Orbit / zoom / pan around the mandala
const camera = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, 0, 0),
    minDistance: 8,
    maxDistance: 180,
    ease: 0.12,
    inertia: 0.85
  },
  { fov: params.fov, near: 0.3, far: 800, aspect: d.width / d.height }
)
camera.setPosition(-25, 20, 25)

// --- scene G-buffer:
//   textures[0]: rgb lit colour, a linear view depth (0 = sky)
//   textures[1]: xyz view-space normal
// Depth is a 24-bit renderbuffer, since nothing samples it.
const sceneTarget = new RenderTarget(gl, {
  width: d.width * dpr,
  height: d.height * dpr,
  colour: 2,
  type: gl.FLOAT,
  format: gl.RGBA,
  internalFormat: gl.RGBA32F,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  depthTexture: false
})

// --- uniforms (keys are the GLSL names)
const uniforms = {
  u_time: new Uniform({ name: 'time', value: 0, kind: 'float' }),
  u_roll: new Uniform({ name: 'roll', value: 0, kind: 'float' }),
  u_swirl: new Uniform({ name: 'swirl', value: 0.02, kind: 'float' }),
  u_resolution: new Uniform({
    name: 'resolution',
    value: d.scaleNew(dpr).array,
    kind: 'float_vec2'
  }),
  u_dpr: new Uniform({ name: 'dpr', value: dpr, kind: 'float' }),
  u_fog: new Uniform({ name: 'fog', value: params.fog, kind: 'float' }),
  u_fogStart: new Uniform({ name: 'fogStart', value: 0, kind: 'float' }),
  u_tA: new Uniform({ name: 'tA', value: [0, 0, 0, 1], kind: 'float_vec4' }),
  u_tB: new Uniform({ name: 'tB', value: [1, 0, 0, 0], kind: 'float_vec4' }),
  u_tC: new Uniform({ name: 'tC', value: [0, 0, 0, 0], kind: 'float_vec4' }),
  u_tD: new Uniform({ name: 'tD', value: [0, 0, 0, 0], kind: 'float_vec4' }),
  u_tCol: new Uniform({ name: 'tCol', value: [1, 1, 1], kind: 'float_vec3' }),
  u_bgA: new Uniform({
    name: 'bgA',
    value: [...world.bg[0]],
    kind: 'float_vec3'
  }),
  u_bgB: new Uniform({
    name: 'bgB',
    value: [...world.bg[1]],
    kind: 'float_vec3'
  }),
  u_bgC: new Uniform({
    name: 'bgC',
    value: [...world.bg[2]],
    kind: 'float_vec3'
  }),
  b_scene: new Uniform({
    name: 'scene',
    value: sceneTarget.textures[0],
    kind: 'texture'
  }),
  b_normal: new Uniform({
    name: 'normal',
    value: sceneTarget.textures[1],
    kind: 'texture'
  }),
  u_tanFov: new Uniform({ name: 'tanFov', value: 1, kind: 'float' }),
  // near-camera fade and clipping are off here; the behind samplers just
  // reuse the scene
  b_behind: new Uniform({
    name: 'behind',
    value: sceneTarget.textures[0],
    kind: 'texture'
  }),
  b_behindNormal: new Uniform({
    name: 'behindNormal',
    value: sceneTarget.textures[1],
    kind: 'texture'
  }),
  u_nearFade: new Uniform({
    name: 'nearFade',
    value: [0, 0],
    kind: 'float_vec2'
  }),
  u_clipRadius: new Uniform({ name: 'clipRadius', value: 0, kind: 'float' })
}

const ringProgram = new Program(gl, {
  vertex: ringVert,
  fragment: ringFrag,
  uniforms,
  cullFace: null // mirrored modules flip winding
})

// --- rings
// A compact funnel: ring i sits at a fixed radius slot, small rings deep at
// the back, wide rings near the front. Head-on it reads as a mandala.

const scene = new Obj()
const rings = []

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const jitter = (c, j) => c.map((v) => Math.min(1, Math.max(0, v + rand(-j, j))))

function configureRing(ring) {
  const name = pick(Object.keys(SHAPES))
  const shape = SHAPES[name]

  const count = params.ringCount
  const R = params.rMin + ring.index * params.ringStep + rand(-0.35, 0.35)
  const z = (ring.index / (count - 1) - 0.5) * params.depth + rand(-0.6, 0.6)
  const wTarget = rand(params.widthMin, params.widthMax)
  const N = Math.max(8, Math.round((TAU * R) / wTarget / 4) * 4)
  const w = (TAU * R) / N

  const B = buildModule(name, w)

  const t01 = Math.min(1, ring.index / (count - 1))
  let col = mix(world.inner, world.outer, t01)
  // pink lattice lives on the outside; gold accents are occasional
  const outer = ring.index >= count - 4
  if (outer && (shape.accent || chance(0.6))) col = world.accent
  else if (shape.accent ? chance(0.4) : chance(0.12)) col = world.accent2
  col = jitter(col, 0.04)

  const twistTurns = chance(0.25) ? pick([1, 2, 3, -1, -2, 10]) : 0

  // a few "hero" rings at a time: bigger modules, big slow undulation
  const heroes = rings.filter((r) => r !== ring && r.cfg?.hero).length
  const hero = heroes < params.maxHeroes && chance(params.heroChance)
  const size = hero ? rand(1.6, 4.3) : 1

  // radial petals (in/out) and axial ripple (forward/back); frequencies are
  // integers so the wave closes seamlessly around the ring
  const waveF = hero ? pick([3, 4, 6]) : pick([0, 2, 3, 4, 5, 6, 8])
  const waveA = waveF ? (hero ? rand(0.08, 1.16) : rand(0.03, 0.12)) : 0
  const zWaveA = hero ? rand(1.5, 3.5) : chance(0.7) ? rand(0.3, 1.8) : 0

  ring.cfg = {
    name,
    R,
    N,
    z,
    hero,
    size,
    spin: rand(0, TAU),
    spinSpeed: rand(0.02, 0.12) * (ring.index % 2 ? 1 : -1),
    tA: [R, z, 0, 0],
    tB: [N, waveA, waveF, rand(-1, 1) * shape.tilt],
    tC: [twistTurns, zWaveA, pick([2, 3, 4, 5, 6]), chance(0.5) ? 1 : 0],
    tD: [
      chance(0.6) ? rand(0.05, 0.25) : 0,
      rand(0, TAU),
      pick([1, 2, 3, 4, 6]),
      rand(0.6, 1.6)
    ],
    col
  }

  // geometry: module verts + per-instance slot/random
  const inst = new Float32Array(N * 2)
  for (let i = 0; i < N; i++) inst.set([i, Math.random()], i * 2)
  const geometry = new Geometry(gl, {
    position: new GeometryAttribute({
      size: 3,
      data: new Float32Array(B.positions)
    }),
    normal: new GeometryAttribute({
      size: 3,
      data: new Float32Array(B.normals)
    }),
    inst: new GeometryAttribute({ size: 2, data: inst, instanced: 1 })
  })

  if (ring.mesh) {
    ring.mesh.geometry.remove()
    ring.mesh.geometry = geometry
  } else {
    ring.mesh = new Mesh(gl, {
      geometry,
      program: ringProgram,
      frustumCulled: false
    })
    // per-ring uniforms are pushed into the shared program right before draw
    ring.mesh.addBeforeRender(() => {
      const c = ring.cfg
      uniforms.u_tA.value = c.tA
      uniforms.u_tB.value = c.tB
      uniforms.u_tC.value = c.tC
      uniforms.u_tD.value = c.tD
      uniforms.u_tCol.value = c.col
    })
    ring.mesh.setParent(scene)
  }
}

// Rings regrow: shrink to nothing, re-roll their module, unfold again.
function addRing() {
  const ring = { index: rings.length, scale: 0, target: 1, regrowAt: null }
  configureRing(ring)
  rings.push(ring)
}
for (let i = 0; i < params.ringCount; i++) addRing()

// --- post: outlines, AO and fog from the G-buffer
const postMesh = new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: `#version 300 es
in vec3 position;
void main() { gl_Position = vec4(position, 1.0); }`,
    fragment: postFrag,
    uniforms,
    depthTest: false
  })
})

// --- resize
function resize() {
  d.reset(window.innerWidth, window.innerHeight)
  renderer.dimensions = d
  uniforms.u_resolution.value = d.scaleNew(dpr).array
  camera.perspective({ aspect: d.width / d.height })
  // keeps the same textures, so the post uniforms stay valid
  sceneTarget.resize(d.width * dpr, d.height * dpr)
}
window.addEventListener('resize', resize)

// --- interaction
let playing = true
let time = 0
let roll = 0

// regrow every ring in a wave from the centre outward
function regrowWave(stagger = 0.08) {
  rings.forEach((r) => (r.regrowAt = time + r.index * stagger))
}
function setWorld(index) {
  worldIndex = index
  world = WORLDS[worldIndex]
  regrowWave()
  pane.refresh()
}
const nextWorld = () => setWorld((worldIndex + 1) % WORLDS.length)

// Slots are spread over the whole count, so every ring moves and regrows
function setRingCount(count) {
  while (rings.length > count) {
    const ring = rings.pop()
    ring.mesh.setParent(null)
    ring.mesh.geometry.remove()
  }
  while (rings.length < count) addRing()
  regrowWave(0.04)
}

// a click (not a drag-to-orbit) switches world
const down = new Vec2()
gl.canvas.addEventListener('pointerdown', (e) =>
  down.reset(e.clientX, e.clientY)
)
gl.canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) nextWorld()
})
window.addEventListener('keydown', (e) => {
  // leave keys alone while typing into the panel
  if (e.target instanceof HTMLInputElement) return
  if (e.code === 'Space') togglePlaying()
  if (e.code === 'KeyR') regrowWave(0.04)
})
setInterval(() => playing && params.autoWorld && nextWorld(), 45000)
// and every so often a single ring re-rolls
setInterval(() => {
  if (playing && params.reroll) pick(rings).regrowAt = time
}, 2200)

// --- auto orbit
// After `params.idleDelay` seconds without input the camera drifts along a Lissajous
// path in front of the mandala. It starts idle, so it orbits from the first
// frame. Any pointer or wheel input hands control straight back.
const ORBIT = {
  azAmp: 0.955, // radians either side of head-on (left/right)
  elAmp: 0.602, // radians above/below (up/down)
  azRate: 0.09, // rad/s of the sine argument; 0.09 : 0.13 gives a slow-closing figure
  elRate: 0.13,
  elPhase: 10.7,
  follow: 2.6, // how quickly the camera chases the path point (1/s)
  ramp: 0.4 // how quickly the orbit takes hold once idle (1/s)
}
let idleFor = params.idleDelay // start idle
let pointerHeld = false
let autoBlend = 0 // 0 = user owns the camera, 1 = orbit fully in charge
let orbitT = 0 // only advances while orbiting, so the path never jumps

const markActive = () => {
  idleFor = 0
  autoBlend = 0 // drop out immediately so we never fight a drag
}
gl.canvas.addEventListener('pointerdown', () => {
  pointerHeld = true
  markActive()
})
gl.canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) markActive()
})
window.addEventListener('pointerup', () => {
  pointerHeld = false
  markActive()
})
gl.canvas.addEventListener('wheel', markActive, { passive: true })

function updateAutoOrbit(dt) {
  idleFor = pointerHeld ? 0 : idleFor + dt
  if (!params.autoOrbit || idleFor < params.idleDelay) return

  autoBlend += (1 - autoBlend) * (1 - Math.exp(-dt * ORBIT.ramp))
  orbitT += dt * autoBlend

  const p = camera.position
  const t = camera.target
  const ox = p.x - t.x
  const oy = p.y - t.y
  const oz = p.z - t.z
  // keep whatever zoom the user left us at
  const dist = Math.hypot(ox, oy, oz) || 1

  // +z is "in front": azimuth swings around y, elevation tips up/down
  const az = ORBIT.azAmp * Math.sin(orbitT * ORBIT.azRate)
  const el = ORBIT.elAmp * Math.sin(orbitT * ORBIT.elRate + ORBIT.elPhase)
  const gx = dist * Math.sin(az) * Math.cos(el)
  const gy = dist * Math.sin(el)
  const gz = dist * Math.cos(az) * Math.cos(el)

  // chase the path point, then push back out to the same radius so the
  // linear step doesn't slowly dolly us inward
  const k = 1 - Math.exp(-dt * ORBIT.follow * autoBlend)
  const nx = ox + (gx - ox) * k
  const ny = oy + (gy - oy) * k
  const nz = oz + (gz - oz) * k
  const s = dist / (Math.hypot(nx, ny, nz) || 1)
  camera.setPosition(t.x + nx * s, t.y + ny * s, t.z + nz * s)
}

// --- controls, collapsed until opened
const pane = new Pane({
  title: 'Controls',
  expanded: false,
  container: document.getElementById('controls')
})
const state = {
  get world() {
    return worldIndex
  },
  set world(index) {
    setWorld(index)
  },
  get playing() {
    return playing
  },
  set playing(value) {
    playing = value
  }
}
function togglePlaying() {
  playing = !playing
  pane.refresh()
}

pane.addBinding(state, 'world', {
  label: 'world',
  options: Object.fromEntries(WORLDS.map((w, i) => [w.name, i]))
})
pane.addBinding(state, 'playing')
pane.addButton({ title: 'Next world' }).on('click', nextWorld)
pane.addButton({ title: 'Regrow' }).on('click', () => regrowWave(0.04))

const ringsFolder = pane.addFolder({ title: 'Rings' })
ringsFolder
  .addBinding(params, 'ringCount', { label: 'count', min: 6, max: 60, step: 1 })
  .on('change', (e) => e.last && setRingCount(e.value))
const regrowOnRelease = (e) => e.last && regrowWave(0.04)
ringsFolder
  .addBinding(params, 'ringStep', { label: 'step', min: 0.4, max: 3 })
  .on('change', regrowOnRelease)
ringsFolder
  .addBinding(params, 'rMin', { label: 'inner radius', min: 0.5, max: 12 })
  .on('change', regrowOnRelease)
ringsFolder
  .addBinding(params, 'depth', { min: 0, max: 80 })
  .on('change', regrowOnRelease)
ringsFolder
  .addBinding(params, 'widthMin', { label: 'module min', min: 0.5, max: 8 })
  .on('change', regrowOnRelease)
ringsFolder
  .addBinding(params, 'widthMax', { label: 'module max', min: 0.5, max: 8 })
  .on('change', regrowOnRelease)
ringsFolder.addBinding(params, 'maxHeroes', {
  label: 'max heroes',
  min: 0,
  max: 10,
  step: 1
})
ringsFolder.addBinding(params, 'heroChance', {
  label: 'hero chance',
  min: 0,
  max: 1
})
ringsFolder.addBinding(params, 'reroll', { label: 'random regrow' })

const motion = pane.addFolder({ title: 'Motion' })
motion.addBinding(params, 'speed', { min: 0, max: 4 })
motion.addBinding(params, 'spin', { min: -4, max: 4 })
motion.addBinding(params, 'swirl', { min: 0, max: 0.15 })
motion.addBinding(params, 'roll', { min: -0.2, max: 0.2 })

const atmosphere = pane.addFolder({ title: 'Atmosphere' })
atmosphere
  .addBinding(params, 'fog', { min: 5, max: 200 })
  .on('change', (e) => (uniforms.u_fog.value = e.value))
atmosphere.addBinding(params, 'fogDist', {
  label: 'fog start',
  min: -40,
  max: 60
})
atmosphere
  .addBinding(params, 'fov', { min: 20, max: 120 })
  .on('change', (e) => camera.perspective({ fov: e.value }))
atmosphere.addBinding(params, 'autoWorld', { label: 'cycle worlds' })

const orbit = pane.addFolder({ title: 'Auto orbit', expanded: false })
orbit.addBinding(params, 'autoOrbit', { label: 'enabled' })
orbit.addBinding(params, 'idleDelay', { label: 'idle delay', min: 0, max: 30 })
orbit.addBinding(ORBIT, 'azAmp', { label: 'left/right', min: 0, max: 1.5 })
orbit.addBinding(ORBIT, 'elAmp', { label: 'up/down', min: 0, max: 1.4 })
orbit.addBinding(ORBIT, 'azRate', { label: 'l/r rate', min: 0, max: 0.5 })
orbit.addBinding(ORBIT, 'elRate', { label: 'u/d rate', min: 0, max: 0.5 })
orbit.addBinding(ORBIT, 'follow', { min: 0.1, max: 10 })

// --- loop
let last = performance.now()
function frame(now) {
  requestAnimationFrame(frame)
  let dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!playing) return
  // the camera keeps real time; the mandala runs at `speed`
  const camDt = dt
  dt *= params.speed
  time += dt
  roll += dt * params.roll

  uniforms.u_time.value = time
  uniforms.u_roll.value = roll

  // the vortex slowly winds and unwinds
  uniforms.u_swirl.value = params.swirl * Math.sin(time * 0.07)

  const ke = 1 - Math.exp(-dt * 5)
  for (const ring of rings) {
    if (ring.regrowAt !== null && time >= ring.regrowAt) {
      ring.target = 0
      ring.regrowAt = null
    }
    ring.scale += (ring.target - ring.scale) * ke
    if (ring.target === 0 && ring.scale < 0.02) {
      configureRing(ring)
      ring.target = 1
    }
    ring.cfg.spin += ring.cfg.spinSpeed * params.spin * dt
    ring.cfg.tA = [
      ring.cfg.R,
      ring.cfg.z,
      ring.cfg.spin,
      ring.scale * ring.cfg.size
    ]
  }

  // ease the sky toward the current world
  const k = 1 - Math.exp(-dt * 0.25)
  ;['u_bgA', 'u_bgB', 'u_bgC'].forEach((key, i) => {
    uniforms[key].value = mix(uniforms[key].value, world.bg[i], k)
  })

  updateAutoOrbit(camDt)
  camera.update()
  // fog starts just in front of the mandala, wherever the camera is
  uniforms.u_fogStart.value = Math.max(
    0,
    camera.position.distance(camera.target) - params.fogDist
  )

  uniforms.u_tanFov.value = Math.tan((camera.fov * Math.PI) / 360)
  renderer.render({ scene, camera, target: sceneTarget })
  renderer.render({ scene: postMesh, clear: false })
}
requestAnimationFrame(frame)
