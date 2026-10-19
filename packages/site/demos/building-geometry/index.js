import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Program,
  Uniform,
  Box,
  Sphere,
  Triangle,
  GeometryAttribute,
  mergeGeometries,
  Mat4,
  Quat,
  Vec2,
  Vec3
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import { SHAPES } from './shapes.js'
import sceneVert from './scene.vert'
import sceneFrag from './scene.frag'
import skyVert from './sky.vert'
import skyFrag from './sky.frag'

// A sculpture of concentric rings, built in code and drawn as one mesh.
//
//   parts  → module    boxes and spheres placed with applyMatrix, merged
//   module → ring      copied around a circle (every other copy mirrored),
//                      merged
//   rings  → sculpture merged into a single geometry
//
// A regrow wave shrinks each ring, re-rolls its shape and grows it back. The
// growing happens in the vertex shader (every vertex knows its ring and its
// module's centre), so the sculpture stays a single draw call; only the ring
// that changed is rebuilt before everything is re-merged.

const TAU = Math.PI * 2
const MAX_RINGS = 32
const SPHERE_SEGMENTS = 10

const WORLDS = [
  {
    name: 'Meadow',
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
  }
]

const params = {
  world: 0,
  shading: 'flat',
  merged: true,
  rings: 12,
  explode: 0,
  normals: false,
  drawCalls: 1,
  vertices: 0
}

const rand = (min, max) => min + Math.random() * (max - min)
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const jitter = (c) =>
  c.map((v) => Math.min(1, Math.max(0, v + rand(-0.04, 0.04))))

const matrix = (
  [x, y, z] = [0, 0, 0],
  [rx, ry, rz] = [0, 0, 0],
  [sx, sy, sz] = [1, 1, 1]
) =>
  Mat4.fromRotationTranslationScale(
    Quat.fromEuler(new Vec3(rx, ry, rz)),
    new Vec3(x, y, z),
    new Vec3(sx, sy, sz)
  )

// A vertex attribute with the same value on every vertex
const constant = (geometry, name, value) => {
  const count = geometry.attributes.position.count
  const data = new Float32Array(count * value.length)
  for (let i = 0; i < count; i++) data.set(value, i * value.length)
  geometry.addAttribute(
    name,
    new GeometryAttribute({ size: value.length, data })
  )
}

// ── Renderer, camera, sky ─────────────────────────────────────────────────
const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2) })
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, 1.5, 0),
    autoRotate: true,
    autoRotateSpeed: 0.25,
    minDistance: 8,
    maxDistance: 110,
    maxPolarAngle: Math.PI * 0.46
  },
  { fov: 40, near: 0.1, far: 250 }
)
camera.setPosition(0, 22, 34)

// The sky eases towards the current world's colours, and the fog follows it
const sky = WORLDS[0].bg.map((c) => [...c])
const u_bgA = new Uniform({ name: 'bgA', value: sky[0], kind: 'float_vec3' })
const u_bgB = new Uniform({ name: 'bgB', value: sky[1], kind: 'float_vec3' })
const u_bgC = new Uniform({ name: 'bgC', value: sky[2], kind: 'float_vec3' })
const u_resolution = new Uniform({ name: 'resolution', value: [1, 1] })
const skyMesh = new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: skyVert,
    fragment: skyFrag,
    uniforms: { u_bgA, u_bgB, u_bgC, u_resolution },
    depthTest: false,
    depthWrite: false
  })
})

// ── The scene program ─────────────────────────────────────────────────────
const u_mode = new Uniform({ name: 'mode', value: 0, kind: 'int' })
const u_ringScale = new Uniform({
  name: 'ringScale',
  value: new Float32Array(MAX_RINGS),
  kind: 'float'
})
// How far each module moves out from the centre, as a fraction of its distance
const u_explode = new Uniform({ name: 'explode', value: 0, kind: 'float' })
const program = new Program(gl, {
  vertex: sceneVert,
  fragment: sceneFrag,
  uniforms: { u_mode, u_ringScale, u_explode, u_fogColour: u_bgA }
})

// ── Building ──────────────────────────────────────────────────────────────

