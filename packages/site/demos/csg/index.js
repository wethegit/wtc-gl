import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  LitProgram,
  Lights,
  Shadow,
  GridHelper,
  WireMesh,
  Box,
  Sphere,
  Cylinder,
  Torus,
  Capsule,
  Extrude,
  toManifold,
  fromManifold,
  Vec2,
  Vec3
} from 'wtc-gl'
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { Pane } from 'tweakpane'

// Constructive solid geometry with manifold-3d. wtc-gl doesn't depend on it:
// the demo loads the WASM module and hands it to toManifold, which turns a
// wtc-gl Geometry into a manifold. The booleans are manifold's own API, and
// fromManifold turns the result back into a Geometry. A cutter orbits through
// the base and the boolean is redone every frame. Each shape carries a
// colour, so the faces the cutter leaves behind take its colour, and its
// normals, which are flipped where a subtraction turns them inside out.

const params = {
  operation: 'subtract',
  base: 'box',
  cutter: 'sphere',
  animate: true,
  wireframe: false
}

// Normals, plus a colour per shape for the faces each one leaves
const properties = { normal: 3, colour: 3 }
const BASE_COLOUR = [0.93, 0.91, 0.87]
const CUTTER_COLOUR = [0.95, 0.42, 0.26]

// ── Renderer and scene ────────────────────────────────────────────────────
const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.93, 0.95, 0.97, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, 0, 0),
    minDistance: 3,
    maxDistance: 12
  },
  { fov: 35, near: 0.1, far: 50 }
)
camera.setPosition(3.2, 2.4, 4.2)

const key = new Vec3(-0.5, 1, 0.6).normalise()
const lights = new Lights({
  direction: [key.x, key.y, key.z],
  intensity: 0.7,
  ambient: 0.1,
  sky: [0.4, 0.42, 0.46],
  ground: [0.22, 0.21, 0.2]
})
// Big enough to reach the end of the shadow on the floor
const shadow = new Shadow(gl, { lights, mapSize: 2048, size: 4, softness: 1.5 })

const scene = new Obj()
const grid = new GridHelper(gl, {
  size: 12,
  divisions: 24,
  colour: [0.8, 0.82, 0.85],
  centreColour: [0.7, 0.72, 0.76]
})
grid.position.y = -1.3
grid.setParent(scene)

// A floor that only catches the shadow
const floor = new Mesh(gl, {
  geometry: new Box(gl, { width: 12, height: 0.02, depth: 12 }),
  program: new LitProgram(gl, {
    lights,
    shadow,
    colour: [0.93, 0.95, 0.97]
  })
})
floor.position.y = -1.32
floor.setParent(scene)

const program = new LitProgram(gl, {
  lights,
  shadow,
  vertexColours: true,
  specular: 0.25,
  shininess: 40
})
// Hidden until manifold has loaded and made its first geometry
const solid = new Mesh(gl, { geometry: new Box(gl), program })
solid.visible = false
solid.setParent(scene)
shadow.add(solid)

// ── Shapes ────────────────────────────────────────────────────────────────
const star = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 0.5 : 1.1
  const a = (i / 10) * Math.PI * 2 + Math.PI / 2
  return [Math.cos(a) * r, Math.sin(a) * r]
})

const BASES = {
  box: () => new Box(gl, { width: 1.6, height: 1.6, depth: 1.6 }),
  cylinder: () =>
    new Cylinder(gl, {
      radiusTop: 0.9,
      radiusBottom: 0.9,
      height: 1.5,
      radialSegments: 64
    }),
  torus: () =>
    new Torus(gl, {
      radius: 0.8,
      tube: 0.38,
      radialSegments: 32,
      tubularSegments: 96
    }),
  star: () =>
    new Extrude(gl, {
      shape: star,
      depth: 0.9,
      bevel: true,
      bevelSize: 0.06,
      bevelThickness: 0.06,
      bevelSegments: 3
    })
}

