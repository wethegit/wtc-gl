import type {
  WTCGLGeometryAttributeCollection,
  WTCGLRenderingContext
} from '../types'

import { elementLayout, indexArray, indexEntries } from './attributeData'
import { Geometry } from './Geometry'
import { GeometryAttribute } from './GeometryAttribute'

// A thin adapter to manifold-3d (https://github.com/elalish/manifold) for
// CSG. wtc-gl doesn't depend on manifold-3d: you install and load it, and pass
// the loaded module in. These types are the parts of its API the adapter
// uses, so the real module fits them.

/**
 * The options a manifold-3d `Mesh` is built from.
 * @category Geometry
 */
export interface ManifoldMeshOptionsLike {
  /** Properties per vertex, including the three for position. */
  numProp: number
  /** Every vertex's properties, `numProp` at a time, position first. */
  vertProperties: Float32Array
  /** Three vertex indices per triangle. */
  triVerts: Uint32Array
}

/**
 * The parts of a manifold-3d `Mesh` the adapter uses.
 * @category Geometry
 */
export interface ManifoldMeshLike {
  /** Properties per vertex, including the three for position. */
  numProp: number
  /** Every vertex's properties, `numProp` at a time, position first. */
  vertProperties: Float32Array
  /** Three vertex indices per triangle. */
  triVerts: Uint32Array
  /** Where each run starts in `triVerts`, with one more entry for the end of the last. */
  runIndex: Uint32Array
  /** The number of vertices. */
  readonly numVert: number
  /** The number of runs: groups of triangles that came from the same input. */
  readonly numRun: number
  /** Welds vertices at the same position, so seams close up. Returns whether it changed anything. */
  merge(): boolean
  /** The transform a run went through, as a column-major 4×4 matrix. */
  transform(run: number): ArrayLike<number>
  /** Whether a run was turned inside out, as by a subtraction. */
  backside(run: number): boolean
  /** Whether manifold already keeps a run's normals up to date, as after `calculateNormals`. */
  hasNormals(run: number): boolean
}

/**
 * The parts of a manifold-3d `Manifold` the adapter uses.
 * @category Geometry
 */
export interface ManifoldLike {
  /** `'NoError'`, or why the manifold isn't valid. */
  status(): string
  /** The manifold's triangles and vertex properties. */
  getMesh(): ManifoldMeshLike
  /** A new manifold with normals written into the properties from `normalIdx`, keeping edges sharper than `minSharpAngle` degrees. */
  calculateNormals(normalIdx?: number, minSharpAngle?: number): ManifoldLike
  /** Frees the manifold's WASM memory. */
  delete(): void
}

/**
 * A loaded manifold-3d module, after `setup()`.
 * @category Geometry
 */
export interface ManifoldModuleLike<
  M extends ManifoldLike = ManifoldLike,
  MeshType extends ManifoldMeshLike = ManifoldMeshLike
> {
  /** The `Mesh` constructor. */
  Mesh: {
    /** Make a mesh from interleaved vertex properties and triangles. */
    new (options: ManifoldMeshOptionsLike): MeshType
  }
  /** The `Manifold` constructor. */
  Manifold: {
    /** Make a manifold from a mesh. Throws if it isn't a closed solid. */
    new (mesh: MeshType): M
  }
}

/**
 * The vertex attributes carried through a manifold as its extra vertex
 * properties, by name and number of components, in order. `normal`, if
 * listed, always comes first.
 * @category Geometry
 */
export type ManifoldProperties = Record<string, number>

/**
 * Options for {@link fromManifold}.
 * @category Geometry
 */
export interface ManifoldOptions {
  /**
   * The attributes to carry through. Give every geometry you combine, and
   * `fromManifold`, the same properties.
   * @default { normal: 3, uv: 2 }
   */
  properties: ManifoldProperties
}

/**
 * Options for {@link toManifold}.
 * @category Geometry
 */
export interface ToManifoldOptions extends ManifoldOptions {
  /**
   * Values for attributes the geometry doesn't have, by name, such as
   * `{ colour: [1, 0.4, 0.2] }` to tint the faces a cutter leaves. Without
   * one, a missing attribute is 0s, or 1s for `colour`.
   * @default {}
   */
  fill: Record<string, ArrayLike<number>>
  /**
   * When `normal` is listed but the geometry has none, manifold computes
   * them, keeping edges sharper than this many degrees. @default 60
   */
  sharpAngle: number
}

const DEFAULT_PROPERTIES: ManifoldProperties = { normal: 3, uv: 2 }

