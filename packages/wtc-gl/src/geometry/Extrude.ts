import earcut from 'earcut'

import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'
import { Path } from '../path/Path'
import { toXYZ } from '../path/segments'
import type { PathPoint } from '../path/segments'

import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

/** An outline: a `Path` (or `Curve`), or a list of points. */
export type ExtrudeContour = Path | PathPoint[]

export interface ExtrudeOptions {
  shape: ExtrudeContour
  holes: ExtrudeContour[]
  depth: number
  curveDivisions: number
  bevel: boolean
  bevelThickness: number
  bevelSize: number
  bevelSegments: number
  creaseAngle: number
  uvs: 'projected' | 'separate'
  attributes: WTCGLGeometryAttributeCollection
}

type XY = [number, number]

// The outline as points, without repeats or a closing repeat of the start
const toPoints = (contour: ExtrudeContour, curveDivisions: number): XY[] => {
  const points: XY[] =
    contour instanceof Path
      ? contour.toPolyline(curveDivisions).map((p): XY => [p.x, p.y])
      : contour.map((p): XY => {
          const [x, y] = toXYZ(p)
          return [x, y]
        })
  const same = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9
  const distinct = points.filter((p, i) => i === 0 || !same(points[i - 1], p))
  if (distinct.length > 1 && same(distinct[0], distinct[distinct.length - 1])) {
    distinct.pop()
  }
  return distinct
}

const signedArea = (points: XY[]) => {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    area += x0 * y1 - x1 * y0
  }
  return area / 2
}

// Unit direction and outward normal (to the right of travel) of an edge
const edge = (a: XY, b: XY) => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  return { dir: [dx / l, dy / l] as XY, normal: [dy / l, -dx / l] as XY }
}

const normalise = (x: number, y: number): XY => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

const turn = (a: XY, b: XY) =>
  Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])))

/**
 * A 2D outline, with optional holes, extruded into a solid along z. The
 * outline keeps its own x and y, and the solid is centred on z, from
 * `-depth / 2` to `depth / 2`. Outlines can be `Path`s or `Curve`s, sampled
 * with `toPolyline(curveDivisions)` so corners stay sharp, or lists of points,
 * and can be wound either way.
 *
 * `bevel` rounds the edges between the caps and the sides: each end grows by
 * `bevelThickness` along z, the caps are inset by `bevelSize`, and
 * `bevelSegments` sets how round it is (1 is a chamfer). A large `bevelSize`
 * on a tight shape can make the inset outline cross itself.
 *
 * The sides are smooth where they turn by less than `creaseAngle` (radians),
 * and hard-edged at sharper corners, both around the outline and across the
 * bevel.
 *
 * Uvs are in world units. The caps are projected flat, as (x, y). On the
 * straight sides, u is the distance around the outline and v the distance
 * from the back. With `uvs: 'projected'` (the default) the bevel is projected
 * like the caps, so a texture runs on from the face over the bevel without a
 * seam, and the seam is where the bevel meets the straight side instead. With
 * `uvs: 'separate'` the bevel is mapped like the sides.
 */
