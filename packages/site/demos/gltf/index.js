import { Stage, InstancedMesh, GridHelper, Raycast, Vec3 } from 'wtc-gl'
import { Pane } from 'tweakpane'

// A small floating island made in Blender and exported as a .glb, loaded
// into a Stage: the recipe that sets up the renderer, an orbiting camera,
// shared Lights, a Shadow and the render loop. stage.load() turns the file's
// materials into LitPrograms that share the stage's lights and receive its
// shadow (vertex-coloured rocks, a textured double-sided sign and an
// emissive lantern), adds the island casting the shadow, and frames the
// camera and shadow on it. The ring of trees is one mesh with two materials,
// exported with EXT_mesh_gpu_instancing, so it loads as two InstancedMeshes.
// The file's camera can be looked through, and hovering names the node under
// the pointer with a Raycast.

const params = {
  azimuth: -35,
  elevation: 50,
  intensity: 0.8,
  ambient: 0.08,
  shadows: true,
  softness: 1,
  spin: true,
  glTFCamera: false
}

const hud = document.getElementById('hud')
let gltf = null
let island = null
let fileCamera = null

// ── Stage ─────────────────────────────────────────────────────────────────
const stage = new Stage({
  clearColour: [0.93, 0.95, 0.97, 1],
  // Full-screen, so the wheel can zoom rather than scroll the page
  controlOptions: {
    target: new Vec3(0, -0.4, 0),
    minDistance: 4,
    maxDistance: 25,
    enableZoom: true
  },
  cameraPosition: [6, 4, 7],
  lights: { sky: [0.32, 0.36, 0.42], ground: [0.14, 0.11, 0.09] },
  onBeforeRender: (time, delta) => {
    if (island && params.spin) {
      island.rotation.y += delta * 0.15
      island.updateRotation()
    }
    hover()
  }
})
const { lights } = stage

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

// A faint floor far below, for a sense of height. It doesn't cast.
const grid = new GridHelper(stage.gl, {
  size: 24,
  divisions: 24,
  colour: [0.8, 0.82, 0.85],
  centreColour: [0.7, 0.72, 0.76]
})
grid.position.y = -4
stage.add(grid, { castShadow: false })

// ── The model ─────────────────────────────────────────────────────────────
// Through import.meta.url, so Vite copies the file into the site build
const url = new URL('./island.glb', import.meta.url).href
stage
  .load(url)
  .then((loaded) => {
    gltf = loaded
    island = gltf.scene
    fileCamera = gltf.cameras[0] ?? null
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
stage.canvas.addEventListener('pointermove', (e) => {
  pointer = [
    (e.clientX / window.innerWidth) * 2 - 1,
    1 - (e.clientY / window.innerHeight) * 2
  ]
})
stage.canvas.addEventListener('pointerleave', () => (pointer = null))

// The nearest named node, for meshes split into primitives ("Trees.0")
const nameOf = (node) => {
  for (let n = node; n; n = n.parent) {
    if (n.name && !/\.\d+$/.test(n.name)) return n.name
  }
  return node.name || 'unnamed'
}

function hover() {
  if (!island || !hud.dataset.stats) return
  let line = ''
  if (pointer) {
    stage.camera.updateMatrixWorld()
    const [hit] = raycast
      .castMouse(stage.camera, pointer)
      .intersectMeshes(island)
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
const shadowFolder = pane.addFolder({ title: 'Shadow' })
shadowFolder.addBinding(params, 'shadows').on('change', ({ value }) => {
  for (const program of gltf?.programs ?? []) {
    program.shadow = value ? stage.shadow : null
  }
})
shadowFolder
  .addBinding(params, 'softness', { min: 0, max: 4 })
  .on('change', ({ value }) => (stage.shadow.softness = value))
pane.addBinding(params, 'spin')
pane
  .addBinding(params, 'glTFCamera', { label: 'file camera' })
  // Setting the camera fits it to the canvas, and turns the orbit controls
  // off until they're the camera again
  .on('change', ({ value }) => {
    stage.camera = value && fileCamera ? fileCamera : stage.controls
  })
