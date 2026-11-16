import { Renderer, Camera, Obj, Polyline, Vec2, Vec3 } from 'wtc-gl'

// A tapered, dashed spiral that draws itself on, and a trail that follows a
// moving point. Both are billboards, with their widths in CSS pixels.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  camera.position.reset(0, -5, 8)
  camera.lookAt(new Vec3(0, 0, 0))
  const scene = new Obj()

  // Three turns outwards, rising as they go
  const points = Array.from({ length: 300 }, (_, i) => {
    const t = i / 299
    const a = t * Math.PI * 6
    const r = 0.3 + t * 2.2
    return [Math.cos(a) * r, Math.sin(a) * r, t - 0.5]
  })
  const spiral = new Polyline(gl, {
    points,
    width: 12,
    // Thin at the ends, full in the middle
    taper: (u) => 0.2 + 0.8 * Math.sin(u * Math.PI),
    dashArray: 0.5,
    dashRatio: 0.3,
    colour: [0.29, 0.62, 1]
  })
  spiral.setParent(scene)

  // 40 points, all where the head starts; push() moves the head
  const trail = new Polyline(gl, {
    points: Array.from({ length: 40 }, () => [0, 0, 0.8]),
    width: 16,
    taper: (u) => u * u,
    colour: [0.95, 0.42, 0.26]
  })
  trail.setParent(scene)

  return {
    frame(time) {
      spiral.dashOffset = -time * 0.6
      spiral.visibility = Math.min((time * 0.3) % 1.4, 1)
      spiral.rotation.z = time * 0.2
      spiral.updateRotation()
      trail.push([Math.sin(time * 1.3) * 2.4, Math.sin(time * 2.1) * 1.6, 0.8])
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      for (const line of [spiral, trail]) {
        line.geometry.remove()
        line.program.remove()
      }
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
