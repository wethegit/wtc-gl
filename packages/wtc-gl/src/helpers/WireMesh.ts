import type { WTCGLRenderingContext } from '../types'
import { Mesh } from '../core/Mesh'
import { Geometry } from '../geometry/Geometry'
import { GeometryAttribute } from '../geometry/GeometryAttribute'
import { sharedAttribute } from '../geometry/sharedAttribute'
import { lineProgram } from './lineProgram'

export interface WireMeshOptions {
  /** The geometry to draw the edges of. */
  geometry: Geometry
  /** @default [0, 0, 0] */
  colour: [number, number, number]
  /** @default 1 */
  opacity: number
  /** @default true */
  frustumCulled: boolean
  /** @default 0 */
  renderOrder: number
}

/**
 * A wireframe: each edge of a triangle geometry drawn once, as `gl.LINES`, so
 * the lines are one pixel wide.
 *
 * It draws straight from the source geometry's position buffer rather than
 * copying it, so positions the source updates show here too. Removing the
 * wire never deletes the source's buffer. Call `update()` after the source's
 * index or vertex count changes.
 *
 * It isn't attached to anything: to draw it over a mesh, add it as a child of
 * that mesh (`wire.setParent(mesh)`) or give it the same transform. It's
 * pulled slightly towards the camera so it shows on the surface. It needs a
 * camera to draw.
 */
export class WireMesh extends Mesh {
  /** The geometry whose edges are drawn. */
  readonly source: Geometry

  constructor(
    gl: WTCGLRenderingContext,
    {
      geometry,
      colour = [0, 0, 0],
      opacity = 1,
      frustumCulled = true,
      renderOrder = 0
    }: Partial<WireMeshOptions> & Pick<WireMeshOptions, 'geometry'>
  ) {
    if (!geometry) throw new Error('WireMesh: a geometry is required')

    super(gl, {
      geometry: new Geometry(gl, {
        position: sharedPosition(geometry),
        index: new GeometryAttribute({ data: edgeIndex(geometry) })
      }),
      program: lineProgram(gl, { colour, opacity }),
      mode: gl.LINES,
      frustumCulled,
      renderOrder
    })
    this.source = geometry
    this.#copyBounds()

    // Follow the source if it recreates its buffer, as after a lost context.
    // Geometry re-points the vertex array when it sees the change.
    this.addBeforeRender(() => {
      const own = this.geometry.attributes.position
      const source = this.source.attributes.position
      if (source && own.buffer !== source.buffer) own.buffer = source.buffer
    })
  }

  /**
   * Rebuild the edges from the source geometry, after its index or vertex
   * count has changed.
   */
  update(): void {
    this.geometry.addAttribute('position', sharedPosition(this.source))
    this.geometry.setIndex(edgeIndex(this.source))
    this.#copyBounds()
  }

  #copyBounds() {
    const source = this.source
    const position = source.attributes.position
    if (!source.bounds && position && !position.external) {
      source.computeBoundingSphere()
    }
    // The same object, so it follows the source's bounds
    if (source.bounds) this.geometry.bounds = source.bounds
  }
}

/** The source's position, read from its buffer. */
function sharedPosition(geometry: Geometry): GeometryAttribute {
  const position = geometry.attributes.position
  if (!position) throw new Error('WireMesh: the geometry has no position')
  return sharedAttribute(position)
}

/**
 * Each triangle edge once, as pairs of vertex indices, from the index or
 * from consecutive triangles.
 */
function edgeIndex(geometry: Geometry): Uint16Array | Uint32Array {
  const index = geometry.attributes.index?.data
  const vertices = geometry.attributes.position.count
  const corners = index ? index.length : vertices - (vertices % 3)
  const corner = index ? (i: number) => index[i] : (i: number) => i

  const seen = new Set<number>()
  const pairs: number[] = []
  const add = (a: number, b: number) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    // Unique for any pair below 2^26 vertices
    const key = lo * 67108864 + hi
    if (seen.has(key)) return
    seen.add(key)
    pairs.push(lo, hi)
  }
  for (let i = 0; i + 2 < corners; i += 3) {
    const a = corner(i)
    const b = corner(i + 1)
    const c = corner(i + 2)
    add(a, b)
    add(b, c)
    add(c, a)
  }
  return vertices > 65535 ? new Uint32Array(pairs) : new Uint16Array(pairs)
}
