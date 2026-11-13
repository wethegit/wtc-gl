import { Mat3, Mat4, Vec2, Vec3 } from 'wtc-math'

import type { WTCGLGeometryAttribute } from '../types'
import { Camera } from '../core/Camera'
import { InstancedMesh } from '../core/InstancedMesh'
import { Mesh } from '../core/Mesh'
import { Obj } from '../core/Object'
import {
  determinantMat4,
  invertMat4,
  multiplyMat4,
  normalMatrix
} from '../core/matrix'

/** Where a ray met a mesh's bounds. */
export interface RaycastBoundsHit {
  mesh: Mesh
  /** From the ray's origin, in world units. */
  distance: number
  /** In world space. */
  point: Vec3
  /** In the mesh's (and instance's) own space. */
  localPoint: Vec3
  /** The instance hit, for an `InstancedMesh`. */
  instanceId?: number
}

/** Where a ray met a mesh's triangles. */
export interface RaycastHit extends RaycastBoundsHit {
  /** The triangle's number, in draw order. */
  faceIndex: number
  /**
   * The surface normal in world space: interpolated from the `normal`
   * attribute where there is one, otherwise the face normal.
   */
  normal: Vec3
  /** The triangle's own normal in world space, out of its front face. */
  faceNormal: Vec3
  /** Interpolated from the `uv` attribute, where there is one. */
  uv?: Vec2
}

export interface RaycastOptions {
  /** Ignore anything further away. @default Infinity */
  maxDistance: number
  /**
   * Which faces can't be hit: `gl.BACK`, `gl.FRONT`, or 0 for none. By
   * default, whatever the mesh's program culls when it draws.
   */
  cullFace: number
  /** Grow each mesh's bounds by this many world units, for small targets. @default 0 */
  padding: number
}

/** A mesh, a list of them, or the root of a scene to search. */
export type RaycastTarget = Obj | Obj[]

/**
 * A ray, for picking: which meshes are under the pointer, and where.
 *
 * ```ts
 * const raycast = new Raycast()
 * canvas.addEventListener('pointermove', (e) => {
 *   const x = (e.offsetX / canvas.clientWidth) * 2 - 1
 *   const y = 1 - (e.offsetY / canvas.clientHeight) * 2
 *   raycast.castMouse(camera, [x, y])
 *   const [hit] = raycast.intersectMeshes(scene)
 *   if (hit) console.log(hit.mesh, hit.point, hit.normal, hit.uv)
 * })
 * ```
 *
 * `intersectBounds` tests each mesh's bounding box, which is cheap.
 * `intersectMeshes` goes on to its triangles, for the exact point, the face,
 * the normal and the uv. Both take a mesh, a list, or a scene to walk (hidden
 * objects are skipped), and return new hits, nearest first: one per mesh, or
 * one per instance of an `InstancedMesh`, with its `instanceId`. Only
 * `gl.TRIANGLES` meshes whose positions are on the CPU can be hit, not lines,
 * points or a `TransformFeedback`'s output.
 *
 * World matrices should be up to date, as they are after a render. Picking
 * allocates its results, so it's meant for pointer events rather than every
 * frame. `intersectPlane` is handy for dragging.
 */
export class Raycast {
  /** Where the ray starts, in world space. */
  readonly origin = new Vec3()
  /** The ray's direction, a unit vector. */
  readonly direction = new Vec3(0, 0, -1)

  #matrix = new Mat4()
  #inverse = new Mat4()
  #normalMatrix = new Mat3()

  /** Point the ray from `origin` along `direction`, which is normalised. */
  set(origin: Vec3, direction: Vec3): this {
    this.origin.x = origin.x
    this.origin.y = origin.y
    this.origin.z = origin.z
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1
    this.direction.x = direction.x / length
    this.direction.y = direction.y / length
    this.direction.z = direction.z / length
    return this
  }

