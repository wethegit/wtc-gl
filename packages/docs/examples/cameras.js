import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Box,
  Torus,
  GridHelper,
  Lights,
  LitProgram,
  Vec2,
  Vec3
} from 'wtc-gl'

// Drag to orbit, right-drag to pan. DollyCamera eases towards where the
// input puts it, so it's updated every frame.
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

  const camera = new DollyCamera(
    {
      element: gl.canvas,
      target: new Vec3(0, 0.9, 0),
      autoRotate: true,
      // The wheel would zoom rather than scroll the page
      enableZoom: false
    },
    { fov: 35 }
  )
  camera.setPosition(3.5, 2.5, 5)

  const scene = new Obj()
  const lights = new Lights()

  const grid = new GridHelper(gl, { size: 6, divisions: 12 })
  grid.setParent(scene)

  const box = new Mesh(gl, {
    geometry: new Box(gl, { width: 0.8, height: 0.8, depth: 0.8 }),
    program: new LitProgram(gl, { lights, colour: [0.29, 0.62, 1] })
  })
  box.position.y = 0.4
  box.setParent(scene)

  const ring = new Mesh(gl, {
    geometry: new Torus(gl, {
      radius: 0.7,
      tube: 0.12,
      radialSegments: 16,
      tubularSegments: 64
    }),
    program: new LitProgram(gl, {
      lights,
      colour: [0.95, 0.42, 0.26],
      specular: 0.5
    })
  })
  ring.position.y = 1.75
  ring.setParent(scene)

  return {
    frame(time) {
      ring.rotation.x = time * 0.6
      ring.updateRotation()
      camera.update()
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      camera.removeHandlers()
      for (const { geometry, program } of [grid, box, ring]) {
        geometry.remove()
        program.remove()
      }
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
