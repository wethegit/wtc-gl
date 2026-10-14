import {
  Renderer,
  Camera,
  DollyCamera,
  Obj,
  Mesh,
  Program,
  Uniform,
  Box,
  Geometry,
  GeometryAttribute,
  Vec2,
  Vec3
} from 'wtc-gl'

import vertex from './scene.vert'
import fragment from './scene.frag'
import flatVertex from './flat.vert'
import flatFragment from './flat.frag'

// Thousands of separate meshes, each moved and rotated every frame. Each
// mesh has its own matrices and uniforms, so this is the case where per-frame
// allocations used to add up. The HUD shows how long the CPU side of each
// frame takes (updating the scene graph, culling, sorting and issuing draws).
//
// The canvas is split in two. The first pane is the camera you control. The
// second watches from above: it shows that camera and its frustum, and only
// the meshes the first pane didn't frustum-cull.

const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.03, 0.03, 0.07, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const FOV = 50
const NEAR = 0.1
const FAR = 160

// Mouse and touch input comes from the first pane only
const panes = [
  document.getElementById('pane-main'),
  document.getElementById('pane-overview')
]
const controls = panes[0]
const camera = new DollyCamera(
  {
    element: controls,
    autoRotate: true,
    autoRotateSpeed: 0.3,
    minDistance: 10,
    maxDistance: 75
  },
  { fov: FOV, near: NEAR, far: FAR }
)
camera.setPosition(0, 30, 55)

const overviewCamera = new Camera({ fov: 62, near: 1, far: 600 })
overviewCamera.position.x = 0
overviewCamera.position.y = 190
overviewCamera.position.z = 90
overviewCamera.lookAt(new Vec3(0, 0, 0))

// One geometry and program, shared by every mesh
const geometry = new Box(gl, { width: 0.6, height: 0.6, depth: 0.6 })
const program = new Program(gl, { vertex, fragment })

const scene = new Obj()
let cubes = []

// A spiral galaxy: a few arms, denser towards the centre
const build = (count) => {
  cubes.forEach(({ mesh }) => scene.removeChild(mesh))
  cubes = []
  const arms = 4
  for (let i = 0; i < count; i++) {
    const t = Math.random()
    const radius = 2 + Math.pow(t, 0.7) * 40
    const arm = (i % arms) / arms
    const spread = (Math.random() - 0.5) * (0.6 + radius * 0.02)
    const mesh = new Mesh(gl, { geometry, program })
    mesh.setParent(scene)
    const size = 0.5 + Math.random() * 1.2
    mesh.scale.x = mesh.scale.y = mesh.scale.z = size
    cubes.push({
      mesh,
      radius,
      angle: arm * Math.PI * 2 + radius * 0.18 + spread,
      height: (Math.random() - 0.5) * (6 - radius * 0.1),
      // Inner orbits are faster
      speed: 0.6 / Math.sqrt(radius),
      spin: (Math.random() - 0.5) * 3
    })
  }
}

// ── The camera marker, seen in the overview ──────────────────────────────
const flatProgram = (colour) =>
  new Program(gl, {
    vertex: flatVertex,
    fragment: flatFragment,
    uniforms: {
      u_colour: new Uniform({
        name: 'colour',
        value: colour,
        kind: 'float_vec3'
      })
    },
    cullFace: null
  })

// Follows the camera: its matrix is copied from the camera's world matrix
const marker = new Obj()
marker.matrixAutoUpdate = false

const body = new Mesh(gl, {
  geometry: new Box(gl, { width: 3, height: 2.2, depth: 4 }),
  program: flatProgram([0.95, 0.95, 1])
})
body.setParent(marker)
// The lens points down -z, the way the camera looks
const lens = new Mesh(gl, {
  geometry: new Box(gl, { width: 1.6, height: 1.6, depth: 1.6 }),
  program: flatProgram([1, 0.8, 0.3])
})
lens.position.z = -2.8
lens.setParent(marker)

// The frustum as 12 lines, in camera space. Corner positions are set in
// resize(), as they depend on the aspect ratio.
const frustumPositions = new GeometryAttribute({
  size: 3,
  data: new Float32Array(8 * 3)
})
const frustum = new Mesh(gl, {
  geometry: new Geometry(gl, {
    position: frustumPositions,
    index: new GeometryAttribute({
      // near rect, far rect, then the four edges joining them
      data: new Uint16Array([
        0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7
      ])
    })
  }),
  program: flatProgram([1, 0.8, 0.3]),
  mode: gl.LINES,
  // Its bounds change with the aspect ratio
  frustumCulled: false
})
frustum.setParent(marker)

