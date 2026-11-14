import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  InstancedMesh,
  Program,
  Uniform,
  Plane,
  GLTFLoader,
  Lights,
  Shadow,
  shadowShading,
  Raycast,
  Mat4,
  Vec2,
  Vec3
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import { createPhysics } from './physics.js'

// Five icons, each a .glb holding a bevelled render mesh and a few convex
// collider pieces, tagged in the nodes' extras. GLTFLoader turns each icon's
// material into a LitProgram, which is switched to instanced so every copy
// of an icon is one InstancedMesh, and the colliders' vertices become convex
// hulls in a Rapier world with no gravity. The icons drip in from outside
// the view and a clamped spring pulls them together; the pointer's Raycast
// pushes them aside and a click blasts them apart. They cast a Shadow onto
// each other and onto a backdrop behind them, drawn by a small custom
// program that's only the shadow, using the shadowShading GLSL.

const ICON_NAMES = ['Collab', 'Curious', 'Doers', 'Ethical', 'Quality']
const MAX_COUNT = 120

const CONFIG = {
  count: 48,
  spawnInterval: 0.12, // seconds between drips
  spawnSpeed: 9, // units/s toward the centre as each icon enters
  attraction: 6, // spring to the centre, accel per unit of distance
  maxPull: 14, // cap on that accel
  repelRadius: 1.8, // distance from the pointer ray that feels the push
  repelStrength: 160, // accel right on the ray, falling off squared to 0 at the radius
  repelSpin: 10, // random tumble added while pushed
  blastRadius: 5, // click blast reach, from where the click lands
  blastStrength: 16, // outward speed (units/s) given at the blast centre
  blastSpin: 8, // random tumble (rad/s) given at the blast centre
  linearDamping: 0.6,
  angularDamping: 0.4,
  restitution: 0.2,
  friction: 0.5,
  dt: 1 / 60,
  maxSubsteps: 3,
  framing: 1.9, // the shorter viewport side spans this many clump radii, each way
  look: {
    background: '#252525',
    light: 0.85,
    gloss: 0,
    shadow: 0.35,
    softness: 2,
    sky: 0.55
  }
}

const reduceMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches
const motionScale = reduceMotion ? 0.4 : 1

// ── Renderer, camera, lights ──────────────────────────────────────────────
const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2) })
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new Camera({ fov: 35, near: 0.1, far: 200 })

const key = new Vec3(-0.35, 0.6, 1).normalise()
const lights = new Lights({
  direction: [key.x, key.y, key.z],
  intensity: CONFIG.look.light,
  ambient: 0.04
})

const shadow = new Shadow(gl, {
  lights,
  mapSize: 2048,
  softness: CONFIG.look.softness
})

const scene = new Obj()
const swarm = new Obj()
swarm.setParent(scene)
shadow.add(swarm)

// ── Backdrop ──────────────────────────────────────────────────────────────
// Only the shadow: black, as opaque as the shadow is dark
const backdropProgram = new Program(gl, {
  vertex: /* glsl */ `#version 300 es
    in vec3 position;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_shadowMatrix;
    uniform float u_shadowNormalBias;
    out vec4 v_shadowCoord;
    void main() {
      vec4 world = u_modelMatrix * vec4(position, 1.0);
      // The plane faces the camera, along +z
      vec3 offset = vec3(0.0, 0.0, u_shadowNormalBias);
      v_shadowCoord = u_shadowMatrix * vec4(world.xyz + offset, 1.0);
      gl_Position = u_projectionMatrix * u_viewMatrix * world;
    }`,
  fragment: /* glsl */ `#version 300 es
    precision highp float;
    ${shadowShading}
    uniform float u_opacity;
    in vec4 v_shadowCoord;
    out vec4 colour;
    void main() {
      colour = vec4(0.0, 0.0, 0.0, (1.0 - shadowFactor(v_shadowCoord)) * u_opacity);
    }`,
  uniforms: {
    ...shadow.uniforms,
    u_opacity: new Uniform({
      name: 'u_opacity',
      value: CONFIG.look.shadow,
      kind: 'float'
    })
  },
  transparent: true,
  depthWrite: false
})
const backdrop = new Mesh(gl, {
  geometry: new Plane(gl, { width: 400, height: 400 }),
  program: backdropProgram,
  frustumCulled: false
})
backdrop.setParent(scene)