// One module: each part is a fresh Box or Sphere placed with applyMatrix and
// given its palette colour, then the parts are merged and shaded.
// - flat: give every triangle its own vertices, then compute face normals
// - smooth: weld the flat copy back together, which recomputes the normals.
//   Box faces don't share uvs, so their edges stay hard.
const buildModule = (shape, w, colours) => {
  const parts = []
  const add = (geometry, place, colour) => {
    geometry.applyMatrix(place)
    constant(geometry, 'color', colours[colour])
    parts.push(geometry)
  }
  shape.build(
    {
      box: ([x, y, z], [sx, sy, sz], colour = 'base', rotation) =>
        add(
          new Box(gl, { width: sx, height: sy, depth: sz }),
          matrix([x, y, z], rotation),
          colour
        ),
      sphere: ([x, y, z], radius, colour = 'base', scale) =>
        add(
          new Sphere(gl, { radius, widthSegments: SPHERE_SEGMENTS }),
          matrix([x, y, z], undefined, scale),
          colour
        )
    },
    w
  )

  const merged = mergeGeometries(parts)
  for (const part of parts) part.remove()
  const flat = merged.toNonIndexed()
  merged.remove()
  flat.computeVertexNormals()
  if (params.shading === 'flat') return flat

  const smooth = flat.mergeVertices()
  flat.remove()
  return smooth
}

// Pick a ring's shape, slot width and colours, like the manifold mandala:
// inner to outer colours across the rings, accents on the outer rings
const configureRing = (ring, count) => {
  const world = WORLDS[params.world]
  const i = ring.index
  const t = count > 1 ? i / (count - 1) : 0
  const name = pick(Object.keys(SHAPES))
  const shape = SHAPES[name]

  ring.shape = shape
  ring.radius = 2 + i * 1.3
  ring.height = 0.1 * Math.pow(i, 1.5)
  ring.count = Math.max(
    8,
    Math.round((TAU * ring.radius) / rand(1.2, 2.4) / 4) * 4
  )
  ring.width = (TAU * ring.radius) / ring.count
  // Most rings are around the catalogue's size; "hero" rings are much
  // bigger, and only stretch out and up so they still fill their slots
  ring.size = Math.random() < 0.3 ? rand(3, 5.5) : rand(0.9, 1.3)
  // A lean along the ring. Every other module is mirrored, so leaning rings
  // zig-zag.
  ring.lean = Math.random() < 0.6 ? rand(-0.75, 0.75) : 0

  const outerRing = i >= count - 3
  const accent =
    (outerRing && (shape.accent || Math.random() < 0.6)) ||
    (shape.accent && Math.random() < 0.4)
  ring.colours = {
    base: jitter(accent ? world.accent : mix(world.inner, world.outer, t)),
    accent: jitter(accent ? world.accent2 : world.accent)
  }
}

// Copy the module around the ring, mirroring every other copy, and merge.
// There's no clone(), so a copy is a merge of one geometry.
const buildRing = (ring) => {
  const module = buildModule(ring.shape, ring.width, ring.colours)
  module.applyMatrix(
    matrix(undefined, [ring.lean, 0, 0], [ring.size, ring.size, 1])
  )

  const copies = []
  for (let k = 0; k < ring.count; k++) {
    const copy = mergeGeometries([module])
    // Mirrored copies have their winding reversed by applyMatrix, so they
    // still face outwards with back-face culling on
    if (k % 2) copy.applyMatrix(matrix(undefined, undefined, [1, 1, -1]))
    const angle = (k / ring.count) * TAU
    const centre = [
      Math.cos(angle) * ring.radius,
      ring.height,
      -Math.sin(angle) * ring.radius
    ]
    copy.applyMatrix(matrix(centre, [0, angle, 0]))
    constant(copy, 'pivot', centre)
    constant(copy, 'ring', [ring.index])
    copies.push(copy)
  }
  module.remove()

  ring.geometry?.remove()
  ring.geometry = mergeGeometries(copies)
  for (const copy of copies) copy.remove()

  if (ring.mesh) ring.mesh.geometry = ring.geometry
  else {
    ring.mesh = new Mesh(gl, {
      geometry: ring.geometry,
      program,
      // The vertex shader moves modules outside the geometry's bounds
      frustumCulled: false
    })
    ring.mesh.setParent(separateGroup)
  }
}

// ── The sculpture ─────────────────────────────────────────────────────────
const root = new Obj()
const mergedGroup = new Obj()
const separateGroup = new Obj()
mergedGroup.setParent(root)
separateGroup.setParent(root)
let mergedMesh = null
let rings = []

// Merge every built ring into the single mesh
const mergeRings = () => {
  const built = rings.filter((ring) => ring.geometry)
  if (!built.length) return
  const geometry = mergeGeometries(built.map((ring) => ring.geometry))
  if (mergedMesh) {
    mergedMesh.geometry.remove()
    mergedMesh.geometry = geometry
  } else {
    mergedMesh = new Mesh(gl, { geometry, program, frustumCulled: false })
    mergedMesh.setParent(mergedGroup)
  }
  params.vertices = geometry.attributes.position.count
  updateDrawCalls()
}