  /**
   * Cast from `camera` through a point on the screen, in normalised device
   * coordinates: x and y from -1 to 1, with y up, as `Camera.project` gives.
   * A perspective ray starts at the camera, an orthographic one on its near
   * plane.
   */
  castMouse(camera: Camera, ndc: ArrayLike<number> = [0, 0]): this {
    const near = camera.unproject(new Vec3(ndc[0], ndc[1], -1))
    const far = camera.unproject(new Vec3(ndc[0], ndc[1], 1))
    const origin = camera.type === 'orthographic' ? near : camera.worldPosition
    return this.set(origin, far.subtractNew(near))
  }

  /**
   * Where the ray meets a plane through `point` facing along `normal`, or
   * null when it's parallel or behind the ray.
   */
  intersectPlane(
    normal: Vec3,
    point: Vec3,
    out: Vec3 = new Vec3()
  ): Vec3 | null {
    const o = this.origin
    const d = this.direction
    const denominator = normal.x * d.x + normal.y * d.y + normal.z * d.z
    if (Math.abs(denominator) < 1e-12) return null
    const t =
      (normal.x * (point.x - o.x) +
        normal.y * (point.y - o.y) +
        normal.z * (point.z - o.z)) /
      denominator
    if (t < 0) return null
    out.x = o.x + d.x * t
    out.y = o.y + d.y * t
    out.z = o.z + d.z * t
    return out
  }

  /**
   * The distance to a sphere along the ray, 0 from inside it, or Infinity if
   * the ray misses.
   */
  intersectSphere(centre: Vec3, radius: number): number {
    const o = this.origin
    const d = this.direction
    const ox = o.x - centre.x
    const oy = o.y - centre.y
    const oz = o.z - centre.z
    const c = ox * ox + oy * oy + oz * oz - radius * radius
    if (c <= 0) return 0
    const b = ox * d.x + oy * d.y + oz * d.z
    const discriminant = b * b - c
    if (discriminant < 0) return Infinity
    const t = -b - Math.sqrt(discriminant)
    return t < 0 ? Infinity : t
  }

  /**
   * The distance to an axis-aligned box along the ray, 0 from inside it, or
   * Infinity if the ray misses.
   */
  intersectBox(min: Vec3, max: Vec3): number {
    const o = this.origin
    const d = this.direction
    return boxDistance(
      o.x, o.y, o.z, d.x, d.y, d.z,
      min.x, min.y, min.z, max.x, max.y, max.z
    ) // prettier-ignore
  }

  /** The meshes whose bounding boxes the ray meets, nearest first. */
  intersectBounds(
    target: RaycastTarget,
    options: Partial<RaycastOptions> = {}
  ): RaycastBoundsHit[] {
    return this.#intersect(target, options, false)
  }

  /**
   * The meshes whose triangles the ray meets, nearest first, with the point,
   * face, normal and uv of each hit.
   */
  intersectMeshes(
    target: RaycastTarget,
    options: Partial<RaycastOptions> = {}
  ): RaycastHit[] {
    return this.#intersect(target, options, true) as RaycastHit[]
  }