export class Extrude extends Geometry {
  constructor(
    gl: WTCGLRenderingContext,
    {
      shape,
      holes = [],
      depth = 0.2,
      curveDivisions = 12,
      bevel = false,
      bevelThickness = 0.05,
      bevelSize = 0.04,
      bevelSegments = 3,
      creaseAngle = Math.PI / 6,
      uvs = 'projected',
      attributes = {}
    }: Partial<ExtrudeOptions> = {}
  ) {
    if (!shape) throw new Error('Extrude: a shape is required')

    // The outline runs anticlockwise and the holes clockwise, so the solid
    // is always on the left of travel and outward is always on the right
    const contours = [shape, ...holes].map((contour, c) => {
      const points = toPoints(contour, curveDivisions)
      const name = c === 0 ? 'shape' : 'hole'
      if (points.length < 3) {
        throw new Error(`Extrude: a ${name} needs at least three points`)
      }
      const area = signedArea(points)
      if (Math.abs(area) < 1e-12) {
        throw new Error(`Extrude: a ${name} has no area`)
      }
      return (c === 0) === area > 0 ? points : points.reverse()
    })

    // The side profile, back to front, as (inset, z) rings. Bevel rings also
    // note their angle round the quarter-round (0 at the side, π/2 at the
    // cap) and which end they're at (-1 back, 1 front).
    const profile: {
      inset: number
      z: number
      angle?: number
      end?: number
    }[] = []
    const half = depth / 2
    if (bevel) {
      for (let k = 0; k <= bevelSegments; k++) {
        const angle = (Math.PI / 2) * (1 - k / bevelSegments)
        profile.push({
          inset: bevelSize * (1 - Math.cos(angle)),
          z: -(half + bevelThickness * Math.sin(angle)),
          angle,
          end: -1
        })
      }
      for (let k = depth > 0 ? 0 : 1; k <= bevelSegments; k++) {
        const angle = (Math.PI / 2) * (k / bevelSegments)
        profile.push({
          inset: bevelSize * (1 - Math.cos(angle)),
          z: half + bevelThickness * Math.sin(angle),
          angle,
          end: 1
        })
      }
    } else {
      profile.push({ inset: 0, z: -half }, { inset: 0, z: half })
    }

    // Each profile edge's outward normal in (out, z), and whether the profile
    // creases at each ring
    const profileNormals = profile.slice(1).map((b, k) => {
      const a = profile[k]
      // Outward is to the right of travel: (dz, -d(out)), and out = -inset
      return normalise(b.z - a.z, b.inset - a.inset)
    })
    const last = profile.length - 1
    // The caps face straight back and forwards. A bevel's end rings meet a
    // cap, so they crease against it like any other turn; without a bevel the
    // sides always meet the caps at a hard edge.
    const capNormal = (k: number): XY | undefined =>
      bevel && k === 0 ? [0, -1] : bevel && k === last ? [0, 1] : undefined
    const profileCreases = profile.map((_, k) => {
      const below = profileNormals[k - 1] ?? capNormal(k)
      const above = profileNormals[k] ?? capNormal(k)
      if (!below || !above) return false
      return turn(below, above) > creaseAngle + 1e-9
    })

    // The normal of a smooth ring: exact on the bevel's quarter-round, which
    // meets the cap facing along z and the side facing straight out, so it
    // blends into both. Elsewhere, the average of the edges either side.
    const smoothNormal = (k: number): XY => {
      const { angle, end } = profile[k]
      if (angle !== undefined && end !== undefined) {
        const out = bevelThickness * Math.cos(angle)
        const along = end * bevelSize * Math.sin(angle)
        if (Math.hypot(out, along) > 1e-12) return normalise(out, along)
      }
      const below = profileNormals[k - 1]
      const above = profileNormals[k]
      if (!below) return above
      if (!above) return below
      return normalise(below[0] + above[0], below[1] + above[1])
    }

    const position: number[] = []
    const normal: number[] = []
    const uv: number[] = []
    const index: number[] = []

    const add = (
      x: number,
      y: number,
      z: number,
      n: [number, number, number],
      u: number,
      v: number
    ) => {
      position.push(x, y, z)
      normal.push(...n)
      uv.push(u, v)
      return position.length / 3 - 1
    }

    // Whether a profile edge is mapped like the caps: every bevel edge, when
    // projecting. The straight side is the edge after the back bevel's rings.
    const projects = (f: number) =>
      uvs === 'projected' && bevel && !(depth > 0 && f === bevelSegments)

    // Distance along the profile to each ring, for v
    const profileV = [0]
    for (let k = 1; k < profile.length; k++) {
      const a = profile[k - 1]
      const b = profile[k]
      profileV.push(profileV[k - 1] + Math.hypot(b.inset - a.inset, b.z - a.z))
    }

    const capRings: XY[][] = []

    for (const points of contours) {
      const n = points.length
      const edges = points.map((p, i) => edge(p, points[(i + 1) % n]))

      // How far, and which way, each point moves to inset the outline: along
      // the mitre between its two edges' normals, limited at sharp corners
      const mitres = points.map((_, i) => {
        const before = edges[(i - 1 + n) % n].normal
        const after = edges[i].normal
        const m = normalise(before[0] + after[0], before[1] + after[1])
        const scale = Math.min(
          2,
          1 / Math.max(0.5, m[0] * after[0] + m[1] * after[1])
        )
        return [m[0] * scale, m[1] * scale] as XY
      })
      const inset = (i: number, amount: number): XY => [
        points[i][0] - mitres[i][0] * amount,
        points[i][1] - mitres[i][1] * amount
      ]

      // Whether the outline creases at each point
      const creases = points.map(
        (_, i) =>
          turn(edges[(i - 1 + n) % n].dir, edges[i].dir) > creaseAngle + 1e-9
      )

      // Distance around the outline to each point, for u, with the start
      // repeated at the end so the seam's uvs run on
      const around = [0]
      for (let i = 1; i <= n; i++) {
        const [x0, y0] = points[i - 1]
        const [x1, y1] = points[i % n]
        around.push(around[i - 1] + Math.hypot(x1 - x0, y1 - y0))
      }

      // A side vertex, shared between the walls around it unless the outline
      // or profile creases there, or the uvs change. `e` and `f` are the
      // edges it's for, around the outline and across the profile.
      const vertices = new Map<string, number>()
      const sideVertex = (i: number, e: number, k: number, f: number) => {
        const p = i % n
        const outlineSide = creases[p] ? (e === i ? 1 : 0) : 0
        const profileSide = profileCreases[k] ? (f === k ? 1 : 0) : 0
        const projected = projects(f)
        const key = `${i},${outlineSide},${k},${profileSide},${projected}`
        const existing = vertices.get(key)
        if (existing !== undefined) return existing

        const before = edges[(p - 1 + n) % n].normal
        const after = edges[p].normal
        const flat = creases[p]
          ? outlineSide
            ? after
            : before
          : normalise(before[0] + after[0], before[1] + after[1])

        // At a crease, the normal of the profile edge this vertex is for. An
        // end ring creases against the cap, so it only has the one edge.
        const [out, nz] = profileCreases[k]
          ? ((profileSide ? profileNormals[k] : profileNormals[k - 1]) ??
            profileNormals[k] ??
            profileNormals[k - 1])
          : smoothNormal(k)

        const [x, y] = inset(p, profile[k].inset)
        const id = add(
          x,
          y,
          profile[k].z,
          [flat[0] * out, flat[1] * out, nz],
          projected ? x : around[i],
          projected ? y : profileV[k]
        )
        vertices.set(key, id)
        return id
      }

      for (let e = 0; e < n; e++) {
        for (let f = 0; f < profile.length - 1; f++) {
          const a = sideVertex(e, e, f, f)
          const b = sideVertex(e + 1, e, f, f)
          const c = sideVertex(e + 1, e, f + 1, f)
          const d = sideVertex(e, e, f + 1, f)
          index.push(a, b, d, b, c, d)
        }
      }

      const capInset = profile[profile.length - 1].inset
      capRings.push(points.map((_, i) => inset(i, capInset)))
    }

    // Caps: earcut once on the flattened rings, then a front and back copy
    const flat: number[] = []
    const holeStarts: number[] = []
    for (const [c, ring] of capRings.entries()) {
      if (c > 0) holeStarts.push(flat.length / 2)
      for (const [x, y] of ring) flat.push(x, y)
    }
    const triangles = earcut(flat, holeStarts)

    for (const side of [1, -1]) {
      const z = side > 0 ? profile[profile.length - 1].z : profile[0].z
      const first = position.length / 3
      for (let i = 0; i < flat.length; i += 2) {
        add(flat[i], flat[i + 1], z, [0, 0, side], flat[i], flat[i + 1])
      }
      for (let t = 0; t < triangles.length; t += 3) {
        const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]]
        // Wind each triangle to face out of its cap
        const cross =
          (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) -
          (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2])
        if (cross * side > 0) index.push(first + a, first + b, first + c)
        else index.push(first + a, first + c, first + b)
      }
    }

    const count = position.length / 3
    const attr = Object.assign({}, attributes, {
      position: new GeometryAttribute({
        size: 3,
        data: new Float32Array(position)
      }),
      normal: new GeometryAttribute({
        size: 3,
        data: new Float32Array(normal)
      }),
      uv: new GeometryAttribute({ size: 2, data: new Float32Array(uv) }),
      index: new GeometryAttribute({
        data: count > 65536 ? new Uint32Array(index) : new Uint16Array(index)
      })
    })

    super(gl, attr)
  }
}
