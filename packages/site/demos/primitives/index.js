import {
  Renderer,
  DollyCamera,
  Obj,
  Mesh,
  Program,
  Uniform,
  Box,
  Sphere,
  Plane,
  Cylinder,
  Torus,
  Capsule,
  Lathe,
  GeometryAttribute,
  Mat4,
  Vec2,
  Vec3,
  Vec4
} from 'wtc-gl'
import { Pane } from 'tweakpane'

import shapeVert from './shape.vert'
import shapeFrag from './shape.frag'

// Every built-in primitive side by side, each with its options in the pane.
// Changing an option rebuilds that one geometry. Each is drawn from a
// non-indexed copy (toNonIndexed) so every triangle can carry barycentric
// coordinates for the edges, and flat shading recomputes the normals on that
// copy (computeVertexNormals). The lathe is moved with applyMatrix so it's
// centred in its cell like the others.

const TAU = Math.PI * 2
const COLUMNS = 4
const SPACING = 1.9
const ROW_SPACING = 2.4
// How far below each shape's centre its label goes
const LABEL_DROP = 1.0

const angle = {
  min: 0,
  max: TAU,
  format: (v) => `${Math.round((v * 360) / TAU)}°`
}
const segments = (min, max) => ({ min, max, step: 1 })
const length = (min, max) => ({ min, max })

// A vase: closed at the bottom on the axis, swelling, then a narrow neck
// flaring to a lip
const vase = (count) =>
  Array.from({ length: count }, (_, i) => {
    if (i === 0) return [0, 0]
    const t = (i - 1) / (count - 2)
    const r = 0.22 + 0.2 * Math.sin(t * Math.PI * 1.25 + 0.35) + 0.12 * t * t
    return [r, t * 1.35]
  })

const SHAPES = [
  {
    name: 'Box',
    colour: [0.93, 0.55, 0.42],
    make: (o) => new Box(gl, o),
    options: {
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    },
    ranges: {
      width: length(0.2, 1.4),
      height: length(0.2, 1.4),
      depth: length(0.2, 1.4),
      widthSegments: segments(1, 8),
      heightSegments: segments(1, 8),
      depthSegments: segments(1, 8)
    }
  },
  {
    name: 'Sphere',
    colour: [0.96, 0.78, 0.38],
    make: (o) => new Sphere(gl, o),
    options: {
      radius: 0.6,
      widthSegments: 16,
      heightSegments: 10,
      phiLength: TAU,
      thetaLength: Math.PI
    },
    ranges: {
      radius: length(0.2, 0.8),
      widthSegments: segments(3, 48),
      heightSegments: segments(2, 32),
      phiLength: angle,
      thetaLength: { ...angle, max: Math.PI }
    }
  },
  {
    name: 'Plane',
    colour: [0.62, 0.8, 0.5],
    make: (o) => new Plane(gl, o),
    options: { width: 1.2, height: 1.2, widthSegments: 1, heightSegments: 1 },
    ranges: {
      width: length(0.2, 1.4),
      height: length(0.2, 1.4),
      widthSegments: segments(1, 12),
      heightSegments: segments(1, 12)
    }
  },
  {
    name: 'Cylinder',
    colour: [0.42, 0.75, 0.78],
    make: (o) => new Cylinder(gl, o),
    options: {
      radiusTop: 0.45,
      radiusBottom: 0.45,
      height: 1.2,
      radialSegments: 24,
      heightSegments: 1,
      openEnded: false,
      thetaLength: TAU
    },
    ranges: {
      radiusTop: length(0, 0.7),
      radiusBottom: length(0, 0.7),
      height: length(0.2, 1.4),
      radialSegments: segments(3, 64),
      heightSegments: segments(1, 12),
      thetaLength: angle
    }
  },
  {
    name: 'Cone',
    colour: [0.45, 0.58, 0.9],
    make: (o) => new Cylinder(gl, o),
    options: {
      radiusTop: 0,
      radiusBottom: 0.55,
      height: 1.2,
      radialSegments: 24,
      heightSegments: 1,
      openEnded: false
    },
    ranges: {
      radiusBottom: length(0.1, 0.7),
      height: length(0.2, 1.4),
      radialSegments: segments(3, 64),
      heightSegments: segments(1, 12)
    }
  },
  {
    name: 'Torus',
    colour: [0.72, 0.56, 0.92],
    make: (o) => new Torus(gl, o),
    options: {
      radius: 0.45,
      tube: 0.18,
      radialSegments: 12,
      tubularSegments: 36,
      arc: TAU
    },
    ranges: {
      radius: length(0.2, 0.6),
      tube: length(0.02, 0.3),
      radialSegments: segments(3, 32),
      tubularSegments: segments(3, 96),
      arc: angle
    }
  },
  {
    name: 'Capsule',
    colour: [0.92, 0.5, 0.68],
    make: (o) => new Capsule(gl, o),
    options: {
      radius: 0.3,
      height: 1.3,
      capSegments: 6,
      radialSegments: 16,
      heightSegments: 1
    },
    ranges: {
      radius: length(0.05, 0.6),
      height: length(0.1, 1.4),
      capSegments: segments(1, 16),
      radialSegments: segments(3, 48),
      heightSegments: segments(1, 12)
    }
  },
  {
    name: 'Lathe',
    colour: [0.88, 0.68, 0.48],
    make: ({ points, ...o }) => new Lathe(gl, { ...o, points: vase(points) }),
    options: { points: 16, segments: 24, phiLength: TAU },
    ranges: {
      points: segments(3, 48),
      segments: segments(3, 64),
      phiLength: angle
    },
    // The vase stands on the origin, so move its middle there
    offset: [0, -0.675, 0]
  }
]