  #intersect(
    target: RaycastTarget,
    { maxDistance = Infinity, cullFace, padding = 0 }: Partial<RaycastOptions>,
    triangles: boolean
  ): RaycastBoundsHit[] {
    const hits: RaycastBoundsHit[] = []
    for (const mesh of collect(target)) {
      const geometry = mesh.geometry
      const position = geometry.attributes.position
      if (mesh.mode !== mesh.gl.TRIANGLES) continue
      // The source's positions, for an instanced mesh, which only reads them
      const source = mesh instanceof InstancedMesh ? mesh.source : geometry
      const sourcePosition = source.attributes.position
      if (!position || !sourcePosition?.data || sourcePosition.external) {
        continue
      }
      if (!source.bounds) source.computeBoundingBox()
      if (!source.bounds) continue

      const instances = mesh instanceof InstancedMesh ? mesh.count : 1
      for (let i = 0; i < instances; i++) {
        let matrix = mesh.worldMatrix
        if (mesh instanceof InstancedMesh) {
          mesh.getMatrixAt(i, this.#inverse)
          matrix = multiplyMat4(this.#matrix, mesh.worldMatrix, this.#inverse)
        }
        const hit = this.#intersectOne(
          mesh,
          source,
          matrix,
          padding,
          triangles,
          cullFace ?? mesh.program.cullFace ?? 0
        )
        if (!hit || hit.distance > maxDistance) continue
        if (mesh instanceof InstancedMesh) hit.instanceId = i
        hits.push(hit)
      }
    }
    return hits.sort((a, b) => a.distance - b.distance)
  }

  #intersectOne(
    mesh: Mesh,
    geometry: Mesh['geometry'],
    matrix: Mat4,
    padding: number,
    triangles: boolean,
    cullFace: number
  ): RaycastBoundsHit | RaycastHit | null {
    const inverse = this.#inverse
    if (!invertMat4(inverse, matrix)) return null

    // The ray in the mesh's space. The direction isn't normalised, so a
    // distance along it is the same as along the world ray.
    const o = this.origin
    const d = this.direction
    const m = inverse
    const ox = m.a11 * o.x + m.a21 * o.y + m.a31 * o.z + m.a41
    const oy = m.a12 * o.x + m.a22 * o.y + m.a32 * o.z + m.a42
    const oz = m.a13 * o.x + m.a23 * o.y + m.a33 * o.z + m.a43
    const dx = m.a11 * d.x + m.a21 * d.y + m.a31 * d.z
    const dy = m.a12 * d.x + m.a22 * d.y + m.a32 * d.z
    const dz = m.a13 * d.x + m.a23 * d.y + m.a33 * d.z

    // Padding in world units, as local units along each axis
    const w = matrix
    const px = padding / (Math.hypot(w.a11, w.a12, w.a13) || 1)
    const py = padding / (Math.hypot(w.a21, w.a22, w.a23) || 1)
    const pz = padding / (Math.hypot(w.a31, w.a32, w.a33) || 1)
    const { min, max } = geometry.bounds!
    const boxT = boxDistance(
      ox, oy, oz, dx, dy, dz,
      min.x - px, min.y - py, min.z - pz,
      max.x + px, max.y + py, max.z + pz
    ) // prettier-ignore
    if (boxT === Infinity) return null

    const hitAt = (t: number) => ({
      mesh,
      distance: t,
      point: new Vec3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t),
      localPoint: new Vec3(ox + dx * t, oy + dy * t, oz + dz * t)
    })
    if (!triangles) return hitAt(boxT)

    // A mirrored mesh is drawn with its winding flipped, so its front and
    // back swap
    const flipped = determinantMat4(matrix) < 0
    const gl = mesh.gl
    const cullBack =
      cullFace === gl.FRONT_AND_BACK ||
      (cullFace === gl.BACK && !flipped) ||
      (cullFace === gl.FRONT && flipped)
    const cullFront =
      cullFace === gl.FRONT_AND_BACK ||
      (cullFace === gl.FRONT && !flipped) ||
      (cullFace === gl.BACK && flipped)

    const p = read(geometry.attributes.position)
    const index = geometry.attributes.index?.data
    const corner = index ? (i: number) => index[i] : (i: number) => i
    const total = index ? index.length : geometry.attributes.position.count
    const start = geometry.drawRange.start
    const end = Math.min(
      total,
      start + (geometry.drawRange.count || total - start)
    )

    let best = Infinity
    let bestFace = -1
    let bestU = 0
    let bestV = 0
    let a = 0, b = 0, c = 0 // prettier-ignore
    for (let k = start; k + 2 < end; k += 3) {
      const ia = corner(k)
      const ib = corner(k + 1)
      const ic = corner(k + 2)
      const ax = p(ia, 0), ay = p(ia, 1), az = p(ia, 2) // prettier-ignore
      const e1x = p(ib, 0) - ax, e1y = p(ib, 1) - ay, e1z = p(ib, 2) - az // prettier-ignore
      const e2x = p(ic, 0) - ax, e2y = p(ic, 1) - ay, e2z = p(ic, 2) - az // prettier-ignore

      // Möller–Trumbore. det > 0 when the ray meets the front face (the
      // counter-clockwise side).
      const qx = dy * e2z - dz * e2y
      const qy = dz * e2x - dx * e2z
      const qz = dx * e2y - dy * e2x
      const det = e1x * qx + e1y * qy + e1z * qz
      if (Math.abs(det) < 1e-12) continue
      if (det > 0 ? cullFront : cullBack) continue

      const inv = 1 / det
      const sx = ox - ax, sy = oy - ay, sz = oz - az // prettier-ignore
      const u = (sx * qx + sy * qy + sz * qz) * inv
      if (u < 0 || u > 1) continue
      const rx = sy * e1z - sz * e1y
      const ry = sz * e1x - sx * e1z
      const rz = sx * e1y - sy * e1x
      const v = (dx * rx + dy * ry + dz * rz) * inv
      if (v < 0 || u + v > 1) continue
      const t = (e2x * rx + e2y * ry + e2z * rz) * inv
      if (t < 0 || t >= best) continue

      best = t
      bestFace = (k - start) / 3
      bestU = u
      bestV = v
      a = ia
      b = ib
      c = ic
    }
    if (bestFace < 0) return null

    // Normals into world space by the inverse transpose
    const n = this.#normalMatrix
    normalMatrix(n, matrix)
    const toWorld = (x: number, y: number, z: number) => {
      const v = new Vec3(
        n.a11 * x + n.a21 * y + n.a31 * z,
        n.a12 * x + n.a22 * y + n.a32 * z,
        n.a13 * x + n.a23 * y + n.a33 * z
      )
      const length = Math.hypot(v.x, v.y, v.z) || 1
      v.x /= length
      v.y /= length
      v.z /= length
      return v
    }

    const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)]
    const e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)]
    let fx = e1[1] * e2[2] - e1[2] * e2[1]
    let fy = e1[2] * e2[0] - e1[0] * e2[2]
    let fz = e1[0] * e2[1] - e1[1] * e2[0]
    if (flipped) {
      fx = -fx
      fy = -fy
      fz = -fz
    }
    const faceNormal = toWorld(fx, fy, fz)

    const wa = 1 - bestU - bestV
    const normalAttr = geometry.attributes.normal
    let normal = faceNormal
    if (normalAttr?.data && !normalAttr.external) {
      const q = read(normalAttr)
      const at = (j: number) => wa * q(a, j) + bestU * q(b, j) + bestV * q(c, j)
      normal = toWorld(at(0), at(1), at(2))
    }

    const uvAttr = geometry.attributes.uv
    let uv: Vec2 | undefined
    if (uvAttr?.data && !uvAttr.external) {
      const q = read(uvAttr)
      const at = (j: number) => wa * q(a, j) + bestU * q(b, j) + bestV * q(c, j)
      uv = new Vec2(at(0), at(1))
    }

    return { ...hitAt(best), faceIndex: bestFace, normal, faceNormal, uv }
  }
}

