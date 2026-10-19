import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Program,
  Uniform,
  Box,
  Sphere,
  Curve,
  Tube,
  Extrude,
  GeometryAttribute,
  mergeGeometries,
  Mat4,
  Vec2,
  Vec3,
  Vec4
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import tubeVert from './tube.vert'
import tubeFrag from './tube.frag'
import markerVert from './marker.vert'
import markerFrag from './marker.frag'

// A tube swept along a curve through points you can drag: a Catmull-Rom
// through them, or a smoother B-spline pulled towards them.
//
// - The markers show where the curve is sampled. "even" spaces them by
//   distance along the curve, which is what Path does; "parametric" steps t
//   evenly through each span instead, and bunches up where the span is uneven.
// - The axes are the frames from computeFrames, which the tube's rings follow:
//   tangent (red), normal (green) and binormal (blue). They turn only as much
//   as the curve does, and on a closed curve the last one matches the first.
// - alpha is the Catmull-Rom's knot spacing: 0 uniform, 0.5 centripetal, 1
//   chordal. The "hairpin" preset shows uniform looping where centripetal
//   doesn't. tension tightens it towards straight lines, or loosens it.
// - The "extrude" preset is two closed curves in the z = 0 plane, an outline
//   and a hole, extruded into a bevelled solid. Its handles stay on z = 0.
//   With tension 1 the outline is straight lines, and the crease angle gives
//   it hard corners.
// - The B-spline's curvature doesn't jump at the points, so the tube's
//   shading doesn't crease there, but it only passes near them.

const TAU = Math.PI * 2

const trefoil = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * TAU
  return [
    (Math.sin(a) + 2 * Math.sin(2 * a)) * 0.9,
    (Math.cos(a) - 2 * Math.cos(2 * a)) * 0.9,
    -Math.sin(3 * a) * 0.9
  ]
})

const PRESETS = {
  wave: {
    closed: false,
    radius: 0.16,
    points: [
      [-3, 0, 0],
      [-1.8, 1, 0.6],
      [-0.6, -0.4, -0.6],
      [0.6, 0.9, 0.4],
      [1.8, -0.6, -0.4],
      [3, 0.3, 0]
    ]
  },
  trefoil: { closed: true, radius: 0.16, points: trefoil },
  // Long spans either side of a short one: uniform (alpha 0) loops past the
  // short span, and centripetal doesn't
  hairpin: {
    closed: false,
    radius: 0.04,
    points: [
      [-3, -2.5, 0],
      [1.2, 0, 0],
      [1.5, 0, 0],
      [-3, 2.5, 0]
    ]
  },
  // A ten-point star for the outline, then a hole in the middle
  extrude: {
    closed: true,
    radius: 0.16,
    points: Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * TAU + Math.PI / 2
      const r = i % 2 ? 1.3 : 2.4
      return [Math.cos(a) * r, Math.sin(a) * r, 0]
    }),
    hole: Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * TAU
      return [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0]
    })
  }
}

const params = {
  preset: 'wave',
  type: 'catmullrom',
  closed: false,
  alpha: 0.5,
  tension: 0,
  radius: 0.16,
  taper: 0,
  twist: 0,
  opacity: 0.45,
  tubularSegments: 160,
  radialSegments: 16,
  samples: 'even',
  count: 40,
  frames: false,
  depth: 0.6,
  bevel: true,
  bevelSize: 0.12,
  bevelThickness: 0.12,
  bevelSegments: 3,
  creaseAngle: 30,
  uvs: 'projected',
  checker: false,
  curveDivisions: 12,
  length: 0
}

// The handles' points. In the extrude preset, the outline's points come
// first, and the hole's from holeStart.
let points = []
let holeStart = 0
const extruding = () => holeStart < points.length