// ── Icons ─────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud')

// Each icon's render mesh becomes an InstancedMesh with the material the
// loader made for it, and its colliders' vertices the physics hulls
async function loadIcon(name) {
  const url = new URL(`./models/${name}.glb`, import.meta.url).href
  const gltf = await GLTFLoader.load(gl, url, { lights, shadow })
  let render = null
  const hulls = []
  gltf.json.nodes.forEach((node, i) => {
    if (node.extras?.role === 'render') render = gltf.nodes[i]
    else if (node.extras?.collider === 'convex') {
      // No transforms on the pieces: their vertices are in the icon's space
      hulls.push(gltf.nodes[i].geometry.attributes.position.data)
    }
  })
  if (!render) throw new Error(`${name}.glb has no render mesh`)
  if (!hulls.length) throw new Error(`${name}.glb has no convex colliders`)

  const { geometry, program } = render
  program.instanced = true
  geometry.computeBoundingSphere()
  const { center, radius } = geometry.bounds
  const mesh = new InstancedMesh(gl, {
    geometry,
    program,
    count: MAX_COUNT,
    // The light camera and this one would cull differently, re-uploading
    // the instances twice a frame. They're all in view anyway.
    frustumCulled: false
  })
  mesh.name = name
  mesh.count = 0
  mesh.setParent(swarm)
  return {
    name,
    mesh,
    program,
    shininess: program.shininess,
    hulls,
    radius: center.length + radius,
    live: []
  }
}

let icons
let physics
try {
  ;[icons, physics] = await Promise.all([
    Promise.all(ICON_NAMES.map(loadIcon)),
    createPhysics(CONFIG)
  ])
  hud.hidden = true
} catch (error) {
  hud.textContent = `Couldn't load the icons: ${error.message}`
  throw error
}
const avgRadius = icons.reduce((s, i) => s + i.radius, 0) / icons.length
const maxRadius = Math.max(...icons.map((i) => i.radius))

// Rough radius of the settled clump: volume grows with count
const clumpRadius = () => avgRadius * 0.85 * Math.cbrt(CONFIG.count)

function frame() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.dimensions = new Vec2(w, h)

  const r = clumpRadius()
  const aspect = w / h
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
  const dist = (r * CONFIG.framing) / (tanHalf * Math.min(1, aspect)) + r
  camera.position.reset(0, 0, dist)
  camera.perspective({ aspect, far: dist + 100 })

  const back = r + 2.5
  backdrop.position.z = -back
  // The shadow map covers a sphere around the origin: make it reach the
  // corners of the backdrop the camera sees, so no shadow is cut off
  const halfHeight = (dist + back) * tanHalf
  shadow.size = Math.hypot(halfHeight * aspect, halfHeight, back)
}

function applyLook() {
  const { look } = CONFIG
  const hex = parseInt(look.background.slice(1), 16)
  renderer.clearColour = [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
    1
  ]
  document.body.style.background = look.background
  backdropProgram.uniforms.u_opacity.value = look.shadow
  shadow.softness = look.softness
  lights.intensity = look.light
  // The hemisphere stands in for the pen's room environment
  const s = look.sky
  lights.sky = [s, s, s * 1.04]
  lights.ground = [s * 0.4, s * 0.4, s * 0.4]
  // A sharper, stronger highlight stands in for a clearcoat; none at 0
  for (const icon of icons) {
    icon.program.specular = look.gloss * 0.7
    icon.program.shininess = icon.shininess + look.gloss * 120
  }
}

// ── Spawning ──────────────────────────────────────────────────────────────
// A shuffled bag of the icons, refilled when empty, so the mix stays even
let bag = []
const nextIcon = () => {
  if (!bag.length) {
    bag = icons.slice()
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
  }
  return bag.pop()
}

// A uniformly random rotation
const randomQuaternion = () => {
  const u1 = Math.random()
  const a = Math.random() * Math.PI * 2
  const b = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u1)
  const t = Math.sqrt(u1)
  return {
    x: s * Math.sin(a),
    y: s * Math.cos(a),
    z: t * Math.sin(b),
    w: t * Math.cos(b)
  }
}