const CUTTERS = {
  sphere: () =>
    new Sphere(gl, { radius: 0.62, widthSegments: 64, heightSegments: 32 }),
  capsule: () =>
    new Capsule(gl, {
      radius: 0.3,
      height: 2.6,
      capSegments: 8,
      radialSegments: 32
    }),
  torus: () =>
    new Torus(gl, {
      radius: 0.55,
      tube: 0.18,
      radialSegments: 24,
      tubularSegments: 64
    })
}

// ── Manifold ──────────────────────────────────────────────────────────────
const hud = document.getElementById('hud')
let wasm = null
let base = null
let cutter = null
let wire = null
let dirty = true
let stats = ''

// Convert a shape once, when it's picked; the wtc-gl geometry isn't needed
// after that
const convert = (make, colour) => {
  const geometry = make()
  const manifold = toManifold(wasm, geometry, {
    properties,
    fill: { colour }
  })
  geometry.remove()
  return manifold
}

const setBase = () => {
  base?.delete()
  base = convert(BASES[params.base], BASE_COLOUR)
  dirty = true
}
const setCutter = () => {
  cutter?.delete()
  cutter = convert(CUTTERS[params.cutter], CUTTER_COLOUR)
  dirty = true
}

const OPERATIONS = {
  subtract: (a, b) => a.subtract(b),
  intersect: (a, b) => a.intersect(b),
  union: (a, b) => a.add(b)
}

const rebuild = (time) => {
  const start = performance.now()
  // Orbit the cutter through the base, tumbling as it goes
  const a = time * 0.6
  const turned = cutter.rotate([time * 40, time * 25, 0])
  const moved = turned.translate([
    Math.cos(a) * 0.75,
    Math.sin(a * 1.3) * 0.3,
    Math.sin(a) * 0.75
  ])
  const result = OPERATIONS[params.operation](base, moved)
  const geometry = fromManifold(gl, result, { properties })
  const triangles = result.numTri()
  for (const m of [turned, moved, result]) m.delete()

  solid.geometry.remove()
  solid.geometry = geometry
  solid.visible = true
  if (wire) {
    wire.setParent(null)
    wire.geometry.remove()
    wire = null
  }
  if (params.wireframe) {
    wire = new WireMesh(gl, {
      geometry,
      colour: [0.2, 0.2, 0.25],
      opacity: 0.35
    })
    wire.setParent(solid)
  }

  const ms = performance.now() - start
  stats = `${triangles.toLocaleString()} triangles · ${ms.toFixed(1)} ms per boolean`
}

// The WASM is copied into the build through its URL
Module({ locateFile: () => wasmUrl })
  .then((module) => {
    module.setup()
    wasm = module
    setBase()
    setCutter()
  })
  .catch((error) => {
    hud.textContent = `Couldn't load manifold-3d: ${error.message}`
    console.error(error)
  })

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
const keys = (object) =>
  Object.fromEntries(Object.keys(object).map((k) => [k, k]))
pane
  .addBinding(params, 'operation', { options: keys(OPERATIONS) })
  .on('change', () => (dirty = true))
pane
  .addBinding(params, 'base', { options: keys(BASES) })
  .on('change', () => wasm && setBase())
pane
  .addBinding(params, 'cutter', { options: keys(CUTTERS) })
  .on('change', () => wasm && setCutter())
pane.addBinding(params, 'animate')
pane.addBinding(params, 'wireframe').on('change', () => (dirty = true))

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
}
window.addEventListener('resize', resize)
resize()

// ── Loop ──────────────────────────────────────────────────────────────────
let clock = 0
let last = 0
const run = (t) => {
  requestAnimationFrame(run)
  const time = t * 0.001
  const dt = Math.min(time - last, 0.1)
  last = time

  if (wasm && (params.animate || dirty)) {
    if (params.animate) clock += dt
    rebuild(clock)
    dirty = false
    if (hud.textContent !== stats) hud.textContent = stats
  }

  camera.update()
  scene.updateMatrixWorld()
  camera.updateMatrixWorld()
  shadow.render({ scene, update: false })
  renderer.render({ scene, camera })
}
requestAnimationFrame(run)