// ── Renderer and camera ───────────────────────────────────────────────────
const renderer = new Renderer({
  dpr: Math.min(window.devicePixelRatio, 2),
  clearColour: [0.96, 0.95, 0.93, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new DollyCamera(
  {
    element: gl.canvas,
    target: new Vec3(0, 0, 0),
    minDistance: 3,
    maxDistance: 30
  },
  { fov: 35, near: 0.1, far: 100 }
)
camera.setPosition(0, 2.5, 11)

// ── Helpers ───────────────────────────────────────────────────────────────

// A vertex attribute with the same value on every vertex
const constant = (geometry, name, value) => {
  const count = geometry.attributes.position.count
  const data = new Float32Array(count * value.length)
  for (let i = 0; i < count; i++) data.set(value, i * value.length)
  geometry.addAttribute(
    name,
    new GeometryAttribute({ size: value.length, data })
  )
}

// A matrix whose x, y and z axes are a, b and c, moved to p
const basis = (a, b, c, p) =>
  new Mat4(
    a.x,
    a.y,
    a.z,
    0,
    b.x,
    b.y,
    b.z,
    0,
    c.x,
    c.y,
    c.z,
    0,
    p.x,
    p.y,
    p.z,
    1
  )

const marker = (p, radius, colour) => {
  const sphere = new Sphere(gl, { radius, widthSegments: 10 })
  sphere.applyMatrix(Mat4.fromTranslatingVec3(p))
  constant(sphere, 'color', colour)
  return sphere
}

// A thin box from the origin along +x, turned to point along a and moved to p
const arrow = (p, a, b, c, size, colour) => {
  const box = new Box(gl, { width: size, height: 0.025, depth: 0.025 })
  box.applyMatrix(Mat4.fromTranslatingVec3(new Vec3(size / 2, 0, 0)))
  box.applyMatrix(basis(a, b, c, p))
  constant(box, 'color', colour)
  return box
}

const merge = (parts) => {
  if (!parts.length) return null
  const merged = mergeGeometries(parts)
  for (const part of parts) part.remove()
  return merged
}

// ── Scene ─────────────────────────────────────────────────────────────────
const scene = new Obj()
const handleScene = new Obj()

const u_opacity = new Uniform({ name: 'opacity', value: 1, kind: 'float' })
const u_colour = new Uniform({
  name: 'colour',
  value: [0.42, 0.62, 0.9],
  kind: 'float_vec3'
})
const tubeProgram = new Program(gl, {
  vertex: tubeVert,
  fragment: tubeFrag,
  uniforms: {
    u_colour,
    u_opacity,
    u_stripes: new Uniform({ name: 'stripes', value: 1, kind: 'float' }),
    u_checker: new Uniform({ name: 'checker', value: 0, kind: 'float' })
  },
  transparent: true,
  depthWrite: false
})
// The extruded solid: the same shading, opaque and without stripes, with an
// optional uv checker
const u_checker = new Uniform({ name: 'checker', value: 0, kind: 'float' })
const solidProgram = new Program(gl, {
  vertex: tubeVert,
  fragment: tubeFrag,
  uniforms: {
    u_colour,
    u_opacity: new Uniform({ name: 'opacity', value: 1, kind: 'float' }),
    u_stripes: new Uniform({ name: 'stripes', value: 0, kind: 'float' }),
    u_checker
  }
})
const markerProgram = new Program(gl, {
  vertex: markerVert,
  fragment: markerFrag
})
// Handles draw over everything, so they can always be grabbed
const handleProgram = new Program(gl, {
  vertex: markerVert,
  fragment: markerFrag,
  depthTest: false
})

let curve = null
let tubeMesh = null
let solidMesh = null
let overlayMesh = null
const handles = []
const handleGeometry = {
  idle: marker(new Vec3(), 0.11, [1, 1, 1]),
  hot: marker(new Vec3(), 0.14, [0.98, 0.72, 0.3])
}

// Swaps a mesh's geometry for a new one, or hides it when there's none
const setMesh = (mesh, geometry, program, parent) => {
  if (mesh) {
    mesh.visible = !!geometry
    if (geometry) {
      mesh.geometry.remove()
      mesh.geometry = geometry
    }
    return mesh
  }
  if (!geometry) return null
  const created = new Mesh(gl, { geometry, program, frustumCulled: false })
  created.setParent(parent)
  return created
}

// The parametric samples: t stepped evenly through each span, with the
// samples shared out between the spans
const parametric = (count) => {
  const out = []
  const spans = curve.segments
  const per = Math.max(1, Math.round(count / spans.length))
  spans.forEach((segment, i) => {
    for (let k = i ? 1 : 0; k <= per; k++) {
      out.push(segment.getPoint(k / per, new Vec3()))
    }
  })
  return out
}

const makeCurve = (from, closed) =>
  new Curve({
    points: from,
    type: params.type,
    closed,
    alpha: params.alpha,
    tension: params.tension
  })

const rebuild = () => {
  if (extruding()) {
    rebuildExtrude()
    return
  }
  solidMesh = setMesh(solidMesh, null)
  if (tubeMesh) tubeMesh.visible = true

  curve = makeCurve(points, params.closed)
  curve.tiltFunction = params.twist
    ? (tilt, u) => tilt + u * params.twist * TAU
    : null
  params.length = curve.getLength()

  const { radius, taper } = params
  const tube = new Tube(gl, {
    path: curve,
    radius: taper ? (u) => radius * (1 - taper * u) : radius,
    tubularSegments: params.tubularSegments,
    radialSegments: params.radialSegments
  })
  tubeMesh = setMesh(tubeMesh, tube, tubeProgram, scene)

  const parts = []
  if (params.samples !== 'off') {
    const samples =
      params.samples === 'even'
        ? curve.getPoints(params.count)
        : parametric(params.count)
    for (const p of samples) parts.push(marker(p, 0.045, [0.2, 0.22, 0.3]))
  }
  if (params.frames) {
    const { tangents, normals, binormals } = curve.computeFrames(params.count)
    const centres = curve.getPoints(params.count)
    centres.forEach((p, i) => {
      const [t, n, b] = [tangents[i], normals[i], binormals[i]]
      parts.push(arrow(p, t, n, b, 0.3, [0.9, 0.3, 0.3]))
      parts.push(arrow(p, n, b, t, 0.3, [0.3, 0.75, 0.4]))
      parts.push(arrow(p, b, t, n, 0.3, [0.3, 0.45, 0.95]))
    })
  }
  overlayMesh = setMesh(overlayMesh, merge(parts), markerProgram, scene)
}

// The outline and hole as closed curves, extruded. The tube and markers hide.
const rebuildExtrude = () => {
  curve = makeCurve(points.slice(0, holeStart), true)
  const hole = makeCurve(points.slice(holeStart), true)
  params.length = curve.getLength()

  const solid = new Extrude(gl, {
    shape: curve,
    holes: [hole],
    depth: params.depth,
    curveDivisions: params.curveDivisions,
    bevel: params.bevel,
    bevelSize: params.bevelSize,
    bevelThickness: params.bevelThickness,
    bevelSegments: params.bevelSegments,
    creaseAngle: (params.creaseAngle * Math.PI) / 180,
    uvs: params.uvs
  })
  solidMesh = setMesh(solidMesh, solid, solidProgram, scene)
  solidMesh.visible = true
  if (tubeMesh) tubeMesh.visible = false
  overlayMesh = setMesh(overlayMesh, null)
}

const placeHandles = () => {
  while (handles.length < points.length) {
    const mesh = new Mesh(gl, {
      geometry: handleGeometry.idle,
      program: handleProgram,
      frustumCulled: false
    })
    mesh.setParent(handleScene)
    handles.push(mesh)
  }
  handles.forEach((mesh, i) => {
    mesh.visible = i < points.length
    if (mesh.visible) mesh.position.reset(...points[i])
  })
}

const loadPreset = () => {
  const preset = PRESETS[params.preset]
  points = preset.points.map((p) => [...p])
  holeStart = points.length
  if (preset.hole) points.push(...preset.hole.map((p) => [...p]))
  params.closed = preset.closed
  params.radius = preset.radius
  setHot(-1)
  placeHandles()
  showFolders()
  rebuild()
}

// ── Dragging ──────────────────────────────────────────────────────────────
// No raycasting yet, so handles are picked by their projected position and
// dragged in the plane facing the camera. When extruding they're dragged on
// the z = 0 plane instead, so the outline stays flat.
const projected = new Vec4()
const toScreen = ([x, y, z]) => {
  projected.reset(x, y, z, 1)
  projected.transformByMat4(camera.projectionViewMatrix)
  return [
    ((projected.x / projected.w) * 0.5 + 0.5) * window.innerWidth,
    (0.5 - (projected.y / projected.w) * 0.5) * window.innerHeight
  ]
}

const nearestHandle = (x, y) => {
  let best = -1
  let bestDistance = 18
  points.forEach((p, i) => {
    const [sx, sy] = toScreen(p)
    const d = Math.hypot(sx - x, sy - y)
    if (d < bestDistance) {
      best = i
      bestDistance = d
    }
  })
  return best
}

let hot = -1
let dragging = -1
let last = [0, 0]
let dirty = false
// When extruding: where the pointer hit z = 0, less the handle's position
let grabOffset = [0, 0]

// Where the ray under the pointer meets the z = 0 plane, or null if it doesn't
const hitGround = (clientX, clientY) => {
  const inverse = camera.projectionViewMatrix.invertNew()
  const x = (clientX / window.innerWidth) * 2 - 1
  const y = 1 - (clientY / window.innerHeight) * 2
  const near = new Vec4(x, y, -1, 1).transformByMat4(inverse)
  const far = new Vec4(x, y, 1, 1).transformByMat4(inverse)
  const n = [near.x / near.w, near.y / near.w, near.z / near.w]
  const f = [far.x / far.w, far.y / far.w, far.z / far.w]
  if (Math.abs(f[2] - n[2]) < 1e-9) return null
  const t = -n[2] / (f[2] - n[2])
  if (t < 0) return null
  return [n[0] + (f[0] - n[0]) * t, n[1] + (f[1] - n[1]) * t]
}

const setHot = (i) => {
  if (hot === i) return
  if (hot >= 0) handles[hot].geometry = handleGeometry.idle
  hot = i
  if (hot >= 0) handles[hot].geometry = handleGeometry.hot
  gl.canvas.style.cursor = hot >= 0 ? 'grab' : ''
}

// In the capture phase, so a grab turns the camera off before it sees the
// press
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.target !== gl.canvas) return
    const i = nearestHandle(e.clientX, e.clientY)
    if (i < 0) return
    dragging = i
    last = [e.clientX, e.clientY]
    const hit = extruding() && hitGround(e.clientX, e.clientY)
    if (hit) grabOffset = [hit[0] - points[i][0], hit[1] - points[i][1]]
    camera.enabled = false
    setHot(i)
    gl.canvas.style.cursor = 'grabbing'
  },
  { capture: true }
)

