import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Lights,
  LitProgram,
  Shadow,
  Raycast,
  Plane,
  Box,
  Sphere,
  Cylinder,
  Vec2,
  Vec3
} from 'wtc-gl'

// Drag the shapes around the floor; drag the floor to orbit. A Raycast picks
// the shape under the pointer, then follows the pointer across a flat plane.
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
  // Touches drag the shapes rather than scroll the page
  canvas.style.touchAction = 'none'
  container.appendChild(canvas)

  // No wheel zoom, so the page still scrolls over the example
  const camera = new DollyCamera(
    {
      element: canvas,
      enableZoom: false,
      enablePan: false,
      maxPolarAngle: 1.3
    },
    { fov: 35 }
  )
  camera.setPosition(0, 6, 9)
  const scene = new Obj()
  const lights = new Lights({ direction: [0.4, 1, 0.3], ambient: 0.15 })
  const shadow = new Shadow(gl, { lights, size: 5 })

  const floor = new Mesh(gl, {
    geometry: new Plane(gl, { width: 8, height: 8 }),
    program: new LitProgram(gl, { lights, shadow, colour: [0.85, 0.83, 0.8] })
  })
  floor.rotation.x = -Math.PI / 2
  floor.updateRotation()
  floor.setParent(scene)

  const geometries = [
    [new Box(gl, { width: 0.9, height: 0.9, depth: 0.9 }), 0.45],
    [new Sphere(gl, { radius: 0.5, widthSegments: 32 }), 0.5],
    [
      new Cylinder(gl, {
        radiusTop: 0.4,
        radiusBottom: 0.4,
        radialSegments: 32
      }),
      0.5
    ]
  ]
  const colours = [
    [0.95, 0.42, 0.26],
    [0.3, 0.45, 0.85],
    [0.5, 0.74, 0.45]
  ]
  const pieces = Array.from({ length: 6 }, (_, i) => {
    const [geometry, y] = geometries[i % 3]
    const mesh = new Mesh(gl, {
      geometry,
      program: new LitProgram(gl, { lights, shadow, colour: colours[i % 3] })
    })
    mesh.position.reset((i % 3) * 1.6 - 1.6, y, i < 3 ? -0.9 : 0.9)
    mesh.setParent(scene)
    shadow.add(mesh)
    return mesh
  })

  const raycast = new Raycast()
  const up = new Vec3(0, 1, 0)
  const planePoint = new Vec3()
  const offset = new Vec3()
  const hit = new Vec3()
  let dragging = null

  const cast = (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = 1 - ((e.clientY - rect.top) / rect.height) * 2
    return raycast.castMouse(camera, [x, y])
  }
  const onDown = (e) => {
    const [picked] = cast(e).intersectMeshes(pieces)
    if (!picked) return // a miss falls through to the camera
    dragging = picked.mesh
    // Drag across the level plane through the point that was grabbed, and
    // keep the gap to the mesh's centre so it doesn't jump
    planePoint.resetToVector(picked.point)
    offset.resetToVector(dragging.position).subtract(picked.point)
    camera.enabled = false
    canvas.setPointerCapture(e.pointerId)
    dragging.program.emissive = [0.25, 0.25, 0.25]
  }
  const onMove = (e) => {
    if (!dragging) return
    if (!cast(e).intersectPlane(up, planePoint, hit)) return
    const limit = 3.5
    dragging.position.x = Math.max(-limit, Math.min(limit, hit.x + offset.x))
    dragging.position.z = Math.max(-limit, Math.min(limit, hit.z + offset.z))
  }
  const onUp = () => {
    if (!dragging) return
    dragging.program.emissive = [0, 0, 0]
    dragging = null
    camera.enabled = true
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  return {
    frame() {
      camera.update()
      shadow.render({ scene })
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      camera.removeHandlers()
      for (const [geometry] of geometries) geometry.remove()
      for (const mesh of [floor, ...pieces]) mesh.program.remove()
      floor.geometry.remove()
      shadow.remove()
      renderer.dispose()
      canvas.remove()
    }
  }
}