/** Every visible mesh in a target, walking down from roots. */
function collect(target: RaycastTarget): Mesh[] {
  const meshes: Mesh[] = []
  const roots = Array.isArray(target) ? target : [target]
  for (const root of roots) {
    root.traverse((node) => {
      if (!node.visible) return true
      if (node instanceof Mesh) meshes.push(node)
      return false
    })
  }
  return meshes
}

/** Read component `c` of vertex `i`, packed or strided. */
function read(attr: WTCGLGeometryAttribute) {
  const data = attr.data
  const bytes = data.BYTES_PER_ELEMENT
  const per = attr.stride ? attr.stride / bytes : attr.size
  const start = (attr.offset || 0) / bytes
  return (i: number, c: number) => data[start + i * per + c]
}

/**
 * The distance along a ray to an axis-aligned box (slab test), 0 from
 * inside it, or Infinity on a miss.
 */
function boxDistance(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number
): number {
  let near = -Infinity
  let far = Infinity
  const slab = (o: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) far = -Infinity
      return
    }
    let t1 = (lo - o) / d
    let t2 = (hi - o) / d
    if (t1 > t2) [t1, t2] = [t2, t1]
    if (t1 > near) near = t1
    if (t2 < far) far = t2
  }
  slab(ox, dx, minX, maxX)
  slab(oy, dy, minY, maxY)
  slab(oz, dz, minZ, maxZ)
  if (far < Math.max(near, 0)) return Infinity
  return Math.max(near, 0)
} // prettier-ignore
