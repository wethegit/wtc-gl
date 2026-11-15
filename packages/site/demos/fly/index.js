import {
  Stage,
  FlyCamera,
  InstancedMesh,
  Cylinder,
  Program,
  Uniform,
  litShading
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import { RULES, expand, random, hash } from './grammar.js'
import vertex from './prism.vert'
import prismFragment from './prism.frag'

// Fly through endless space filled with prisms. A FlyCamera flies forward
// on its own and is steered by dragging or with the keys. Space is split
// into cubic cells; each one grows a dozen or so structures from a small rule
// grammar (towers, spirals, rings and branches, in the spirit of Context Free
// Art), seeded by the cell's coordinates so the same place always grows the
// same thing. Only the 3 × 3 × 3 cells around the camera exist: as it moves
// into a new cell, the ones left behind are regrown ahead of it. Each cell is
// two InstancedMeshes, triangular and hexagonal prisms, drawn by a small
// custom program using litShading and fog that hides the edge of the world.

const CELL = 50
const CAPACITY = 2500
const FOG = [0.86, 0.88, 0.93]
const PALETTE = [
  [0.1, 0.42, 0.45], // teal
  [0.93, 0.45, 0.33], // coral
  [0.95, 0.72, 0.25], // mustard
  [0.3, 0.33, 0.45], // slate
  [0.6, 0.3, 0.48] // plum
]

const params = {
  seed: 1,
  fog: 12,
  turnSpeed: 0.9,
  accelerationMode: false,
  paused: false,
  speed: 6,
  maxSpeed: 40
}

const hud = document.getElementById('hud')

// ── Stage and camera ──────────────────────────────────────────────────────
const stage = new Stage({
  controls: false,
  shadow: false,
  clearColour: [...FOG, 1],
  lights: {
    direction: [0.4, 0.8, 0.3],
    intensity: 0.9,
    sky: [0.5, 0.52, 0.58],
    ground: [0.22, 0.2, 0.24],
    ambient: 0.12
  },
  onBeforeRender: (time, delta) => {
    fly.update(delta)
    grow()
    report()
  }
})

const fly = new FlyCamera(
  {
    element: stage.canvas,
    speed: params.speed,
    maxSpeed: params.maxSpeed,
    acceleration: 12,
    turnSpeed: params.turnSpeed
  },
  { fov: 60, near: 0.1, far: CELL * 1.6 }
)
// Start in the middle of a cell, looking down −Z
fly.position.reset(CELL / 2, CELL / 2, CELL / 2)
stage.camera = fly

// ── The prisms ────────────────────────────────────────────────────────────
const { gl } = stage
const shapes = {
  TRI: new Cylinder(gl, { radialSegments: 3 }),
  HEX: new Cylinder(gl, { radialSegments: 6 })
}

const u_fogColour = new Uniform({
  name: 'fogColour',
  value: FOG,
  kind: 'float_vec3'
})
// Clear to `params.fog`, and all fog a cell away: the nearest cell that
// hasn't grown is never closer than that
const u_fog = new Uniform({
  name: 'fog',
  value: [params.fog, CELL],
  kind: 'float_vec2'
})
const program = new Program(gl, {
  vertex,
  fragment: `#version 300 es\nprecision highp float;\n${litShading}\n${prismFragment}`,
  uniforms: { ...stage.lights.uniforms, u_fogColour, u_fog }
})

// 27 cells, each a mesh per shape, made once and regrown as the camera moves
const cells = Array.from({ length: 27 }, () => {
  const meshes = {}
  for (const name in shapes) {
    meshes[name] = new InstancedMesh(gl, {
      geometry: shapes[name],
      program,
      count: CAPACITY
    })
    meshes[name].count = 0
    stage.add(meshes[name], { castShadow: false })
  }
  return { key: null, meshes }
})

const origin = new Float32Array([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
])

// Grow a cell's structures, into its meshes
function fill(cell, x, y, z) {
  const counts = { TRI: 0, HEX: 0 }
  const { meshes } = cell
  const rng = random(hash(x, y, z, params.seed))
  expand(RULES, 'CLUSTER', origin, rng, (shape, m, h) => {
    const mesh = meshes[shape]
    const i = counts[shape]
    if (i >= CAPACITY) return false
    mesh.matrices.set(m, i * 16)
    // A colour from the palette, a little lighter or darker
    const colour = PALETTE[((h % 5) + 5) % 5]
    const shade = 0.85 + rng() * 0.3
    mesh.colours[i * 3] = colour[0] * shade
    mesh.colours[i * 3 + 1] = colour[1] * shade
    mesh.colours[i * 3 + 2] = colour[2] * shade
    counts[shape]++
  })
  for (const name in meshes) {
    const mesh = meshes[name]
    mesh.position.reset((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL)
    // Setting the count marks the instances as changed
    mesh.count = counts[name]
    mesh.visible = counts[name] > 0
  }
  cell.key = `${x},${y},${z}`
}

// Keep the cells around the camera grown, regrowing the ones left behind
let centre = null
function grow(force = false) {
  const p = fly.position
  const cx = Math.floor(p.x / CELL)
  const cy = Math.floor(p.y / CELL)
  const cz = Math.floor(p.z / CELL)
  const key = `${cx},${cy},${cz}`
  if (key === centre && !force) return
  centre = key

  const wanted = new Map()
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = cx + dx
        const y = cy + dy
        const z = cz + dz
        wanted.set(`${x},${y},${z}`, [x, y, z])
      }
    }
  }
  const free = cells.filter((cell) => force || !wanted.has(cell.key))
  for (const cell of cells) if (!force) wanted.delete(cell.key)
  for (const [x, y, z] of wanted.values()) fill(free.pop(), x, y, z)
}