// The properties as [name, size, offset into a vertex's properties], with
// `normal` first so it sits where manifold's calculateNormals(0) writes it
const layoutOf = (properties: ManifoldProperties) => {
  const names = Object.keys(properties)
  if ('normal' in properties) {
    if (properties.normal !== 3)
      throw new Error('normal must have 3 components')
    names.splice(names.indexOf('normal'), 1)
    names.unshift('normal')
  }
  let offset = 3
  const layout = names.map((name) => {
    const entry = { name, size: properties[name], offset }
    offset += entry.size
    return entry
  })
  return { layout, numProp: offset }
}

// The value an attribute's missing component takes: 1 for colours, so a
// missing colour is white and a missing alpha opaque, otherwise 0
const padding = (name: string) => (name === 'colour' ? 1 : 0)

let isExternalWarned = false

/**
 * Convert a geometry into a manifold-3d `Manifold`, for CSG with manifold's
 * own API: `a.subtract(b)`, `Manifold.union([...])`, `translate()` and so on.
 * Pass the result back with {@link fromManifold}.
 *
 * The geometry must be a closed solid made of triangles: every edge shared by
 * exactly two triangles once coincident positions are welded. Seams in UVs or
 * normals are fine, as is non-indexed geometry. A `Plane` isn't a solid.
 *
 * Besides the position, the attributes in `properties` are carried through
 * and interpolated across the new faces; each face keeps the attributes of
 * the geometry it came from. The geometry's own transform isn't applied: use
 * the manifold's `transform()`, `translate()` and so on.
 *
 * The result lives in WASM memory and isn't garbage collected: call
 * `delete()` on it, and on every manifold made from it, when you're done.
 *
 * ```ts
 * import Module from 'manifold-3d'
 * const wasm = await Module()
 * wasm.setup()
 *
 * const box = toManifold(wasm, new Box(gl))
 * const hole = toManifold(wasm, new Sphere(gl, { radius: 0.65 }))
 * const cut = box.subtract(hole)
 * mesh.geometry = fromManifold(gl, cut)
 * for (const m of [box, hole, cut]) m.delete()
 * ```
 * @param wasm - The loaded manifold-3d module, after `setup()`
 * @param geometry - A closed, triangulated geometry
 * @param options - The attributes to carry through, and fill values
 * @returns A new manifold, which you own
 * @category Geometry
 */
export function toManifold<
  M extends ManifoldLike,
  MeshType extends ManifoldMeshLike
>(
  wasm: ManifoldModuleLike<M, MeshType>,
  geometry: Geometry,
  {
    properties = DEFAULT_PROPERTIES,
    fill = {},
    sharpAngle = 60
  }: Partial<ToManifoldOptions> = {}
): M {
  const { layout, numProp } = layoutOf(properties)
  const position = geometry.attributes.position
  if (!position || position.external) {
    throw new Error('toManifold needs a geometry with positions on the CPU')
  }

  const count = position.count
  const vertProperties = new Float32Array(count * numProp)

  // Positions, padded to 3D
  const write = (
    attr: (typeof geometry.attributes)[string],
    offset: number,
    size: number,
    pad: number
  ) => {
    const { offset: start, stride } = elementLayout(attr)
    const n = Math.min(size, attr.size)
    for (let v = 0; v < count; v++) {
      const from = start + v * stride
      const to = v * numProp + offset
      for (let k = 0; k < size; k++) {
        vertProperties[to + k] = k < n ? attr.data[from + k] : pad
      }
    }
  }
  write(position, 0, 3, 0)

  let hasNormals = false
  for (const { name, size, offset } of layout) {
    const attr = geometry.attributes[name]
    if (attr?.external && !isExternalWarned) {
      isExternalWarned = true
      console.warn(`External attribute ${name} can't be read, so it's filled`)
    }
    if (attr && !attr.external && !attr.divisor) {
      write(attr, offset, size, padding(name))
      if (name === 'normal') hasNormals = true
      continue
    }
    const values = fill[name]
    for (let v = 0; v < count; v++) {
      for (let k = 0; k < size; k++) {
        vertProperties[v * numProp + offset + k] =
          values && k < values.length ? values[k] : padding(name)
      }
    }
  }

  const index = geometry.attributes.index
  const triVerts = index
    ? Uint32Array.from(indexEntries(index))
    : Uint32Array.from({ length: count }, (_, i) => i)

  const mesh = new wasm.Mesh({ numProp, vertProperties, triVerts })
  // Weld coincident positions, so seams and non-indexed geometry close up
  mesh.merge()

  // manifold throws for a mesh that isn't manifold, and reports other
  // problems through status()
  let manifold: M
  try {
    manifold = new wasm.Manifold(mesh)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`The geometry isn't a closed solid (${reason})`)
  }
  const status = manifold.status()
  if (status !== 'NoError') {
    manifold.delete()
    throw new Error(`The geometry isn't a closed solid (${status})`)
  }

  if (!hasNormals && layout[0]?.name === 'normal') {
    // calculateNormals(0) also marks them as world-space normals, which
    // getMesh() then keeps up to date
    const withNormals = manifold.calculateNormals(0, sharpAngle) as M
    manifold.delete()
    return withNormals
  }
  return manifold
}

