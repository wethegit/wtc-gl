import { InstancedMesh } from './InstancedMesh'
import { Mesh } from './Mesh'
import type { Obj } from './Object'
import type { WTCGLBounds } from '../types'

/** A sphere in world space. */
export interface WorldSphere {
  centre: [number, number, number]
  radius: number
}

type SphereVisitor = (x: number, y: number, z: number, radius: number) => void

/** A geometry's bounds, measured if they can be. Null if they can't. */
function boundsOf(geometry: Mesh['geometry']): WTCGLBounds | null {
  const position = geometry.attributes.position
  if (!position) return null
  if (!geometry.bounds || geometry.bounds.radius === Infinity) {
    if (position.external) return null
    geometry.computeBoundingSphere()
  }
  return geometry.bounds ?? null
}

/** The largest scale along any axis of a 3×3, from its squared column lengths. */
function maxScale(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number
): number {
  return Math.sqrt(
    Math.max(
      a * a + b * b + c * c,
      d * d + e * e + f * f,
      g * g + h * h + i * i
    )
  )
}

/**
 * Call `visit` with every mesh's bounding sphere under `node`, in world space.
 * An InstancedMesh gives one per instance up to `count`: the source's bounds
 * through the instance's matrix, then the mesh's world matrix. Nothing is
 * allocated per mesh or instance, so this can run every frame.
 */
function eachSphere(node: Obj, visit: SphereVisitor): void {
  node.traverse((child) => {
    if (!(child instanceof Mesh)) return null
    const instanced = child instanceof InstancedMesh
    // An InstancedMesh's own geometry shares the source's buffers and has no
    // bounds of its own
    const bounds = boundsOf(instanced ? child.source : child.geometry)
    if (!bounds) return null

    const w = child.worldMatrix
    const worldScale = maxScale(
      w.a11,
      w.a12,
      w.a13,
      w.a21,
      w.a22,
      w.a23,
      w.a31,
      w.a32,
      w.a33
    )
    const { x: cx, y: cy, z: cz } = bounds.center

    if (!instanced) {
      visit(
        w.a11 * cx + w.a21 * cy + w.a31 * cz + w.a41,
        w.a12 * cx + w.a22 * cy + w.a32 * cz + w.a42,
        w.a13 * cx + w.a23 * cy + w.a33 * cz + w.a43,
        bounds.radius * worldScale
      )
      return null
    }

    const m = child.matrices
    for (let i = 0, count = child.count; i < count; i++) {
      const o = i * 16
      // The centre through the instance, then the mesh
      const lx = m[o] * cx + m[o + 4] * cy + m[o + 8] * cz + m[o + 12]
      const ly = m[o + 1] * cx + m[o + 5] * cy + m[o + 9] * cz + m[o + 13]
      const lz = m[o + 2] * cx + m[o + 6] * cy + m[o + 10] * cz + m[o + 14]
      const scale = maxScale(
        m[o],
        m[o + 1],
        m[o + 2],
        m[o + 4],
        m[o + 5],
        m[o + 6],
        m[o + 8],
        m[o + 9],
        m[o + 10]
      )
      visit(
        w.a11 * lx + w.a21 * ly + w.a31 * lz + w.a41,
        w.a12 * lx + w.a22 * ly + w.a32 * lz + w.a42,
        w.a13 * lx + w.a23 * ly + w.a33 * lz + w.a43,
        bounds.radius * scale * worldScale
      )
    }
    return null
  })
}

/**
 * A sphere around every mesh under `node`, in world space, from each mesh's
 * bounding sphere and world matrix (which should be up to date). An
 * InstancedMesh counts each of its instances up to `count`. Meshes whose
 * positions live on the GPU, with no bounds set, are left out. Null when
 * there are no meshes to measure.
 *
 * Internal: shared by `Shadow.fit` and `Stage.fit`.
 */
export function worldBoundingSphere(node: Obj): WorldSphere | null {
  // Centre on the box around the spheres, then reach the furthest one. Two
  // passes, rather than keeping every sphere, as there's one per instance.
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let found = false
  eachSphere(node, (x, y, z, r) => {
    found = true
    if (x - r < minX) minX = x - r
    if (y - r < minY) minY = y - r
    if (z - r < minZ) minZ = z - r
    if (x + r > maxX) maxX = x + r
    if (y + r > maxY) maxY = y + r
    if (z + r > maxZ) maxZ = z + r
  })
  if (!found) return null

  const centre: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  ]
  let radius = 0
  eachSphere(node, (x, y, z, r) => {
    const d = Math.hypot(x - centre[0], y - centre[1], z - centre[2]) + r
    if (d > radius) radius = d
  })
  return { centre, radius }
}
