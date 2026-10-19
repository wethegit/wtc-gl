import { Renderer, DollyCamera, Obj, Polyline, Vec2, Vec3, Vec4 } from 'wtc-gl'
import { Pane } from 'tweakpane'

import ribbonFrag from './ribbon.frag'

// Two Polylines: a spiral that draws itself on, and a trail behind the
// pointer.
//
// - As a billboard (the default), the spiral faces the camera however it's
//   turned, with its width in pixels, or in world units with "world width".
// - As a ribbon, it's a flat strip in world space. Its face starts out facing
//   +z, twists by "twist" half turns along it, and leans into its turns by
//   "bank". "lift" raises the spiral into a cone so the banking shows from the
//   side. The ribbon uses its own fragment shader, lit by its face normal.
// - Dashes are measured along the distance travelled, so they keep their
//   length however the line is shaped. "flow" moves them along.
// - The trail pushes the pointer's position onto the end of a line of fixed
//   length every frame, and tapers towards its tail.

const TAU = Math.PI * 2

const params = {
  mode: 'billboard',
  pixels: 10,
  world: 0.18,
  worldWidth: false,
  taper: true,
  dashes: true,
  dashArray: 0.6,
  dashRatio: 0.35,
  flow: 0.4,
  drawOn: true,
  visibility: 1,
  twist: 1,
  bank: 0.6,
  lift: 1.6,
  trail: true
}

// ── Renderer and camera ───────────────────────────────────────────────────
const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.96, 0.95, 0.93, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, 0, 0),
    minDistance: 3,
    maxDistance: 30
  },
  { fov: 35, near: 0.1, far: 100 }
)
camera.setPosition(0, 0, 12)

const scene = new Obj()

// ── The spiral ────────────────────────────────────────────────────────────

// Three turns outwards, rising by lift
const spiralPoints = () =>
  Array.from({ length: 360 }, (_, i) => {
    const t = i / 359
    const a = t * TAU * 3
    const r = 0.5 + t * 2.6
    return [Math.cos(a) * r, Math.sin(a) * r, (t - 0.5) * params.lift]
  })

const ribbon = () => params.mode === 'ribbon'

// Pixels for a billboard, world units for a ribbon or with "world width"
const spiralWidth = () =>
  ribbon() || params.worldWidth ? params.world : params.pixels

// Swelling in the middle
const spiralTaper = () =>
  params.taper ? (u) => 0.25 + 0.75 * Math.sin(u * Math.PI) : null

let spiral = null

const makeSpiral = () => {
  if (spiral) scene.removeChild(spiral)
  spiral = new Polyline(gl, {
    points: spiralPoints(),
    billboard: !ribbon(),
    width: spiralWidth(),
    taper: spiralTaper(),
    sizeAttenuation: params.worldWidth,
    facing: [0, 0, 1],
    tilt: (u) => u * params.twist * Math.PI,
    bank: params.bank,
    colour: [0.13, 0.42, 0.85],
    fragment: ribbon() ? ribbonFrag : undefined
  })
  setDashes()
  scene.addChild(spiral)
}

const setDashes = () => {
  spiral.dashArray = params.dashes ? params.dashArray : 0
  spiral.dashRatio = params.dashRatio
}

// ── The trail ─────────────────────────────────────────────────────────────

let pointer = null
const head = [0, 0, 0]

const trail = new Polyline(gl, {
  points: Array.from({ length: 48 }, () => [0, 0, 0]),
  // In pixels, thinning to nothing at the tail
  width: 18,
  taper: (u) => u * u,
  colour: [0.93, 0.36, 0.25]
})
trail.visible = false
scene.addChild(trail)

// Where the pointer's ray meets the z = 0 plane
const hitGround = (clientX, clientY) => {
  const inverse = camera.projectionViewMatrix.invertNew()
  const x = (clientX / window.innerWidth) * 2 - 1
  const y = 1 - (clientY / window.innerHeight) * 2
  const near = new Vec4(x, y, -1, 1).transformByMat4(inverse)
  const far = new Vec4(x, y, 1, 1).transformByMat4(inverse)
  const n = [near.x / near.w, near.y / near.w, near.z / near.w]
  const f = [far.x / far.w, far.y / far.w, far.z / far.w]
  if (Math.abs(f[2] - n[2]) < 1e-9) return null
  const t = -n[2] / (f[2] - n[2])
  if (t < 0) return null
  return [n[0] + (f[0] - n[0]) * t, n[1] + (f[1] - n[1]) * t, 0]
}

