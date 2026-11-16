import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Box,
  Sphere,
  Torus,
  Lights,
  LitProgram,
  Vec2
} from 'wtc-gl'

// Three lit primitives in a row, turning slowly. One Lights is shared by
// every LitProgram, so the light is the same on each.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    // A see-through canvas, so the page shows behind the shapes
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    clearColour: [0, 0, 0, 0]
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.z = 6

  const scene = new Obj()
  const lights = new Lights()

  const shapes = [
    [new Box(gl, { width: 0.9, height: 0.9, depth: 0.9 }), [0.29, 0.62, 1]],
    [new Sphere(gl, { radius: 0.6, widthSegments: 32 }), [0.95, 0.42, 0.26]],
    [
      new Torus(gl, {
        radius: 0.45,
        tube: 0.18,
        radialSegments: 16,
        tubularSegments: 48
      }),
      [0.98, 0.76, 0.3]
    ]
  ]
  const meshes = shapes.map(([geometry, colour], i) => {
    const program = new LitProgram(gl, { lights, colour, specular: 0.4 })
    const mesh = new Mesh(gl, { geometry, program })
    mesh.position.x = (i - 1) * 1.7
    mesh.setParent(scene)
    return mesh
  })

  return {
    frame(time) {
      meshes.forEach((mesh, i) => {
        mesh.rotation.x = time * 0.3 + i
        mesh.rotation.y = time * 0.5
        mesh.updateRotation()
      })
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      // Step back on narrow screens, so all three fit
      camera.position.z = Math.max(6, 11 / camera.aspect)
    },
    dispose() {
      for (const { geometry, program } of meshes) {
        geometry.remove()
        program.remove()
      }
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
