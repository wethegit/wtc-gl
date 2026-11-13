import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Texture,
  Box,
  Sphere,
  Plane,
  Cylinder,
  Torus,
  Capsule,
  GeometryAttribute,
  Vec2,
  Vec3
} from 'wtc-gl'
import { Pane } from 'tweakpane'

// LitProgram on a row of shapes, one per option, all sharing one Lights. The
// light is in world space, so the shading stays put as you orbit while the
// highlights move with the camera. The small sun shows where the light is
// coming from; it has its own Lights, set to flat ambient so it isn't shaded.

const SPACING = 1.7
const LABEL_DROP = 0.95
const SUN_DISTANCE = 3.2

const lightParams = {
  azimuth: -40,
  elevation: 45,
  colour: { r: 1, g: 0.97, b: 0.92 },
  intensity: 0.75,
  sky: { r: 0.3, g: 0.32, b: 0.36 },
  ground: { r: 0.12, g: 0.1, b: 0.08 },
  ambient: 0.05,
  spin: true
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
    target: new Vec3(0, 0.4, 0),
    minDistance: 3,
    maxDistance: 20
  },
  { fov: 35, near: 0.1, far: 100 }
)
camera.setPosition(0, 3.2, 9.5)

// ── Lights ────────────────────────────────────────────────────────────────
const lights = new Lights()

const toRGB = ({ r, g, b }) => [r, g, b]
const sunDirection = () => {
  const a = (lightParams.azimuth * Math.PI) / 180
  const e = (lightParams.elevation * Math.PI) / 180
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]
}

// ── Textures and attributes ───────────────────────────────────────────────
// A checker with a warm and a cool square, for the map
const checker = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  const cells = 8
  const size = canvas.width / cells
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#f2ede4' : '#d9644a'
      ctx.fillRect(x * size, y * size, size, size)
    }
  }
  return new Texture(gl, { image: canvas })
}

// A colour per vertex, blended from bottom to top
const addHeightColours = (geometry) => {
  const position = geometry.attributes.position
  const colours = new Float32Array(position.count * 3)
  const bottom = [0.2, 0.45, 0.95]
  const top = [0.98, 0.45, 0.6]
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(Math.max(position.data[i * 3 + 1] + 0.5, 0), 1)
    for (let c = 0; c < 3; c++) {
      colours[i * 3 + c] = bottom[c] + (top[c] - bottom[c]) * t
    }
  }
  geometry.addAttribute(
    'colour',
    new GeometryAttribute({ size: 3, data: colours })
  )
  return geometry
}

// ── Shapes ────────────────────────────────────────────────────────────────
const SHAPES = [
  {
    name: 'Lambert',
    geometry: () => new Sphere(gl, { radius: 0.5, widthSegments: 48 }),
    material: { colour: [0.88, 0.46, 0.36] }
  },
  {
    name: 'Specular',
    geometry: () =>
      new Torus(gl, {
        radius: 0.4,
        tube: 0.17,
        radialSegments: 24,
        tubularSegments: 64
      }),
    material: { colour: [0.3, 0.45, 0.85], specular: 0.8, shininess: 48 },
    tilt: 0.5
  },
  {
    name: 'Map',
    geometry: () => new Box(gl, { width: 0.8, height: 0.8, depth: 0.8 }),
    material: { colour: [1, 1, 1], map: checker() }
  },
  {
    name: 'Flat shading',
    geometry: () => new Sphere(gl, { radius: 0.5, widthSegments: 10 }),
    material: { colour: [0.5, 0.74, 0.45], flatShading: true }
  },
  {
    name: 'Vertex colours',
    geometry: () =>
      addHeightColours(
        new Capsule(gl, {
          radius: 0.3,
          height: 1,
          capSegments: 8,
          radialSegments: 24
        })
      ),
    material: { colour: [1, 1, 1], vertexColours: true, specular: 0.3 }
  },
  {
    name: 'Double sided',
    geometry: () =>
      new Cylinder(gl, {
        radiusTop: 0.45,
        radiusBottom: 0.3,
        height: 0.9,
        radialSegments: 32,
        openEnded: true
      }),
    material: { colour: [0.92, 0.74, 0.32], doubleSided: true },
    tilt: 0.6
  }
]

const scene = new Obj()
const labels = document.getElementById('labels')

