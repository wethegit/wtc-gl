import { Mesh } from '../core/Mesh'
import { Uniform } from '../core/Uniform'
import type { Geometry } from '../geometry/Geometry'
import { lineProgram } from './lineProgram'
import { normalLines, readable, reader } from './normalLines'
import type { NormalsHelperOptions } from './VertexNormalsHelper'

import normalsVertex from './normals.vert'

/**
 * A line out of the centre of each triangle of a mesh along its face normal,
 * for checking winding: the lines point out of the front faces.
 *
 * It becomes a child of the mesh, so it moves with it, and the lines are
 * `size` world units long however the mesh is scaled. It reads the mesh's
 * positions (and index) once: call `update()` after they change, or after
 * the mesh's geometry is replaced. The mesh should draw `gl.TRIANGLES`.
 * Drawn with `gl.LINES`, so the lines are one pixel wide. It isn't frustum
 * culled, and needs a camera to draw.
 */
export class FaceNormalsHelper extends Mesh {
  /** The mesh whose face normals are shown. */
  readonly mesh: Mesh

  constructor(
    mesh: Mesh,
    { size = 0.1, colour = [1, 0.55, 0.2] }: Partial<NormalsHelperOptions> = {}
  ) {
    const gl = mesh.gl
    super(gl, {
      geometry: faceNormals(mesh.geometry),
      program: lineProgram(gl, {
        colour,
        vertex: normalsVertex,
        uniforms: {
          u_size: new Uniform({ name: 'size', value: size, kind: 'float' })
        }
      }),
      mode: gl.LINES,
      frustumCulled: false
    })
    this.mesh = mesh
    this.setParent(mesh)
  }

  /** The length of each line, in world units. */
  get size(): number {
    return this.program.uniforms.u_size.value as number
  }
  set size(value: number) {
    this.program.uniforms.u_size.value = value
  }

  /** Re-read the mesh's positions and index. */
  update(): void {
    const old = this.geometry
    this.geometry = faceNormals(this.mesh.geometry)
    old.remove()
  }
}

function faceNormals(geometry: Geometry): Geometry {
  const name = 'FaceNormalsHelper'
  const position = readable(geometry.attributes.position, 'position', name)
  const p = reader(position)
  const index = geometry.attributes.index?.data
  const corners = index ? index.length : position.count - (position.count % 3)
  const corner = index ? (i: number) => index[i] : (i: number) => i

  const triangles = Math.floor(corners / 3)
  const points = new Float32Array(triangles * 3)
  const normals = new Float32Array(triangles * 3)
  for (let t = 0; t < triangles; t++) {
    const a = corner(t * 3)
    const b = corner(t * 3 + 1)
    const c = corner(t * 3 + 2)
    const ax = p(a, 0), ay = p(a, 1), az = p(a, 2) // prettier-ignore
    const bx = p(b, 0), by = p(b, 1), bz = p(b, 2) // prettier-ignore
    const cx = p(c, 0), cy = p(c, 1), cz = p(c, 2) // prettier-ignore

    points[t * 3] = (ax + bx + cx) / 3
    points[t * 3 + 1] = (ay + by + cy) / 3
    points[t * 3 + 2] = (az + bz + cz) / 3

    // (b - a) × (c - a), normalised; zero for a degenerate triangle
    const ux = bx - ax, uy = by - ay, uz = bz - az // prettier-ignore
    const vx = cx - ax, vy = cy - ay, vz = cz - az // prettier-ignore
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    normals[t * 3] = nx / length
    normals[t * 3 + 1] = ny / length
    normals[t * 3 + 2] = nz / length
  }
  return normalLines(geometry.gl, points, normals)
}
