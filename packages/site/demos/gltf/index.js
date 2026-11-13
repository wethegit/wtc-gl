import {
  Renderer,
  DollyCamera,
  Obj,
  InstancedMesh,
  GLTFLoader,
  Lights,
  GridHelper,
  Raycast,
  Vec2,
  Vec3
} from 'wtc-gl'
import { Pane } from 'tweakpane'

// A small floating island made in Blender and exported as a .glb, loaded
// with GLTFLoader. Its materials become LitPrograms sharing one Lights:
// vertex-coloured rocks, a textured double-sided sign and an emissive
// lantern. The ring of trees is one mesh with two materials, exported with
// EXT_mesh_gpu_instancing, so it loads as two InstancedMeshes. The file's
// camera can be looked through, and hovering names the node under the
// pointer with a Raycast.

const params = {
  azimuth: -35,
  elevation: 50,
  intensity: 0.8,
  ambient: 0.08,
  spin: true,
  glTFCamera: false
}

// ── Renderer and cameras ──────────────────────────────────────────────────
const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.93, 0.95, 0.97, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const orbit = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, -0.4, 0),
    minDistance: 4,
    maxDistance: 25
  },
  { fov: 35, near: 0.1, far: 100 }
)
orbit.setPosition(6, 4, 7)

const lights = new Lights({
  sky: [0.32, 0.36, 0.42],
  ground: [0.14, 0.11, 0.09]
})
const setLights = () => {
  const a = (params.azimuth * Math.PI) / 180
  const e = (params.elevation * Math.PI) / 180
  lights.direction = [
    Math.cos(e) * Math.sin(a),
    Math.sin(e),
    Math.cos(e) * Math.cos(a)
  ]
  lights.intensity = params.intensity
  lights.ambient = params.ambient
}
setLights()

const scene = new Obj()
// A faint floor far below, for a sense of height
const grid = new GridHelper(gl, {
  size: 24,
  divisions: 24,
  colour: [0.8, 0.82, 0.85],
  centreColour: [0.7, 0.72, 0.76]
})
grid.position.y = -4
grid.setParent(scene)

// ── The model ─────────────────────────────────────────────────────────────
const hud = document.getElementById('hud')
let gltf = null
let island = null
let fileCamera = null

// Through import.meta.url, so Vite copies the file into the site build
const url = new URL('./island.glb', import.meta.url).href
GLTFLoader.load(gl, url, { lights })
  .then((loaded) => {
    gltf = loaded
    island = gltf.scene
    island.setParent(scene)
    fileCamera = gltf.cameras[0] ?? null
    resize()
    const instanced = gltf.meshes.filter((m) => m instanceof InstancedMesh)
    const instances = instanced.reduce((n, m) => n + m.count, 0)
    hud.dataset.stats = [
      `${gltf.nodes.length} nodes · ${gltf.meshes.length} meshes`,
      `${instanced.length} instanced meshes · ${instances} instances`,
      `${gltf.programs.length} programs · ${gltf.textures.length} textures`
    ].join('\n')
    hud.textContent = hud.dataset.stats
  })
  .catch((error) => {
    hud.textContent = `Couldn't load island.glb: ${error.message}`
    console.error(error)
  })

// ── Hover ─────────────────────────────────────────────────────────────────
const raycast = new Raycast()
let pointer = null
gl.canvas.addEventListener('pointermove', (e) => {
  pointer = [
    (e.clientX / window.innerWidth) * 2 - 1,
    1 - (e.clientY / window.innerHeight) * 2
  ]
})
gl.canvas.addEventListener('pointerleave', () => (pointer = null))

// The nearest named node, for meshes split into primitives ("Trees.0")
const nameOf = (node) => {
  for (let n = node; n; n = n.parent) {
    if (n.name && !/\.\d+$/.test(n.name)) return n.name
  }
  return node.name || 'unnamed'
}

const hover = (camera) => {
  if (!island || !hud.dataset.stats) return
  let line = ''
  if (pointer) {
    const [hit] = raycast.castMouse(camera, pointer).intersectMeshes(island)
    if (hit) {
      line = `\nHover ${nameOf(hit.mesh)}`
      if (hit.instanceId !== undefined) line += ` · instance ${hit.instanceId}`
    }
  }
  const text = hud.dataset.stats + line
  if (hud.textContent !== text) hud.textContent = text
}

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
const lightFolder = pane.addFolder({ title: 'Light' })
lightFolder.addBinding(params, 'azimuth', { min: -180, max: 180 })
lightFolder.addBinding(params, 'elevation', { min: 0, max: 90 })
lightFolder.addBinding(params, 'intensity', { min: 0, max: 2 })
lightFolder.addBinding(params, 'ambient', { min: 0, max: 1 })
lightFolder.on('change', setLights)
pane.addBinding(params, 'spin')
pane.addBinding(params, 'glTFCamera', { label: 'file camera' })

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  orbit.perspective({ aspect: width / height })
  fileCamera?.perspective({ aspect: width / height })
}
window.addEventListener('resize', resize)
resize()

// ── Loop ──────────────────────────────────────────────────────────────────
let last = 0
const run = (t) => {
  requestAnimationFrame(run)
  const time = t * 0.001
  const dt = Math.min(time - last, 0.1)
  last = time

  if (island && params.spin) {
    island.rotation.y += dt * 0.15
    island.updateRotation()
  }

  orbit.update()
  const camera = params.glTFCamera && fileCamera ? fileCamera : orbit
  orbit.enabled = camera === orbit
  scene.updateMatrixWorld()
  camera.updateMatrixWorld()
  hover(camera)
  renderer.render({ scene, camera })
}
requestAnimationFrame(run)