let isPropertyCountWarned = false

/**
 * Convert a manifold-3d `Manifold`, such as the result of a boolean, into a
 * new indexed Geometry with `position` and the attributes in `properties`.
 * Give it the same `properties` as {@link toManifold}.
 *
 * Normals are rotated by the transforms the manifold's parts went through
 * and flipped on faces a subtraction turned inside out, then normalised.
 * Vertices are split where attributes differ, so cut edges stay sharp.
 *
 * The manifold isn't deleted.
 * @param gl - The WTCGL rendering context
 * @param manifold - The manifold to convert
 * @param options - The attributes to read back
 * @returns A new Geometry
 * @category Geometry
 */
export function fromManifold(
  gl: WTCGLRenderingContext,
  manifold: ManifoldLike,
  { properties = DEFAULT_PROPERTIES }: Partial<ManifoldOptions> = {}
): Geometry {
  const { layout, numProp: expected } = layoutOf(properties)
  const mesh = manifold.getMesh()
  const { numProp, vertProperties: props, triVerts } = mesh
  const count = props.length / numProp
  if (numProp !== expected && !isPropertyCountWarned) {
    isPropertyCountWarned = true
    console.warn(
      `The manifold has ${numProp - 3} properties per vertex, but ` +
        `${expected - 3} were asked for: give toManifold and fromManifold ` +
        'the same properties'
    )
  }

  const attributes: WTCGLGeometryAttributeCollection = {}
  const read = (offset: number, size: number) => {
    const data = new Float32Array(count * size)
    for (let v = 0; v < count; v++) {
      for (let k = 0; k < size; k++) {
        const p = offset + k
        data[v * size + k] = p < numProp ? props[v * numProp + p] : 0
      }
    }
    return data
  }
  attributes.position = new GeometryAttribute({ size: 3, data: read(0, 3) })
  for (const { name, size, offset } of layout) {
    const data = read(offset, size)
    if (name === 'normal') orientNormals(mesh, data)
    attributes[name] = new GeometryAttribute({ size, data })
  }
  attributes.index = new GeometryAttribute({
    data: indexArray(triVerts, count)
  })
  return new Geometry(gl, attributes)
}

// Rotate each run's normals by its transform's inverse transpose and flip
// those a subtraction turned inside out, unless manifold already did (normals
// from calculateNormals). Then normalise them all.
function orientNormals(mesh: ManifoldMeshLike, normals: Float32Array): void {
  const done = new Uint8Array(normals.length / 3)
  for (let run = 0; run < mesh.numRun; run++) {
    if (mesh.hasNormals(run)) continue
    // The columns of the transform's 3×3, and their cross products: the
    // columns of its inverse transpose, scaled by the determinant
    const t = mesh.transform(run)
    const [ax, ay, az] = [t[0], t[1], t[2]]
    const [bx, by, bz] = [t[4], t[5], t[6]]
    const [cx, cy, cz] = [t[8], t[9], t[10]]
    const bc = [by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx]
    const ca = [cy * az - cz * ay, cz * ax - cx * az, cx * ay - cy * ax]
    const ab = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
    const det = ax * bc[0] + ay * bc[1] + az * bc[2]
    const sign = (det < 0 ? -1 : 1) * (mesh.backside(run) ? -1 : 1)

    for (let i = mesh.runIndex[run]; i < mesh.runIndex[run + 1]; i++) {
      const v = mesh.triVerts[i]
      if (done[v]) continue
      done[v] = 1
      const x = normals[v * 3]
      const y = normals[v * 3 + 1]
      const z = normals[v * 3 + 2]
      normals[v * 3] = sign * (bc[0] * x + ca[0] * y + ab[0] * z)
      normals[v * 3 + 1] = sign * (bc[1] * x + ca[1] * y + ab[1] * z)
      normals[v * 3 + 2] = sign * (bc[2] * x + ca[2] * y + ab[2] * z)
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2])
    if (length === 0) continue
    normals[i] /= length
    normals[i + 1] /= length
    normals[i + 2] /= length
  }
}
