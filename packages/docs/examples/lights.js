import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Sphere,
  Torus,
  Box,
  Vec2,
  Vec3
} from 'wtc-gl'

// Four LitPrograms sharing one Lights. The light circles overhead, and
// moving it changes every program at once.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  const scene = new Obj()
  const lights = new Lights({ intensity: 0.8, ambient: 0.08 })

  const shapes = [
    // Plain Lambert
    [new Sphere(gl, { widthSegments: 48 }), { colour: [0.88, 0.46, 0.36] }],
    // A Blinn-Phong highlight
    [
      new Torus(gl, {
        radius: 0.4,
        tube: 0.16,
        radialSegments: 24,
        tubularSegments: 64
      }),
      { colour: [0.3, 0.45, 0.85], specular: 0.8, shininess: 48 }
    ],
    // Shaded by its faces
    [
      new Sphere(gl, { widthSegments: 10 }),
      { colour: [0.5, 0.74, 0.45], flatShading: true }
    ],
    // Glowing a little, whatever the light
    [
      new Box(gl, { width: 0.75, height: 0.75, depth: 0.75 }),
      { colour: [0.92, 0.74, 0.32], emissive: [0.2, 0.08, 0] }
    ]
  ].map(([geometry, options], i) => {
    const mesh = new Mesh(gl, {
      geometry,
      program: new LitProgram(gl, { lights, ...options })
    })
    mesh.position.x = (i - 1.5) * 1.4
    mesh.setParent(scene)
    return mesh
  })

  return {
    frame(time) {
      lights.direction = [Math.cos(time * 0.8), 0.8, Math.sin(time * 0.8)]
      for (const mesh of shapes) {
        mesh.rotation.x = 0.5
        mesh.rotation.y = time * 0.4
        mesh.updateRotation()
      }
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      const aspect = width / height
      camera.perspective({ aspect })
      // Back far enough for the row to fit across
      camera.position.reset(0, 1, Math.max(6.5, 3.3 / (0.315 * aspect)))
      camera.lookAt(new Vec3(0, 0, 0))
    },
    dispose() {
      for (const mesh of shapes) {
        mesh.geometry.remove()
        mesh.program.remove()
      }
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