let pending = 0
let spawnTimer = 0

function spawnOne() {
  const icon = nextIcon()
  if (icon.live.length >= MAX_COUNT) return

  // A point on a ring just outside the view at z = 0
  const halfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360)
  const ring = Math.hypot(halfH * camera.aspect, halfH) + maxRadius
  const a = Math.random() * Math.PI * 2
  const position = {
    x: Math.cos(a) * ring,
    y: Math.sin(a) * ring,
    z: (Math.random() - 0.5) * clumpRadius()
  }

  // Inward, with a little sideways drift so they don't all meet head-on
  const speed = CONFIG.spawnSpeed * motionScale * (0.8 + Math.random() * 0.4)
  const side = (Math.random() - 0.5) * 0.5
  const linvel = {
    x: (-Math.cos(a) - Math.sin(a) * side) * speed,
    y: (-Math.sin(a) + Math.cos(a) * side) * speed,
    z: -position.z * 0.5
  }
  const spin = 3 * motionScale
  const angvel = {
    x: (Math.random() - 0.5) * spin * 2,
    y: (Math.random() - 0.5) * spin * 2,
    z: (Math.random() - 0.5) * spin * 2
  }

  const item = physics.addBody(icon.hulls, {
    position,
    rotation: randomQuaternion(),
    linvel,
    angvel
  })
  icon.live.push(item)
  icon.mesh.count = icon.live.length
}

function respawn() {
  for (const icon of icons) {
    for (const item of icon.live) physics.removeBody(item)
    icon.live.length = 0
    icon.mesh.count = 0
  }
  pending = CONFIG.count
  spawnTimer = 0
  frame()
}

// Each body's pose into its icon's instance matrices
const matrix = new Mat4()
function sync() {
  for (const icon of icons) {
    const { live, mesh } = icon
    for (let i = 0; i < live.length; i++) {
      const p = live[i].body.translation()
      const { x, y, z, w } = live[i].body.rotation()
      // The rotation from the quaternion, column by column, then the position
      matrix.a11 = 1 - 2 * (y * y + z * z)
      matrix.a12 = 2 * (x * y + w * z)
      matrix.a13 = 2 * (x * z - w * y)
      matrix.a21 = 2 * (x * y - w * z)
      matrix.a22 = 1 - 2 * (x * x + z * z)
      matrix.a23 = 2 * (y * z + w * x)
      matrix.a31 = 2 * (x * z + w * y)
      matrix.a32 = 2 * (y * z - w * x)
      matrix.a33 = 1 - 2 * (x * x + y * y)
      matrix.a41 = p.x
      matrix.a42 = p.y
      matrix.a43 = p.z
      mesh.setMatrixAt(i, matrix)
    }
  }
}

// ── Pointer ───────────────────────────────────────────────────────────────
// A ray from the camera through the cursor, while it's over the page
const raycast = new Raycast()
const pointer = { ndc: [0, 0], active: false }
const ray = { origin: raycast.origin, dir: raycast.direction }

const onPointer = (e) => {
  pointer.ndc[0] = (e.clientX / window.innerWidth) * 2 - 1
  pointer.ndc[1] = 1 - (e.clientY / window.innerHeight) * 2
  pointer.active = true
}

// Click blast: centred where the ray first hits an icon, or, on a miss, at
// the point on the ray closest to the clump's centre
const blastCentre = new Vec3()
const blast = (e) => {
  onPointer(e)
  if (e.button !== 0) return
  const [hit] = raycast.castMouse(camera, pointer.ndc).intersectMeshes(swarm)
  if (hit) blastCentre.resetToVector(hit.point)
  else {
    const { origin: o, direction: d } = raycast
    const t = -(o.x * d.x + o.y * d.y + o.z * d.z)
    blastCentre.reset(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)
  }
  physics.explode(blastCentre, motionScale)
}

const canvas = gl.canvas
canvas.addEventListener('pointermove', onPointer)
canvas.addEventListener('pointerdown', blast)
canvas.addEventListener('pointerleave', () => (pointer.active = false))
canvas.addEventListener('pointercancel', () => (pointer.active = false))
canvas.addEventListener('pointerup', (e) => {
  // A lifted finger stops pushing
  if (e.pointerType !== 'mouse') pointer.active = false
})