window.addEventListener('pointermove', (e) => {
  if (dragging < 0) {
    if (e.target === gl.canvas) setHot(nearestHandle(e.clientX, e.clientY))
    return
  }

  const p = points[dragging]
  if (extruding()) {
    const hit = hitGround(e.clientX, e.clientY)
    if (hit) {
      p[0] = hit[0] - grabOffset[0]
      p[1] = hit[1] - grabOffset[1]
      handles[dragging].position.reset(...p)
      dirty = true
    }
    return
  }

  // World units per pixel at the handle's depth
  const m = camera.worldMatrix
  const eye = camera.worldPosition
  const depth = -(
    (p[0] - eye.x) * m.a31 +
    (p[1] - eye.y) * m.a32 +
    (p[2] - eye.z) * m.a33
  )
  const scale =
    (2 * depth * Math.tan((camera.fov * Math.PI) / 360)) / window.innerHeight

  const dx = (e.clientX - last[0]) * scale
  const dy = (e.clientY - last[1]) * scale
  last = [e.clientX, e.clientY]
  p[0] += m.a11 * dx - m.a21 * dy
  p[1] += m.a12 * dx - m.a22 * dy
  p[2] += m.a13 * dx - m.a23 * dy
  handles[dragging].position.reset(...p)
  dirty = true
})

