import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Box,
  Sphere,
  GridHelper,
  Lights,
  LitProgram,
  Vec2,
  Vec3
} from 'wtc-gl'

// A DollyCamera with limits. It stays between 4 and 12 units from the
// target, and between straight down and just above the floor, so it can't
// go underneath. Zoom only turns on once the example is clicked, and off
// again when the pointer leaves, so scrolling past doesn't zoom it.
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
      target: new Vec3(0, 0.5, 0),
      minDistance: 4,
      maxDistance: 12,
      // From 10° off straight down to 5° above the floor, in radians
      minPolarAngle: Math.PI / 18,
      maxPolarAngle: Math.PI / 2 - Math.PI / 36,
      enablePan: false,
      enableZoom: false
    },
    { fov: 35 }
  )
  camera.setPosition(5, 3, 6)

  // Zoom with the wheel only after a click, until the pointer leaves
  const zoomOn = () => (camera.enableZoom = true)
  const zoomOff = () => (camera.enableZoom = false)
  gl.canvas.addEventListener('pointerdown', zoomOn)
  gl.canvas.addEventListener('pointerleave', zoomOff)

  // A readout of the distance and tilt, to watch the limits hold
  const readout = document.createElement('div')
  Object.assign(readout.style, {
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgb(0 0 0 / 0.5)',
    color: '#fff',
    font: '12px/1.5 ui-monospace, monospace',
    pointerEvents: 'none'
  })
  container.appendChild(readout)

  const scene = new Obj()
  const lights = new Lights()
  const grid = new GridHelper(gl, { size: 10, divisions: 20 })
  grid.setParent(scene)

  // A sphere on the target, ringed by blocks of different heights
  const meshes = [grid]
  const add = (geometry, colour, x, y, z) => {
    const mesh = new Mesh(gl, {
      geometry,
      program: new LitProgram(gl, { lights, colour, specular: 0.3 })
    })
    mesh.position.reset(x, y, z)
    mesh.setParent(scene)
    meshes.push(mesh)
  }
  add(new Sphere(gl, { radius: 0.5 }), [0.95, 0.42, 0.26], 0, 0.5, 0)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const height = 0.4 + (i % 3) * 0.5
    add(
      new Box(gl, { width: 0.5, height, depth: 0.5 }),
      [0.29, 0.62, 1],
      Math.cos(angle) * 2.2,
      height / 2,
      Math.sin(angle) * 2.2
    )
  }

  let text = ''
  return {
    frame() {
      camera.update()
      renderer.render({ scene, camera })
      // The polar angle is measured down from straight above the target
      const distance = camera.spherical.radius.toFixed(1)
      const tilt = Math.round(90 - (camera.spherical.phi * 180) / Math.PI)
      const next = `distance ${distance} · ${tilt}° above the floor${
        camera.enableZoom ? '' : ' · click to zoom'
      }`
      if (next !== text) readout.textContent = text = next
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      camera.removeHandlers()
      gl.canvas.removeEventListener('pointerdown', zoomOn)
      gl.canvas.removeEventListener('pointerleave', zoomOff)
      for (const { geometry, program } of meshes) {
        geometry.remove()
        program.remove()
      }
      renderer.dispose()
      gl.canvas.remove()
      readout.remove()
    }
  }
}
