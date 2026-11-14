import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Curve,
  Polyline,
  Sphere,
  Lights,
  LitProgram,
  Vec2
} from 'wtc-gl'

// A Catmull-Rom curve through six moving points, drawn as a Polyline, with a
// marker travelling along it at an even speed
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

  const points = Array.from({ length: 6 }, () => [0, 0, 0])
  const place = (time) =>
    points.forEach((p, i) => {
      p[0] = (i / 5 - 0.5) * 6
      p[1] = Math.sin(time * 1.3 + i * 1.7) * 1.1
      p[2] = Math.cos(time * 0.9 + i * 2.3) * 0.8
    })
  place(0)

  const curve = new Curve({ points })
  const line = new Polyline(gl, {
    points: curve,
    width: 5,
    colour: [0.29, 0.62, 1]
  })
  line.setParent(scene)

  const lights = new Lights()
  const dot = new Sphere(gl, { radius: 0.1, widthSegments: 16 })
  const grey = new LitProgram(gl, { lights, colour: [0.6, 0.62, 0.66] })
  const orange = new LitProgram(gl, { lights, colour: [0.95, 0.42, 0.26] })
  const handles = points.map(() => {
    const mesh = new Mesh(gl, { geometry: dot, program: grey })
    mesh.setParent(scene)
    return mesh
  })
  const marker = new Mesh(gl, { geometry: dot, program: orange })
  marker.scale.reset(1.8, 1.8, 1.8)
  marker.setParent(scene)

  return {
    frame(time) {
      place(time)
      curve.setPoints(points)
      line.setPoints(curve)
      handles.forEach((mesh, i) => mesh.position.reset(...points[i]))
      // u is the fraction of the way along, by distance
      curve.getPointAt((time * 0.15) % 1, marker.position)
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      camera.position.z = Math.max(7, 11 / (width / height))
    },
    dispose() {
      line.geometry.remove()
      line.program.remove()
      for (const resource of [dot, grey, orange]) resource.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
