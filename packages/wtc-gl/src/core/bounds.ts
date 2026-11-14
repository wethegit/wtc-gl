import { Mesh } from './Mesh'
import type { Obj } from './Object'

/** A sphere in world space. */
export interface WorldSphere {
  centre: [number, number, number]
  radius: number
}

/**
 * A sphere around every mesh under `node`, in world space, from each mesh's
 * bounding sphere and world matrix (which should be up to date). Meshes whose
 * positions live on the GPU, with no bounds set, are left out. Null when
 * there are no meshes to measure.
 *
 * Internal: shared by `Shadow.fit` and `Stage.fit`.
 */
export function worldBoundingSphere(node: Obj): WorldSphere | null {
  const spheres: [number, number, number, number][] = []
  node.traverse((child) => {
    if (!(child instanceof Mesh)) return null
    const geometry = child.geometry
    if (!geometry.attributes.position) return null
    if (!geometry.bounds || geometry.bounds.radius === Infinity) {
      if (geometry.attributes.position.external) return null
      geometry.computeBoundingSphere()
    }
    const bounds = geometry.bounds
    if (!bounds) return null
    const m = child.worldMatrix
    const { x, y, z } = bounds.center
    const scale = Math.sqrt(
      Math.max(
        m.a11 * m.a11 + m.a12 * m.a12 + m.a13 * m.a13,
        m.a21 * m.a21 + m.a22 * m.a22 + m.a23 * m.a23,
        m.a31 * m.a31 + m.a32 * m.a32 + m.a33 * m.a33
      )
    )
    spheres.push([
      m.a11 * x + m.a21 * y + m.a31 * z + m.a41,
      m.a12 * x + m.a22 * y + m.a32 * z + m.a42,
      m.a13 * x + m.a23 * y + m.a33 * z + m.a43,
      bounds.radius * scale
    ])
    return null
  })
  if (!spheres.length) return null

  // Centre on the box around the spheres, then reach the furthest one
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const s of spheres) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], s[k] - s[3])
      max[k] = Math.max(max[k], s[k] + s[3])
    }
  }
  const centre: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ]
  let radius = 0
  for (const s of spheres) {
    const d = Math.hypot(s[0] - centre[0], s[1] - centre[1], s[2] - centre[2])
    radius = Math.max(radius, d + s[3])
  }
  return { centre, radius }
}