window.addEventListener('pointermove', (e) => {
  if (e.target !== gl.canvas) return
  // Not while dragging, which orbits the camera
  pointer = e.buttons ? null : [e.clientX, e.clientY]
})
window.addEventListener('pointerleave', () => (pointer = null))

const moveTrail = () => {
  if (!params.trail || !pointer) {
    trail.visible = false
    return
  }
  const hit = hitGround(pointer[0], pointer[1])
  // Seen nearly edge on, the plane is hit far away: hold the trail there
  if (!hit || Math.hypot(hit[0], hit[1]) > 8) return
  if (!trail.visible) {
    // Start collapsed on the pointer, rather than streaking from the origin
    trail.setPoints(Array.from({ length: trail.count }, () => hit))
    head[0] = hit[0]
    head[1] = hit[1]
    trail.visible = true
  }
  // Ease the head towards the pointer, so the trail curves smoothly
  head[0] += (hit[0] - head[0]) * 0.5
  head[1] += (hit[1] - head[1]) * 0.5
  trail.push(head)
}

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  container: document.getElementById('controls'),
  title: 'Lines'
})

pane
  .addBinding(params, 'mode', {
    options: { billboard: 'billboard', ribbon: 'ribbon' }
  })
  .on('change', () => {
    makeSpiral()
    showBindings()
  })

const widthFolder = pane.addFolder({ title: 'Width' })
const worldWidthBinding = widthFolder
  .addBinding(params, 'worldWidth', { label: 'world width' })
  .on('change', () => {
    makeSpiral()
    showBindings()
  })
const pixelsBinding = widthFolder
  .addBinding(params, 'pixels', { min: 1, max: 40, step: 1 })
  .on('change', () => (spiral.width = spiralWidth()))
const worldBinding = widthFolder
  .addBinding(params, 'world', { min: 0.02, max: 0.6 })
  .on('change', () => (spiral.width = spiralWidth()))
widthFolder
  .addBinding(params, 'taper')
  .on('change', () => (spiral.taper = spiralTaper()))

const dashFolder = pane.addFolder({ title: 'Dashes' })
dashFolder.addBinding(params, 'dashes').on('change', setDashes)
dashFolder
  .addBinding(params, 'dashArray', { label: 'length', min: 0.05, max: 2 })
  .on('change', setDashes)
dashFolder
  .addBinding(params, 'dashRatio', { label: 'gap', min: 0, max: 0.95 })
  .on('change', setDashes)
dashFolder.addBinding(params, 'flow', { min: -2, max: 2 })

const drawFolder = pane.addFolder({ title: 'Draw on' })
drawFolder.addBinding(params, 'drawOn', { label: 'animate' })
drawFolder.addBinding(params, 'visibility', { min: 0, max: 1 })

const ribbonFolder = pane.addFolder({ title: 'Ribbon' })
ribbonFolder
  .addBinding(params, 'twist', { label: 'twist (½ turns)', min: -4, max: 4 })
  .on('change', () => (spiral.tilt = (u) => u * params.twist * Math.PI))
ribbonFolder
  .addBinding(params, 'bank', { min: 0, max: 3 })
  .on('change', () => (spiral.bank = params.bank))
pane
  .addBinding(params, 'lift', { min: 0, max: 4 })
  .on('change', () => spiral.setPoints(spiralPoints()))
pane.addBinding(params, 'trail')

const showBindings = () => {
  const world = ribbon() || params.worldWidth
  ribbonFolder.hidden = !ribbon()
  worldWidthBinding.hidden = ribbon()
  pixelsBinding.hidden = world
  worldBinding.hidden = !world
}

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
}
window.addEventListener('resize', resize)
resize()

makeSpiral()
showBindings()

// ── Loop ──────────────────────────────────────────────────────────────────
let last = performance.now()
const run = (now) => {
  requestAnimationFrame(run)
  const dt = Math.min((now - last) / 1000, 0.1)
  last = now

  if (params.drawOn) {
    // Draw on over 4 seconds, hold for 1, then start again
    const t = (now / 1000) % 5
    params.visibility = Math.min(t / 4, 1)
    pane.refresh()
  }
  spiral.visibility = params.visibility
  spiral.dashOffset -= params.flow * dt

  moveTrail()
  camera.update()
  renderer.render({ scene, camera })
}
requestAnimationFrame(run)
