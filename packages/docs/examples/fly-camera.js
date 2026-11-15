import {
  Stage,
  FlyCamera,
  InstancedMesh,
  Cylinder,
  LitProgram,
  Mat4
} from 'wtc-gl'

// A FlyCamera flying through a field of prisms. The field wraps around the
// camera, so it never runs out: each prism is kept within a box centred on
// the camera, and shrinks away near the box's edge so none of them pop.
// Keys go to the example itself, not the window, so it only flies with the
// keyboard once it's been clicked.
export default function (container) {
  const stage = new Stage({
    container,
    controls: false,
    shadow: false,
    autoplay: false,
    clearColour: [0.93, 0.94, 0.96, 1]
  })
  stage.lights.direction = [0.4, 0.8, 0.3]

  container.tabIndex = 0
  stage.canvas.style.touchAction = 'none'
  const fly = new FlyCamera(
    { element: stage.canvas, keyTarget: container, speed: 3 },
    { fov: 60, far: 40 }
  )
  stage.camera = fly

  // Prisms scattered through a box, each with its own turn and colour
  const SIZE = 36
  const COUNT = 600
  const prisms = new InstancedMesh(stage.gl, {
    geometry: new Cylinder(stage.gl, { radialSegments: 3 }),
    program: new LitProgram(stage.gl, {
      lights: stage.lights,
      instanced: true,
      flatShading: true
    }),
    count: COUNT
  })
  stage.add(prisms, { castShadow: false })

  const colours = [
    [0.1, 0.42, 0.45],
    [0.93, 0.45, 0.33],
    [0.95, 0.72, 0.25]
  ]
  const places = []
  for (let i = 0; i < COUNT; i++) {
    places.push([
      (Math.random() - 0.5) * SIZE,
      (Math.random() - 0.5) * SIZE,
      (Math.random() - 0.5) * SIZE
    ])
    // A random turn, kept as the matrix to scale and place each frame
    const axis = [Math.random(), Math.random(), 1]
    prisms.setMatrixAt(i, Mat4.fromRotation(Math.random() * Math.PI * 2, axis))
    prisms.setColourAt(i, colours[i % 3])
  }
  const turns = prisms.matrices.slice()

  // Wrap each prism into the box around the camera, shrinking near its edge
  const m = new Mat4()
  const wrap = (v, c) =>
    c + ((((v - c + SIZE / 2) % SIZE) + SIZE) % SIZE) - SIZE / 2
  function place() {
    const { x, y, z } = fly.position
    for (let i = 0; i < COUNT; i++) {
      const px = wrap(places[i][0], x)
      const py = wrap(places[i][1], y)
      const pz = wrap(places[i][2], z)
      const d = Math.max(Math.abs(px - x), Math.abs(py - y), Math.abs(pz - z))
      const s = Math.min(1, Math.max(0, (SIZE / 2 - d) / 4))
      const o = i * 16
      m.a11 = turns[o] * s
      m.a12 = turns[o + 1] * s
      m.a13 = turns[o + 2] * s
      m.a21 = turns[o + 4] * s
      m.a22 = turns[o + 5] * s
      m.a23 = turns[o + 6] * s
      m.a31 = turns[o + 8] * s
      m.a32 = turns[o + 9] * s
      m.a33 = turns[o + 10] * s
      m.a41 = px
      m.a42 = py
      m.a43 = pz
      prisms.setMatrixAt(i, m)
    }
  }

  return {
    frame(time, delta) {
      fly.update(delta)
      place()
      stage.render()
    },
    resize() {
      stage.resize()
    },
    dispose() {
      fly.removeHandlers()
      stage.destroy()
    }
  }
}