// ── Controls ──────────────────────────────────────────────────────────────
// Most settings apply on the next step; count respawns the whole pool once
// the slider is let go
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
pane
  .addBinding(CONFIG, 'count', { min: 5, max: MAX_COUNT, step: 1 })
  .on('change', (ev) => ev.last && respawn())
pane.addButton({ title: 'Respawn' }).on('click', respawn)

const pull = pane.addFolder({ title: 'Pull & push' })
pull.addBinding(CONFIG, 'attraction', { min: 0.5, max: 30 })
pull.addBinding(CONFIG, 'maxPull', { label: 'max pull', min: 1, max: 60 })
pull.addBinding(CONFIG, 'repelRadius', {
  label: 'repel radius',
  min: 0.25,
  max: 6
})
pull.addBinding(CONFIG, 'repelStrength', {
  label: 'repel strength',
  min: 0,
  max: 600
})
pull.addBinding(CONFIG, 'repelSpin', { label: 'repel spin', min: 0, max: 40 })

const blastFolder = pane.addFolder({ title: 'Click blast', expanded: false })
blastFolder.addBinding(CONFIG, 'blastRadius', {
  label: 'radius',
  min: 0.5,
  max: 12
})
blastFolder.addBinding(CONFIG, 'blastStrength', {
  label: 'strength',
  min: 0,
  max: 60
})
blastFolder.addBinding(CONFIG, 'blastSpin', { label: 'spin', min: 0, max: 30 })

const phys = pane.addFolder({ title: 'Physics', expanded: false })
phys
  .addBinding(CONFIG, 'linearDamping', { label: 'drag', min: 0, max: 5 })
  .on('change', physics.setDamping)
phys
  .addBinding(CONFIG, 'angularDamping', { label: 'spin drag', min: 0, max: 5 })
  .on('change', physics.setDamping)
phys
  .addBinding(CONFIG, 'restitution', { label: 'bounce', min: 0, max: 1 })
  .on('change', physics.setSurface)
phys
  .addBinding(CONFIG, 'friction', { min: 0, max: 1.5 })
  .on('change', physics.setSurface)
phys.addBinding(CONFIG, 'spawnSpeed', {
  label: 'spawn speed',
  min: 0,
  max: 30
})
phys.addBinding(CONFIG, 'spawnInterval', {
  label: 'spawn gap',
  min: 0.01,
  max: 1
})

const look = pane.addFolder({ title: 'Look', expanded: false })
look.addBinding(CONFIG.look, 'background')
look.addBinding(CONFIG.look, 'light', { min: 0, max: 2 })
look.addBinding(CONFIG.look, 'gloss', { min: 0, max: 1 })
look.addBinding(CONFIG.look, 'shadow', { min: 0, max: 1 })
look.addBinding(CONFIG.look, 'softness', { min: 0, max: 4 })
look.addBinding(CONFIG.look, 'sky', { min: 0, max: 1 })
look.on('change', applyLook)

window.addEventListener('resize', frame)
applyLook()
respawn()

// ── Loop ──────────────────────────────────────────────────────────────────
// Fixed-step physics with an accumulator, rendering every frame
let last = performance.now()
let acc = 0

const run = (now) => {
  requestAnimationFrame(run)
  const elapsed = Math.min((now - last) / 1000, 0.1)
  last = now

  spawnTimer -= elapsed
  while (pending > 0 && spawnTimer <= 0) {
    spawnOne()
    pending--
    spawnTimer += CONFIG.spawnInterval
  }

  camera.updateMatrixWorld()
  if (pointer.active) raycast.castMouse(camera, pointer.ndc)

  acc += elapsed
  let steps = 0
  while (acc >= CONFIG.dt && steps < CONFIG.maxSubsteps) {
    physics.step(pointer.active ? ray : null, motionScale)
    acc -= CONFIG.dt
    steps++
  }
  // Fell behind: drop the backlog
  if (steps === CONFIG.maxSubsteps) acc = 0

  sync()
  scene.updateMatrixWorld()
  shadow.render({ scene, update: false })
  renderer.render({ scene, camera })
}
requestAnimationFrame(run)