window.addEventListener('pointerup', () => {
  if (dragging < 0) return
  dragging = -1
  camera.enabled = true
  gl.canvas.style.cursor = hot >= 0 ? 'grab' : ''
})

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
pane
  .addBinding(params, 'preset', {
    options: Object.fromEntries(Object.keys(PRESETS).map((k) => [k, k]))
  })
  .on('change', () => {
    loadPreset()
    pane.refresh()
  })
pane.addButton({ title: 'Reset points' }).on('click', loadPreset)

const curveFolder = pane.addFolder({ title: 'Curve' })
curveFolder
  .addBinding(params, 'type', {
    options: { 'Catmull-Rom': 'catmullrom', 'B-spline': 'bspline' }
  })
  .on('change', () => {
    // alpha and tension only shape the Catmull-Rom
    alphaBinding.hidden = tensionBinding.hidden = params.type !== 'catmullrom'
    rebuild()
  })
const closedBinding = curveFolder
  .addBinding(params, 'closed')
  .on('change', rebuild)
const alphaBinding = curveFolder
  .addBinding(params, 'alpha', { min: 0, max: 1, step: 0.05 })
  .on('change', rebuild)
const tensionBinding = curveFolder
  .addBinding(params, 'tension', { min: -1, max: 1, step: 0.05 })
  .on('change', rebuild)