// ── HUD and controls ──────────────────────────────────────────────────────
let lastReport = 0
function report() {
  const now = performance.now()
  if (now - lastReport < 200) return
  lastReport = now
  let prisms = 0
  for (const cell of cells) {
    for (const name in cell.meshes) prisms += cell.meshes[name].count
  }
  if (params.speed !== fly.speed || params.paused !== fly.paused) {
    params.speed = fly.speed
    params.paused = fly.paused
    speed.refresh()
    paused.refresh()
  }
  hud.textContent = [
    fly.paused
      ? 'paused'
      : `${fly.currentSpeed.toFixed(1)} units/s${fly.currentSpeed < 0 ? ', reversing' : ''}`,
    `cell ${centre} · ${prisms} prisms`
  ].join('\n')
}

const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
// Kept in step with the camera, as the keys change them too
const speed = pane
  .addBinding(params, 'speed', { min: 0, max: 80 })
  .on('change', ({ value }) => (fly.speed = Math.min(value, fly.maxSpeed)))
// The fastest R or a boost can go, with reverse at half of it
pane
  .addBinding(params, 'maxSpeed', { label: 'max speed', min: 5, max: 80 })
  .on('change', ({ value }) => {
    fly.maxSpeed = value
    fly.maxReverseSpeed = value / 2
    fly.speed = Math.min(fly.speed, value)
  })
const paused = pane
  .addBinding(params, 'paused')
  .on('change', ({ value }) => (fly.paused = value))
pane
  .addBinding(params, 'turnSpeed', { label: 'turn speed', min: 0.2, max: 3 })
  .on('change', ({ value }) => (fly.turnSpeed = value))
let cruise = fly.speed
pane
  .addBinding(params, 'accelerationMode', { label: 'W/S boost' })
  .on('change', ({ value }) => {
    // Boosting starts from a standstill, so it only moves while W or S is
    // held, and the cruising speed comes back when it's turned off
    if (value) {
      cruise = fly.speed
      fly.speed = 0
    } else {
      fly.speed = cruise
    }
    fly.accelerationMode = value
    document.getElementById('updown').textContent = value
      ? 'boost, reverse'
      : 'pitch'
  })
pane
  .addBinding(params, 'fog', { label: 'clear to', min: 0, max: CELL - 5 })
  .on('change', ({ value }) => (u_fog.value = [value, CELL]))
pane.addButton({ title: 'New world' }).on('click', () => {
  params.seed = (Math.random() * 2 ** 31) | 0
  grow(true)
})
