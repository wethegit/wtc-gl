import {
  Renderer,
  Camera,
  Box,
  InstancedMesh,
  Lights,
  LitProgram,
  Raycast,
  Mat4,
  Vec2,
  Vec3
} from 'wtc-gl'

const SIDE = 64
const COUNT = SIDE * SIDE
const GAP = 0.2

// 4096 columns on a grid. Their heights ripple out from the pointer, found by
// casting onto the ground plane, and their colours follow their heights.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    clearColour: [0, 0, 0, 0]
  })
  const { gl } = renderer
  const canvas = gl.canvas
  container.appendChild(canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.reset(0, 8, 11)
  camera.lookAt(new Vec3(0, -0.5, 0))

  // One unit tall, so scaling y sets the height
  const box = new Box(gl, { width: 0.16, height: 1, depth: 0.16 })
  const program = new LitProgram(gl, { lights: new Lights(), instanced: true })
  // Every column is in view, so skip testing each one against the camera
  const field = new InstancedMesh(gl, {
    geometry: box,
    program,
    count: COUNT,
    frustumCulled: false
  })

  // Each column's place on the ground, worked out once
  const half = ((SIDE - 1) * GAP) / 2
  const xs = new Float32Array(COUNT)
  const zs = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    xs[i] = (i % SIDE) * GAP - half
    zs[i] = Math.floor(i / SIDE) * GAP - half
  }

  const raycast = new Raycast()
  const up = new Vec3(0, 1, 0)
  const ground = new Vec3(0, 0, 0)
  const target = new Vec3(0, 0, 0)
  const centre = new Vec3(0, 0, 0)
  let strength = 0
  let inside = false

  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((e.clientY - rect.top) / rect.height) * 2
    inside = !!raycast
      .castMouse(camera, [x, y])
      .intersectPlane(up, ground, target)
  }
  const onLeave = () => (inside = false)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  // Reused every frame: no allocations in the loop
  const matrix = new Mat4()
  const colour = [0, 0, 0]

  return {
    frame(time, delta) {
      const ease = 1 - Math.exp(-delta * 6)
      centre.x += (target.x - centre.x) * ease
      centre.z += (target.z - centre.z) * ease
      strength += ((inside ? 1 : 0) - strength) * ease

      for (let i = 0; i < COUNT; i++) {
        const x = xs[i]
        const z = zs[i]
        const d = Math.hypot(x - centre.x, z - centre.z)
        const wave = 0.15 + 0.1 * Math.sin(x * 0.8 + z * 0.6 + time)
        const ripple =
          strength *
          Math.exp(-d * 0.5) *
          (0.6 + 0.6 * Math.cos(d * 3 - time * 5))
        const h = wave + ripple
        // a22 scales y; a41, a42 and a43 are the position. Lifting by half
        // the height stands the column on the ground.
        matrix.a22 = h
        matrix.a41 = x
        matrix.a42 = h / 2
        matrix.a43 = z
        field.setMatrixAt(i, matrix)
        const t = Math.min(h / 1.2, 1)
        colour[0] = 0.29 + 0.66 * t
        colour[1] = 0.62 - 0.2 * t
        colour[2] = 1 - 0.74 * t
        field.setColourAt(i, colour)
      }
      renderer.render({ scene: field, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      field.geometry.remove()
      box.remove()
      program.remove()
      renderer.dispose()
      canvas.remove()
    }
  }
}
