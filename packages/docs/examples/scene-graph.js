import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Sphere,
  Lights,
  LitProgram,
  Vec2,
  Vec3
} from 'wtc-gl'

// A sun, a planet and a moon. Each child moves with its parent: turning the
// empty `orbit` carries the planet round the sun, and turning the planet
// carries the moon round the planet.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    clearColour: [0, 0, 0, 0]
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  const scene = new Obj()
  const lights = new Lights({ direction: [0, 1, 0.6] })

  // One geometry, shared by all three bodies and scaled to size
  const sphere = new Sphere(gl, { radius: 0.5, widthSegments: 32 })
  const body = (colour, emissive = [0, 0, 0]) =>
    new Mesh(gl, {
      geometry: sphere,
      program: new LitProgram(gl, { lights, colour, emissive })
    })

  const sun = body([1, 0.7, 0.3], [0.5, 0.25, 0])
  sun.scale.reset(1.6, 1.6, 1.6)
  sun.setParent(scene)

  const orbit = new Obj()
  orbit.setParent(scene)

  const planet = body([0.29, 0.62, 1])
  planet.position.x = 3
  planet.setParent(orbit)

  const moon = body([0.85, 0.85, 0.8])
  moon.position.x = 0.9
  moon.scale.reset(0.35, 0.35, 0.35)
  moon.setParent(planet)

  return {
    frame(time) {
      orbit.rotation.y = time * 0.4
      orbit.updateRotation()
      planet.rotation.y = time * 1.5
      planet.updateRotation()
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      const distance = Math.max(10, 17 / camera.aspect)
      camera.position.reset(0, distance * 0.4, distance)
      camera.lookAt(new Vec3(0, 0, 0))
    },
    dispose() {
      // Programs are one per mesh; the geometry is shared, so it goes once
      scene.traverse((node) => {
        if (node instanceof Mesh) node.program.remove()
      })
      sphere.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
