import { Renderer, Polyline, Obj, Vec2 } from 'wtc-gl'

const COUNT = 40

// A tapered line follows the pointer, with a faint, wider glow under it.
// Drawn without a camera, so the points are in clip space, the same -1 to 1
// as the pointer's normalised position. With no pointer, it wanders.
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

  const collapsed = (p) => Array.from({ length: COUNT }, () => p)
  const scene = new Obj()
  const trail = new Polyline(gl, {
    points: collapsed([0, 0]),
    width: 14,
    taper: (u) => u * u,
    colour: [0.95, 0.42, 0.26]
  })
  const glow = new Polyline(gl, {
    points: collapsed([0, 0]),
    width: 40,
    taper: (u) => u,
    colour: [0.95, 0.6, 0.3],
    opacity: 0.2,
    // Overlaps blend rather than hide each other
    depthWrite: false
  })
  glow.setParent(scene)
  trail.setParent(scene)
  const lines = [trail, glow]
  // Start again from a point, rather than streaking across from the last one
  const reset = (p) => lines.forEach((line) => line.setPoints(collapsed(p)))

  let pointer = null // in clip space while the pointer is over the canvas
  let last = [0, 0]
  let away = Infinity // frames since the pointer left

  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect()
    const p = [
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((e.clientY - rect.top) / rect.height) * 2
    ]
    if (!pointer) reset(p)
    pointer = p
  }
  const onLeave = () => {
    pointer = null
    away = 0
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  return {
    frame(time) {
      let head
      if (pointer) head = pointer
      else if (away < COUNT) {
        // Stay put, so the line shrinks into where the pointer left
        head = last
        away++
      } else {
        head = [Math.sin(time * 0.9) * 0.6, Math.sin(time * 1.7) * 0.5]
        if (away++ === COUNT) reset(head)
      }
      last = head
      for (const line of lines) line.push(head)
      renderer.render({ scene })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      for (const line of lines) {
        line.geometry.remove()
        line.program.remove()
      }
      renderer.dispose()
      canvas.remove()
    }
  }
}
