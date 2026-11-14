import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Box,
  Sphere,
  toManifold,
  fromManifold,
  Vec2,
  Vec3
} from 'wtc-gl'
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'

// Loaded once, for every copy of the example on the page
let loading = null
const loadManifold = () =>
  (loading ??= Module({ locateFile: () => wasmUrl }).then((wasm) => {
    wasm.setup()
    return wasm
  }))

// Normals, and a colour per shape, so the cut faces take the sphere's
const properties = { normal: 3, colour: 3 }

// A sphere orbits through a box and is subtracted from it every frame
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    antialias: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.reset(2.6, 2, 3.6)
  camera.lookAt(new Vec3(0, 0, 0))
  const scene = new Obj()
  const program = new LitProgram(gl, {
    lights: new Lights(),
    vertexColours: true,
    specular: 0.3
  })
  // A placeholder geometry, hidden until manifold-3d has loaded
  const mesh = new Mesh(gl, { geometry: new Box(gl), program })
  mesh.visible = false
  mesh.setParent(scene)

  let box = null
  let ball = null
  let elapsed = 0
  let disposed = false

  const draw = () => {
    if (!box) return
    const a = elapsed * 0.8
    const p = [Math.cos(a) * 0.7, Math.sin(a * 1.3) * 0.3, Math.sin(a) * 0.7]
    const moved = ball.translate(p)
    const cut = box.subtract(moved)
    mesh.geometry.remove()
    mesh.geometry = fromManifold(gl, cut, { properties })
    mesh.visible = true
    // Manifolds live in WASM memory, so free each one when done
    moved.delete()
    cut.delete()
    renderer.render({ scene, camera })
  }

  loadManifold().then((wasm) => {
    if (disposed) return
    const make = (geometry, colour) => {
      const manifold = toManifold(wasm, geometry, {
        properties,
        fill: { colour }
      })
      geometry.remove()
      return manifold
    }
    box = make(
      new Box(gl, { width: 1.4, height: 1.4, depth: 1.4 }),
      [0.93, 0.91, 0.87]
    )
    ball = make(
      new Sphere(gl, { radius: 0.6, widthSegments: 48 }),
      [0.95, 0.42, 0.26]
    )
    draw()
  })

  return {
    frame(time) {
      elapsed = time
      draw()
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      disposed = true
      box?.delete()
      ball?.delete()
      mesh.geometry.remove()
      program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