const twistBinding = curveFolder
  .addBinding(params, 'twist', {
    min: -3,
    max: 3,
    step: 0.25,
    format: (v) => `${v} turns`
  })
  .on('change', rebuild)
curveFolder.addBinding(params, 'length', {
  readonly: true,
  format: (v) => v.toFixed(2)
})

const tubeFolder = pane.addFolder({ title: 'Tube' })
tubeFolder
  .addBinding(params, 'radius', { min: 0.02, max: 0.4 })
  .on('change', rebuild)
tubeFolder
  .addBinding(params, 'taper', { min: 0, max: 0.95 })
  .on('change', rebuild)
tubeFolder
  .addBinding(params, 'opacity', { min: 0, max: 1 })
  .on('change', () => (u_opacity.value = params.opacity))
tubeFolder
  .addBinding(params, 'tubularSegments', {
    label: 'segments',
    min: 8,
    max: 400,
    step: 1
  })
  .on('change', rebuild)
tubeFolder
  .addBinding(params, 'radialSegments', {
    label: 'around',
    min: 3,
    max: 48,
    step: 1
  })
  .on('change', rebuild)

const sampleFolder = pane.addFolder({ title: 'Samples' })
sampleFolder
  .addBinding(params, 'samples', {
    label: 'spacing',
    options: { even: 'even', parametric: 'parametric', off: 'off' }
  })
  .on('change', rebuild)
sampleFolder
  .addBinding(params, 'count', { min: 4, max: 120, step: 1 })
  .on('change', rebuild)
sampleFolder.addBinding(params, 'frames').on('change', rebuild)

const extrudeFolder = pane.addFolder({ title: 'Extrude' })
extrudeFolder
  .addBinding(params, 'depth', { min: 0, max: 2 })
  .on('change', rebuild)
extrudeFolder.addBinding(params, 'bevel').on('change', rebuild)
extrudeFolder
  .addBinding(params, 'bevelSize', { label: 'bevel size', min: 0, max: 0.4 })
  .on('change', rebuild)
extrudeFolder
  .addBinding(params, 'bevelThickness', {
    label: 'bevel depth',
    min: 0,
    max: 0.4
  })
  .on('change', rebuild)
extrudeFolder
  .addBinding(params, 'bevelSegments', {
    label: 'bevel steps',
    min: 1,
    max: 8,
    step: 1
  })
  .on('change', rebuild)
extrudeFolder
  .addBinding(params, 'creaseAngle', {
    label: 'crease',
    min: 0,
    max: 180,
    step: 1,
    format: (v) => `${v}°`
  })
  .on('change', rebuild)
extrudeFolder
  .addBinding(params, 'curveDivisions', {
    label: 'divisions',
    min: 1,
    max: 32,
    step: 1
  })
  .on('change', rebuild)

extrudeFolder
  .addBinding(params, 'uvs', {
    options: { projected: 'projected', separate: 'separate' }
  })
  .on('change', rebuild)
extrudeFolder
  .addBinding(params, 'checker', { label: 'uv checker' })
  .on('change', () => (u_checker.value = params.checker ? 1 : 0))

// The extrude preset has its own folder in place of the tube's, and the
// outline is always closed
const showFolders = () => {
  const solid = extruding()
  extrudeFolder.hidden = !solid
  tubeFolder.hidden = sampleFolder.hidden = solid
  closedBinding.hidden = twistBinding.hidden = solid
}

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
}
window.addEventListener('resize', resize)
resize()

u_opacity.value = params.opacity
loadPreset()

// ── Loop ──────────────────────────────────────────────────────────────────
const run = () => {
  requestAnimationFrame(run)

  // Rebuild at most once a frame while dragging
  if (dirty) {
    dirty = false
    rebuild()
    pane.refresh()
  }

  camera.update()
  renderer.render({ scene, camera })
  renderer.render({ scene: handleScene, camera, clear: false })
}
requestAnimationFrame(run)
