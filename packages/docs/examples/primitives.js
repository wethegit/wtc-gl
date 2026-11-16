import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Box,
  Sphere,
  Cylinder,
  Torus,
  Capsule,
  Lathe,
  Plane,
  Vec2
} from 'wtc-gl'

// The lit primitives in two rows, each turning on the spot
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    antialias: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  const scene = new Obj()
  const lights = new Lights()

  // A bowl for the lathe: a quarter circle of [distance from the axis, height]
  const bowl = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * (Math.PI / 2)
    return [Math.sin(a) * 0.55, 0.2 - Math.cos(a) * 0.55]
  })

  const shapes = [
    new Box(gl, { width: 0.8, height: 0.8, depth: 0.8 }),
    new Sphere(gl, { radius: 0.55, widthSegments: 32 }),
    new Cylinder(gl, { radiusTop: 0.4, radiusBottom: 0.4, radialSegments: 32 }),
    new Cylinder(gl, { radiusTop: 0, radiusBottom: 0.5, radialSegments: 32 }),
    new Torus(gl, { radialSegments: 16, tubularSegments: 48 }),
    new Capsule(gl, { capSegments: 8, radialSegments: 24 }),
    new Lathe(gl, { points: bowl, segments: 32 }),
    new Plane(gl, { width: 0.9, height: 0.9 })
  ]

  const meshes = shapes.map((geometry, i) => {
    // A colour round the hue wheel
    const hue = (i / shapes.length) * Math.PI * 2
    const colour = [0, 2, 4].map((k) => 0.62 + 0.3 * Math.cos(hue - k))
    const program = new LitProgram(gl, {
      lights,
      colour,
      specular: 0.3,
      // The bowl and plane are open, so light their backs too
      doubleSided: i >= 6
    })
    const mesh = new Mesh(gl, { geometry, program })
    mesh.position.x = ((i % 4) - 1.5) * 1.6
    mesh.position.y = i < 4 ? 0.8 : -0.8
    mesh.setParent(scene)
    return mesh
  })

  return {
    frame(time) {
      meshes.forEach((mesh, i) => {
        mesh.rotation.x = 0.5
        mesh.rotation.y = time * 0.4 + i
        mesh.updateRotation()
      })
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      camera.position.z = Math.max(6, 10 / (width / height))
    },
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.remove()
        mesh.program.remove()
      }
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
