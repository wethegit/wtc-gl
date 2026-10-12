import { Renderer, DollyCamera, Obj, Line, Texture, Vec2 } from 'wtc-gl'
import { Pane } from 'tweakpane'

// Thick lines, extruded in screen space: a tapered, dashed spiral that
// draws itself on, a closed star, a zigzag showing the mitre limit, a
// textured wave, and a trail that follows the pointer.
//
// Widths are in pixels unless a line uses `sizeAttenuation`, which measures
// them in world units. Zoom in and out to see the difference: the spiral
// and the wave (world units) grow, the star and zigzag (pixels) don't.

const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.04, 0.04, 0.08, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new DollyCamera(
  { element: gl.canvas, minDistance: 3, maxDistance: 40 },
  { fov: 45, near: 0.1, far: 100 }
)
camera.setPosition(0, 2, 12)

const scene = new Obj()
const TAU = Math.PI * 2

const params = {
  spiralWidth: 0.25,
  spiralWorldUnits: true,
  dashArray: 0.6,
  dashRatio: 0.35,
  drawSpeed: 0.25,
  miterLimit: 4,
  trailWidth: 18,
  trailLength: 40
}

// --- spiral: world-unit width, tapered, dashed, drawn on
const spiralPoints = []
for (let i = 0; i <= 400; i++) {
  const t = i / 400
  const a = t * TAU * 5
  const r = 0.3 + t * 2.7
  spiralPoints.push(Math.cos(a) * r, (t - 0.5) * 3, Math.sin(a) * r)
}
const spiral = new Line(gl, {
  points: spiralPoints,
  width: (t) => 0.2 + (1 - t) * 0.8,
  lineWidth: params.spiralWidth,
  sizeAttenuation: true,
  colour: [0.45, 0.8, 1],
  dashArray: params.dashArray,
  dashRatio: params.dashRatio
})
spiral.setParent(scene)

// --- star: closed, pixel width
const starPoints = []
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * TAU + Math.PI / 2
  const r = i % 2 ? 0.7 : 1.6
  starPoints.push(Math.cos(a) * r, Math.sin(a) * r, 0)
}
const star = new Line(gl, {
  points: starPoints,
  closed: true,
  lineWidth: 6,
  colour: [1, 0.75, 0.3],
  miterLimit: params.miterLimit
})
star.position.reset(-5, 2.5, 0)
star.setParent(scene)

// --- zigzag: sharp corners, cut off at the mitre limit
const zigzagPoints = []
for (let i = 0; i <= 8; i++)
  zigzagPoints.push(i * 0.5 - 2, i % 2 ? 0.9 : -0.9, 0)
const zigzag = new Line(gl, {
  points: zigzagPoints,
  lineWidth: 14,
  colour: [1, 0.4, 0.55],
  miterLimit: params.miterLimit
})
zigzag.position.reset(5, 2.5, 0)
zigzag.setParent(scene)

// --- wave: world units, with a repeating arrow texture
function arrowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#3a2f7a'
  ctx.fillRect(0, 0, 64, 32)
  ctx.fillStyle = '#b9a8ff'
  ctx.beginPath()
  ctx.moveTo(14, 6)
  ctx.lineTo(44, 16)
  ctx.lineTo(14, 26)
  ctx.closePath()
  ctx.fill()
  return new Texture(gl, {
    image: canvas,
    wrapS: gl.REPEAT,
    wrapT: gl.CLAMP_TO_EDGE,
    generateMipmaps: false
  })
}
const wavePoints = []
for (let i = 0; i <= 120; i++) {
  const t = i / 120
  wavePoints.push(t * 12 - 6, Math.sin(t * TAU * 2) * 0.6 - 3.5, 0)
}
const wave = new Line(gl, {
  points: wavePoints,
  lineWidth: 0.4,
  sizeAttenuation: true,
  map: arrowTexture(),
  repeat: [24, 1]
})
wave.setParent(scene)

// --- pointer trail: drawn without a camera, so its points are clip space
const trailScene = new Obj()
let pointer = [0, 0, 0]
const trailPoints = () => new Array(params.trailLength).fill(pointer).flat()
const trail = new Line(gl, {
  points: trailPoints(),
  width: (t) => t, // thin at the tail, full at the head
  lineWidth: params.trailWidth,
  colour: [1, 1, 1],
  opacity: 0.85
})
trail.setParent(trailScene)
window.addEventListener('pointermove', (e) => {
  pointer = [
    (e.clientX / window.innerWidth) * 2 - 1,
    1 - (e.clientY / window.innerHeight) * 2,
    0
  ]
})

// --- controls, collapsed until opened
const pane = new Pane({
  title: 'Controls',
  expanded: false,
  container: document.getElementById('controls')
})
const spiralFolder = pane.addFolder({ title: 'Spiral' })
spiralFolder
  .addBinding(params, 'spiralWorldUnits', { label: 'world units' })
  .on('change', (e) => {
    // switching units keeps it roughly the same size on screen
    spiral.sizeAttenuation = e.value
    params.spiralWidth = e.value ? 0.25 : 24
    pane.refresh()
  })
spiralFolder
  .addBinding(params, 'spiralWidth', { label: 'width', min: 0.02, max: 40 })
  .on('change', (e) => (spiral.lineWidth = e.value))
spiralFolder
  .addBinding(params, 'dashArray', { label: 'dash + gap', min: 0, max: 3 })
  .on('change', (e) => (spiral.dashArray = e.value))
spiralFolder
  .addBinding(params, 'dashRatio', { label: 'gap ratio', min: 0, max: 0.95 })
  .on('change', (e) => (spiral.dashRatio = e.value))
spiralFolder.addBinding(params, 'drawSpeed', {
  label: 'draw speed',
  min: 0,
  max: 1
})
pane
  .addBinding(params, 'miterLimit', { label: 'mitre limit', min: 1, max: 10 })
  .on('change', (e) => {
    star.miterLimit = e.value
    zigzag.miterLimit = e.value
  })
const trailFolder = pane.addFolder({ title: 'Trail' })
trailFolder
  .addBinding(params, 'trailWidth', { label: 'width', min: 1, max: 60 })
  .on('change', (e) => (trail.lineWidth = e.value))
trailFolder
  .addBinding(params, 'trailLength', {
    label: 'length',
    min: 2,
    max: 200,
    step: 1
  })
  .on('change', () => trail.setPoints(trailPoints()))

// --- resize and run
function resize() {
  renderer.dimensions = new Vec2(window.innerWidth, window.innerHeight)
  camera.perspective({ aspect: window.innerWidth / window.innerHeight })
}
window.addEventListener('resize', resize)
resize()

let last = performance.now()
let drawn = 0
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now

  // draw the spiral on, hold it, then start again
  drawn += dt * params.drawSpeed
  if (drawn > 1.5) drawn = 0
  spiral.visibility = Math.min(1, drawn)
  spiral.dashOffset -= dt * 0.5
  star.rotation.z += dt * 0.3
  star.updateRotation()
  zigzag.rotation.y += dt * 0.5
  zigzag.updateRotation()

  trail.push(pointer)

  camera.update()
  renderer.render({ scene, camera })
  renderer.render({ scene: trailScene, clear: false })
}
requestAnimationFrame(frame)
