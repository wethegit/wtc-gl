import {
  Renderer,
  Camera,
  Obj,
  Box,
  InstancedMesh,
  Lights,
  LitProgram,
  Vec2,
  Vec3
} from 'wtc-gl'

const COUNT = 3000

// Three thousand cubes in one draw call, orbiting in a disc, each with its
// own matrix and colour
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

  const box = new Box(gl, { width: 0.16, height: 0.16, depth: 0.16 })
  const program = new LitProgram(gl, { lights: new Lights(), instanced: true })
  const cubes = new InstancedMesh(gl, { geometry: box, program, count: COUNT })
  cubes.setParent(scene)

  const inner = [1, 0.75, 0.4]
  const outer = [0.3, 0.45, 1]
  const orbits = Array.from({ length: COUNT }, (_, i) => {
    const t = Math.random()
    const radius = 1.5 + t * 4
    cubes.setColourAt(
      i,
      inner.map((v, k) => v + (outer[k] - v) * t)
    )
    return {
      radius,
      angle: Math.random() * Math.PI * 2,
      height: (Math.random() - 0.5) * 0.8,
      speed: 0.6 / Math.sqrt(radius),
      spin: Math.random() * 3
    }
  })

  // Each instance's matrix is composed on this, then copied in
  const dummy = new Obj()

  return {
    frame(time) {
      orbits.forEach((o, i) => {
        const angle = o.angle + time * o.speed
        dummy.position.x = Math.cos(angle) * o.radius
        dummy.position.y = o.height + Math.sin(time + o.radius) * 0.2
        dummy.position.z = Math.sin(angle) * o.radius
        dummy.rotation.x = dummy.rotation.y = time * o.spin
        dummy.updateRotation()
        dummy.updateMatrix()
        cubes.setMatrixAt(i, dummy.matrix)
      })
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      const distance = Math.max(10, 17 / (width / height))
      camera.position.reset(0, distance * 0.45, distance)
      camera.lookAt(new Vec3(0, 0, 0))
    },
    dispose() {
      // The instanced mesh's own geometry only reads the box's buffers
      cubes.geometry.remove()
      box.remove()
      program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