SHAPES.forEach((shape, i) => {
  shape.centre = [(i - (SHAPES.length - 1) / 2) * SPACING, 0.55, 0]
  shape.program = new LitProgram(gl, { lights, ...shape.material })
  shape.mesh = new Mesh(gl, {
    geometry: shape.geometry(),
    program: shape.program
  })
  shape.mesh.position.reset(...shape.centre)
  shape.mesh.rotation.x = shape.tilt ?? 0
  shape.mesh.updateRotation()
  shape.mesh.setParent(scene)

  shape.label = document.createElement('div')
  shape.label.className = 'label'
  shape.label.textContent = shape.name
  labels.appendChild(shape.label)
})

// The ground the shapes stand over
const ground = new Mesh(gl, {
  geometry: new Plane(gl, { width: SPACING * SHAPES.length + 1, height: 4 }),
  program: new LitProgram(gl, { lights, colour: [0.86, 0.84, 0.8] })
})
ground.rotation.x = -Math.PI / 2
ground.updateRotation()
ground.setParent(scene)

// The sun: lit only by its own flat ambient light, so it reads as a source
const sun = new Mesh(gl, {
  geometry: new Sphere(gl, { radius: 0.12, widthSegments: 16 }),
  program: new LitProgram(gl, {
    lights: new Lights({
      intensity: 0,
      sky: [0, 0, 0],
      ground: [0, 0, 0],
      ambient: 1
    }),
    colour: [1, 0.82, 0.35]
  })
})
sun.setParent(scene)

const updateLights = () => {
  const direction = sunDirection()
  lights.direction = direction
  lights.colour = toRGB(lightParams.colour)
  lights.intensity = lightParams.intensity
  lights.sky = toRGB(lightParams.sky)
  lights.ground = toRGB(lightParams.ground)
  lights.ambient = lightParams.ambient
  sun.position.reset(
    direction[0] * SUN_DISTANCE,
    direction[1] * SUN_DISTANCE,
    direction[2] * SUN_DISTANCE
  )
}
updateLights()

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
const colour = { color: { type: 'float' } }

const lightFolder = pane.addFolder({ title: 'Lights' })
lightFolder.addBinding(lightParams, 'azimuth', { min: -180, max: 180 })
lightFolder.addBinding(lightParams, 'elevation', { min: -10, max: 90 })
lightFolder.addBinding(lightParams, 'colour', colour)
lightFolder.addBinding(lightParams, 'intensity', { min: 0, max: 2 })
lightFolder.addBinding(lightParams, 'sky', colour)
lightFolder.addBinding(lightParams, 'ground', colour)
lightFolder.addBinding(lightParams, 'ambient', { min: 0, max: 1 })
lightFolder.on('change', updateLights)
pane.addBinding(lightParams, 'spin')

for (const shape of SHAPES) {
  const folder = pane.addFolder({ title: shape.name, expanded: false })
  const [r, g, b] = shape.program.colour
  const material = {
    colour: { r, g, b },
    specular: shape.program.specular,
    shininess: shape.program.shininess
  }
  folder
    .addBinding(material, 'colour', colour)
    .on('change', () => (shape.program.colour = toRGB(material.colour)))
  folder
    .addBinding(material, 'specular', { min: 0, max: 2 })
    .on('change', () => (shape.program.specular = material.specular))
  folder
    .addBinding(material, 'shininess', { min: 1, max: 128 })
    .on('change', () => (shape.program.shininess = material.shininess))
}

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
}
window.addEventListener('resize', resize)
resize()

// ── Loop ──────────────────────────────────────────────────────────────────
const labelPoint = new Vec3()
let last = 0
const run = (t) => {
  requestAnimationFrame(run)
  const time = t * 0.001
  const dt = Math.min(time - last, 0.1)
  last = time

  if (lightParams.spin) {
    for (const { mesh } of SHAPES) {
      mesh.rotation.y += dt * 0.4
      mesh.updateRotation()
    }
  }

  camera.update()
  renderer.render({ scene, camera })

  // Put each label just under its shape
  for (const shape of SHAPES) {
    const [x, y, z] = shape.centre
    camera.project(labelPoint.reset(x, y - LABEL_DROP, z))
    const sx = (labelPoint.x * 0.5 + 0.5) * window.innerWidth
    const sy = (0.5 - labelPoint.y * 0.5) * window.innerHeight
    shape.label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, 0)`
  }
}
requestAnimationFrame(run)
