import { Mesh } from '../core/Mesh'
import { Uniform } from '../core/Uniform'
import type { Geometry } from '../geometry/Geometry'
import { lineProgram } from './lineProgram'
import { normalLines, readable, reader } from './normalLines'

import normalsVertex from './normals.vert'

export interface NormalsHelperOptions {
  /** The length of each line, in world units. @default 0.1 */
  size: number
  colour: [number, number, number]
}

/**
 * A line out of each vertex of a mesh along its normal, for checking normals.
 *
 * It becomes a child of the mesh, so it moves with it, and the lines are
 * `size` world units long however the mesh is scaled. It reads the mesh's
 * positions and normals once: call `update()` after they change, or after
 * the mesh's geometry is replaced. Drawn with `gl.LINES`, so the lines are
 * one pixel wide. It isn't frustum culled, and needs a camera to draw.
 */
export class VertexNormalsHelper extends Mesh {
  /** The mesh whose normals are shown. */
  readonly mesh: Mesh

  constructor(
    mesh: Mesh,
    { size = 0.1, colour = [0.25, 0.6, 1] }: Partial<NormalsHelperOptions> = {}
  ) {
    const gl = mesh.gl
    super(gl, {
      geometry: vertexNormals(mesh.geometry),
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

  /** Re-read the mesh's positions and normals. */
  update(): void {
    const old = this.geometry
    this.geometry = vertexNormals(this.mesh.geometry)
    old.remove()
  }
}

function vertexNormals(geometry: Geometry): Geometry {
  const name = 'VertexNormalsHelper'
  const position = readable(geometry.attributes.position, 'position', name)
  const normal = readable(geometry.attributes.normal, 'normal', name)
  const p = reader(position)
  const n = reader(normal)
  const count = position.count
  const points = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      points[i * 3 + c] = p(i, c)
      normals[i * 3 + c] = n(i, c)
    }
  }
  return normalLines(geometry.gl, points, normals)
}
