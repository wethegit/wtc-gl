import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Raycast,
  Sphere,
  Torus,
  Box,
  Vec2
} from 'wtc-gl'

// Hover a shape to light it up. A Raycast from the pointer finds the
// nearest triangle under it, and a dot marks where it hit.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35, near: 0.1, far: 50 })
  camera.position.reset(0, 0, 8)
  const scene = new Obj()
  const lights = new Lights({ intensity: 0.8, ambient: 0.08 })

  const geometries = [
    new Sphere(gl, { widthSegments: 32 }),
    new Torus(gl, { radius: 0.4, tube: 0.15, tubularSegments: 48 }),
    new Box(gl, { width: 0.8, height: 0.8, depth: 0.8 })
  ]
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const mesh = new Mesh(gl, {
      geometry: geometries[i % 3],
      program: new LitProgram(gl, { lights, colour: [0.3, 0.45, 0.85] })
    })
    mesh.position.reset(((i % 3) - 1) * 1.5, i < 3 ? 0.8 : -0.8, 0)
    mesh.rotation.reset(0.6, i * 0.7, 0)
    mesh.updateRotation()
    mesh.setParent(scene)
    return mesh
  })
  const dot = new Mesh(gl, {
    geometry: new Sphere(gl, { radius: 0.05 }),
    program: new LitProgram(gl, { lights, colour: [0.95, 0.42, 0.26] })
  })
  dot.visible = false
  dot.setParent(scene)

  const highlight = (hit) => {
    for (const mesh of shapes) {
      mesh.program.emissive = mesh === hit?.mesh ? [0.3, 0.3, 0.3] : [0, 0, 0]
    }
    dot.visible = !!hit
    if (hit) dot.position.resetToVector(hit.point)
  }

  const raycast = new Raycast()
  const onMove = (e) => {
    // The pointer in normalised device coordinates, y up
    const rect = gl.canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((e.clientY - rect.top) / rect.height) * 2
    const [hit] = raycast.castMouse(camera, [x, y]).intersectMeshes(shapes)
    highlight(hit)
  }
  const onLeave = () => highlight(null)
  gl.canvas.addEventListener('pointermove', onMove)
  gl.canvas.addEventListener('pointerleave', onLeave)

  return {
    frame() {
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      gl.canvas.removeEventListener('pointermove', onMove)
      gl.canvas.removeEventListener('pointerleave', onLeave)
      for (const geometry of geometries) geometry.remove()
      for (const mesh of [...shapes, dot]) mesh.program.remove()
      dot.geometry.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