const params = {
  view: 'lit',
  shading: 'smooth',
  edges: true,
  cull: true,
  spin: true
}

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
    maxDistance: 20
  },
  { fov: 35, near: 0.1, far: 100 }
)
camera.setPosition(0, 2.6, 9.5)

// ── Shapes ────────────────────────────────────────────────────────────────
const u_mode = new Uniform({ name: 'mode', value: 0, kind: 'int' })
const u_edges = new Uniform({ name: 'edges', value: 1, kind: 'float' })

// A non-indexed copy, so each corner of each triangle can have its own
// barycentric coordinate. Smooth shading keeps the primitive's own normals.
const build = (shape) => {
  const base = shape.make(shape.options)
  if (shape.offset) base.applyMatrix(Mat4.fromTranslatingVec3(shape.offset))
  shape.vertices = base.attributes.position.count
  shape.triangles = base.attributes.index.count / 3

  const geometry = base.toNonIndexed()
  base.remove()
  if (params.shading === 'flat') geometry.computeVertexNormals()

  const count = geometry.attributes.position.count
  const barycentric = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) barycentric[i * 3 + (i % 3)] = 1
  geometry.addAttribute(
    'barycentric',
    new GeometryAttribute({ size: 3, data: barycentric })
  )
  return geometry
}

const scene = new Obj()
const labels = document.getElementById('labels')
const rows = Math.ceil(SHAPES.length / COLUMNS)

SHAPES.forEach((shape, i) => {
  const column = i % COLUMNS
  const row = Math.floor(i / COLUMNS)
  shape.centre = [
    (column - (COLUMNS - 1) / 2) * SPACING,
    ((rows - 1) / 2 - row) * ROW_SPACING,
    0
  ]

  shape.mesh = new Mesh(gl, {
    geometry: build(shape),
    program: new Program(gl, {
      vertex: shapeVert,
      fragment: shapeFrag,
      uniforms: {
        u_mode,
        u_edges,
        u_colour: new Uniform({
          name: 'colour',
          value: shape.colour,
          kind: 'float_vec3'
        })
      }
    })
  })
  shape.mesh.position.reset(...shape.centre)
  shape.mesh.setParent(scene)

  shape.label = document.createElement('div')
  shape.label.className = 'label'
  labels.appendChild(shape.label)
})

const describe = (shape) =>
  `${shape.name} · ${shape.vertices} verts · ${shape.triangles} tris`

const rebuild = (shape) => {
  shape.mesh.geometry.remove()
  shape.mesh.geometry = build(shape)
  shape.label.textContent = describe(shape)
}

const rebuildAll = () => SHAPES.forEach(rebuild)

const setCulling = () => {
  for (const { mesh } of SHAPES) {
    mesh.program.cullFace = params.cull ? gl.BACK : null
  }
}

// ── Controls ──────────────────────────────────────────────────────────────
const pane = new Pane({
  title: 'Controls',
  expanded: window.innerWidth > 700,
  container: document.getElementById('controls')
})
pane
  .addBinding(params, 'view', {
    options: { lit: 'lit', normals: 'normals', 'uv checker': 'uv' }
  })
  .on('change', () => {
    u_mode.value = { lit: 0, normals: 1, uv: 2 }[params.view]
  })
pane
  .addBinding(params, 'shading', {
    options: { smooth: 'smooth', flat: 'flat' }
  })
  .on('change', rebuildAll)
pane
  .addBinding(params, 'edges')
  .on('change', () => (u_edges.value = params.edges ? 1 : 0))
pane
  .addBinding(params, 'cull', { label: 'cull backs' })
  .on('change', setCulling)
pane.addBinding(params, 'spin')

for (const shape of SHAPES) {
  const folder = pane.addFolder({ title: shape.name, expanded: false })
  for (const key of Object.keys(shape.options)) {
    folder
      .addBinding(shape.options, key, shape.ranges[key] ?? {})
      .on('change', () => rebuild(shape))
  }
}

const resize = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.dimensions = new Vec2(width, height)
  camera.perspective({ aspect: width / height })
}
window.addEventListener('resize', resize)
resize()

rebuildAll()
setCulling()

// ── Loop ──────────────────────────────────────────────────────────────────
const corner = new Vec4()
let last = 0
const run = (t) => {
  requestAnimationFrame(run)
  const time = t * 0.001
  const dt = Math.min(time - last, 0.1)
  last = time

  if (params.spin) {
    for (const { mesh } of SHAPES) {
      mesh.rotation.y += dt * 0.4
      mesh.updateRotation()
    }
  }

  camera.update()
  renderer.render({ scene, camera })

  // Put each label just under its shape
  for (const shape of SHAPES) {
    const [x, y, z] = shape.centre
    corner.reset(x, y - LABEL_DROP, z, 1)
    corner.transformByMat4(camera.projectionViewMatrix)
    const sx = (corner.x / corner.w) * 0.5 + 0.5
    const sy = 0.5 - (corner.y / corner.w) * 0.5
    shape.label.style.transform = `translate(${sx * window.innerWidth}px, ${
      sy * window.innerHeight
    }px) translate(-50%, 0)`
  }
}
requestAnimationFrame(run)