// Rings start empty and are built as the first regrow wave reaches them
const createRings = () => {
  for (const ring of rings) {
    ring.geometry?.remove()
    ring.mesh?.setParent(null)
  }
  rings = Array.from({ length: params.rings }, (_, index) => ({
    index,
    scale: 0,
    target: 0,
    regrowAt: null,
    rerolling: false
  }))
  u_ringScale.value.fill(0)
  if (mergedMesh) {
    mergedMesh.geometry.remove()
    mergedMesh.setParent(null)
    mergedMesh = null
  }
  regrow(0.12)
}

let time = 0

// Schedule a wave from the centre outwards
const regrow = (stagger = 0.08) => {
  rings.forEach((ring) => (ring.regrowAt = time + ring.index * stagger))
}

// Rebuild every ring with its current shape, for a new shading mode
const rebuildRings = () => {
  for (const ring of rings) if (ring.shape) buildRing(ring)
  mergeRings()
}

const updateDrawCalls = () => {
  mergedGroup.visible = params.merged
  separateGroup.visible = !params.merged
  params.drawCalls = params.merged
    ? 1
    : rings.filter((ring) => ring.geometry).length
}

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
pane
  .addBinding(params, 'world', {
    options: Object.fromEntries(WORLDS.map((w, i) => [w.name, i]))
  })
  .on('change', () => regrow(0.06))
pane
  .addBinding(params, 'shading', {
    options: { flat: 'flat', smooth: 'smooth' }
  })
  .on('change', rebuildRings)
pane.addBinding(params, 'merged', { label: 'one mesh' }).on('change', () => {
  updateDrawCalls()
  pane.refresh()
})
pane
  .addBinding(params, 'rings', { min: 4, max: 20, step: 1 })
  .on('change', (e) => e.last && createRings())
pane
  .addBinding(params, 'explode', {
    min: -0.5,
    max: 2,
    format: (v) => `${Math.round(v * 100)}%`
  })
  .on('change', () => (u_explode.value = params.explode))
pane.addButton({ title: 'Regrow' }).on('click', () => regrow())
pane
  .addBinding(params, 'normals', { label: 'normals view' })
  .on('change', () => (u_mode.value = params.normals ? 1 : 0))
pane.addBinding(params, 'drawCalls', {
  label: 'draw calls',
  readonly: true,
  format: (v) => v.toFixed(0)
})
pane.addBinding(params, 'vertices', {
  readonly: true,
  format: (v) => v.toFixed(0)
})

// A click without a drag, or R, regrows
let down = null
gl.canvas.addEventListener(
  'pointerdown',
  (e) => (down = [e.clientX, e.clientY])
)
gl.canvas.addEventListener('pointerup', (e) => {
  if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) regrow()
  down = null
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') regrow()
})

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
  u_resolution.value = [width * renderer.dpr, height * renderer.dpr]
}
window.addEventListener('resize', resize)
resize()

createRings()

// ── Loop ──────────────────────────────────────────────────────────────────
let last = 0
let nextWave = 30
let nextSingle = 2.5
const run = (t) => {
  requestAnimationFrame(run)
  time = t * 0.001
  const dt = Math.min(time - last, 0.1)
  last = time

  // Now and then, regrow everything or one random ring
  if (time > nextWave) {
    regrow()
    nextWave = time + 30
  }
  if (time > nextSingle) {
    pick(rings).regrowAt = time
    nextSingle = time + 2.5
  }

  // Shrink rings whose turn has come, and re-roll each one once it has
  // vanished. The re-rolled rings are merged together, once per frame, before
  // they grow back.
  const ease = 1 - Math.exp(-dt * 5)
  const rerolled = []
  for (const ring of rings) {
    if (ring.regrowAt !== null && time >= ring.regrowAt) {
      ring.regrowAt = null
      ring.target = 0
      ring.rerolling = true
    }
    ring.scale += (ring.target - ring.scale) * ease
    if (ring.rerolling && ring.scale < 0.02) {
      ring.rerolling = false
      configureRing(ring, rings.length)
      buildRing(ring)
      rerolled.push(ring)
    }
    u_ringScale.value[ring.index] = ring.scale
  }
  if (rerolled.length) {
    mergeRings()
    for (const ring of rerolled) ring.target = 1
    pane.refresh()
  }

  // Ease the sky towards the current world over a few seconds
  const k = 1 - Math.exp(-dt)
  WORLDS[params.world].bg.forEach((colour, i) =>
    colour.forEach((v, c) => (sky[i][c] += (v - sky[i][c]) * k))
  )

  camera.update()
  renderer.render({ scene: skyMesh })
  renderer.render({ scene: root, camera, clear: false })
}
requestAnimationFrame(run)
