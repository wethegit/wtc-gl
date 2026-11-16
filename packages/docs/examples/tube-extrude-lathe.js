import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Curve,
  Tube,
  Extrude,
  Lathe,
  Vec2
} from 'wtc-gl'

const TAU = Math.PI * 2

// A rippling tube around a trefoil knot, a bevelled star with a hole, and a
// lathed vase
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

  const knot = new Curve({
    closed: true,
    points: Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * TAU
      const x = Math.sin(a) + 2 * Math.sin(2 * a)
      const y = Math.cos(a) - 2 * Math.cos(2 * a)
      return [x * 0.27, y * 0.27 + 0.15, -Math.sin(3 * a) * 0.27]
    })
  })
  // Outlines as lists of [x, y] points
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * TAU + Math.PI / 2
    const r = i % 2 ? 0.38 : 0.85
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
  const hole = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * TAU
    return [Math.cos(a) * 0.18, Math.sin(a) * 0.18]
  })
  // [distance from the axis, height], bottom to top, closed on the axis
  const vase = Array.from({ length: 16 }, (_, i) => {
    const t = i / 15
    return [0.32 + 0.2 * Math.sin(t * 5 + 0.3), t * 1.4 - 0.7]
  })

  const meshes = [
    [
      new Tube(gl, {
        path: knot,
        radius: (u) => 0.11 + 0.04 * Math.sin(u * TAU * 8),
        tubularSegments: 200,
        radialSegments: 12
      }),
      [0.45, 0.6, 0.95]
    ],
    [
      new Extrude(gl, { shape: star, holes: [hole], depth: 0.25, bevel: true }),
      [0.96, 0.78, 0.38]
    ],
    [
      new Lathe(gl, { points: [[0, -0.7], ...vase], segments: 40 }),
      [0.62, 0.8, 0.5]
    ]
  ].map(([geometry, colour], i) => {
    // The vase is open at the top, so light its inside too
    const program = new LitProgram(gl, {
      lights,
      colour,
      specular: 0.4,
      doubleSided: i === 2
    })
    const mesh = new Mesh(gl, { geometry, program })
    mesh.position.x = (i - 1) * 2.3
    mesh.setParent(scene)
    return mesh
  })

  return {
    frame(time) {
      for (const mesh of meshes) {
        mesh.rotation.x = 0.3
        mesh.rotation.y = time * 0.5
        mesh.updateRotation()
      }
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      camera.position.z = Math.max(5, 10 / (width / height))
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