const setFrustum = (aspect) => {
  const data = frustumPositions.data
  const tan = Math.tan((FOV * Math.PI) / 360)
  let i = 0
  for (const depth of [NEAR, FAR]) {
    const h = tan * depth
    const w = h * aspect
    for (const [x, y] of [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h]
    ]) {
      data[i++] = x
      data[i++] = y
      data[i++] = -depth
    }
  }
  frustumPositions.needsUpdate = true
}

// The overview draws the galaxy and the marker
const overview = new Obj()
overview.addChild(scene)
overview.addChild(marker)

// ── Layout: side by side, or stacked on a portrait screen ────────────────
// Viewports in device pixels, GL style (y from the bottom)
const viewports = [
  [new Vec2(), new Vec2()],
  [new Vec2(), new Vec2()]
]

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  const dpr = renderer.dpr

  const sideBySide = width >= height
  const paneWidth = sideBySide ? width / 2 : width
  const paneHeight = sideBySide ? height : height / 2
  const aspect = paneWidth / paneHeight

  // CSS rects, top-left origin
  const rects = sideBySide
    ? [
        [0, 0],
        [paneWidth, 0]
      ]
    : [
        [0, 0],
        [0, paneHeight]
      ]
  rects.forEach(([x, y], i) => {
    Object.assign(panes[i].style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${paneWidth}px`,
      height: `${paneHeight}px`
    })
    // Keep the label clear of the nav bar
    panes[i].classList.toggle('pane--top', y === 0)
    const [size, position] = viewports[i]
    size.x = Math.round(paneWidth * dpr)
    size.y = Math.round(paneHeight * dpr)
    position.x = Math.round(x * dpr)
    position.y = Math.round((height - y - paneHeight) * dpr)
  })

  panes[1].classList.toggle('pane--stacked', !sideBySide)

  camera.perspective({ aspect })
  overviewCamera.perspective({ aspect })
  setFrustum(aspect)
}
window.addEventListener('resize', resize)
resize()

const select = document.getElementById('count')
select.addEventListener('change', () => build(Number(select.value)))
build(Number(select.value))

// ── HUD ──────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud')
let cpuTotal = 0
let frameTotal = 0
let frames = 0
let lastHud = 0
let lastFrame = 0
let inView = 0

const updateHud = (now) => {
  const cpu = cpuTotal / frames
  const frame = frameTotal / frames
  const lines = [
    `${cubes.length.toLocaleString()} meshes`,
    `In view ${inView.toLocaleString()} (${(cubes.length - inView).toLocaleString()} culled)`,
    `CPU   ${cpu.toFixed(2)} ms/frame`,
    `Frame ${frame.toFixed(1)} ms (${Math.round(1000 / frame)} fps)`
  ]
  hud.textContent = lines.join('\n')
  cpuTotal = frameTotal = frames = 0
  lastHud = now
}

// ── Loop ─────────────────────────────────────────────────────────────────
const renderPane = (i, root, view) => {
  const [size, position] = viewports[i]
  gl.scissor(position.x, position.y, size.x, size.y)
  renderer.render({ scene: root, camera: view, viewport: viewports[i] })
}

const run = (now) => {
  requestAnimationFrame(run)
  const start = performance.now()
  const time = now * 0.001

  camera.update()

  for (let i = 0; i < cubes.length; i++) {
    const cube = cubes[i]
    const { mesh } = cube
    // The overview hid culled meshes last frame
    mesh.visible = true
    const angle = cube.angle + time * cube.speed
    // Set components directly; Vec3.reset takes rest arguments, which allocate
    mesh.position.x = Math.cos(angle) * cube.radius
    mesh.position.y = cube.height + Math.sin(time + cube.radius) * 0.4
    mesh.position.z = Math.sin(angle) * cube.radius
    mesh.rotation.x = time * cube.spin
    mesh.rotation.y = time * cube.spin * 0.7
    mesh.updateRotation()
  }

  // Each pane clears and draws only inside its own rectangle
  gl.enable(gl.SCISSOR_TEST)

  // 1. The camera you control. The renderer frustum-culls as it draws.
  renderPane(0, scene, camera)

  // Repeat the renderer's culling test to find what it drew, and hide the
  // rest for the overview
  inView = 0
  for (let i = 0; i < cubes.length; i++) {
    const { mesh } = cubes[i]
    mesh.visible = camera.frustumIntersects(mesh)
    if (mesh.visible) inView++
  }

  // 2. The overview, with the marker on the camera
  marker.matrix.resetToMat4(camera.worldMatrix)
  marker.worldMatrixNeedsUpdate = true
  renderPane(1, overview, overviewCamera)

  gl.disable(gl.SCISSOR_TEST)

  cpuTotal += performance.now() - start
  if (lastFrame) frameTotal += now - lastFrame
  lastFrame = now
  frames++
  if (now - lastHud > 500 && frames > 1) updateHud(now)
}
requestAnimationFrame(run)
