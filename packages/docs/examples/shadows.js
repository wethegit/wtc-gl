import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Shadow,
  Plane,
  Sphere,
  Torus,
  Box,
  Vec2,
  Vec3
} from 'wtc-gl'

// Three shapes cast onto a ground plane and onto each other. The light
// circles them, and the shadow map follows it.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.reset(0, 4, 7)
  camera.lookAt(new Vec3(0, 0.3, 0))

  const scene = new Obj()
  const lights = new Lights({ intensity: 0.9, ambient: 0.1 })
  // Covers a sphere of radius 3 around the origin
  const shadow = new Shadow(gl, { lights, size: 3, softness: 1.5 })

  const ground = new Mesh(gl, {
    geometry: new Plane(gl, { width: 8, height: 8 }),
    program: new LitProgram(gl, { lights, shadow, colour: [0.86, 0.84, 0.8] })
  })
  ground.rotation.x = -Math.PI / 2
  ground.updateRotation()
  ground.setParent(scene)

  // Everything under casters casts
  const casters = new Obj()
  casters.setParent(scene)
  shadow.add(casters)
  const shapes = [
    [new Sphere(gl, { widthSegments: 32 }), [0.88, 0.46, 0.36], -1.3],
    [
      new Torus(gl, { radius: 0.4, tube: 0.15, tubularSegments: 48 }),
      [0.3, 0.45, 0.85],
      0
    ],
    [
      new Box(gl, { width: 0.7, height: 0.7, depth: 0.7 }),
      [0.5, 0.74, 0.45],
      1.3
    ]
  ].map(([geometry, colour, x]) => {
    const program = new LitProgram(gl, { lights, shadow, colour })
    const mesh = new Mesh(gl, { geometry, program })
    mesh.position.reset(x, 0.8, 0)
    mesh.setParent(casters)
    return mesh
  })

  return {
    frame(time) {
      lights.direction = [Math.cos(time * 0.5), 1.2, Math.sin(time * 0.5)]
      for (const [i, mesh] of shapes.entries()) {
        mesh.position.y = 0.8 + Math.sin(time * 1.5 + i) * 0.25
        mesh.rotation.y = mesh.rotation.x = time * 0.6
        mesh.updateRotation()
      }
      // The shadow map first, then the scene that reads it
      shadow.render({ scene })
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      for (const mesh of [ground, ...shapes]) {
        mesh.geometry.remove()
        mesh.program.remove()
      }
      shadow.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
