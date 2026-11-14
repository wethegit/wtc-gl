import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Sphere,
  Geometry,
  GeometryAttribute,
  NormalProgram,
  Vec2
} from 'wtc-gl'

// The same rock twice, coloured by its normals: per face on the left, from
// toNonIndexed(), and smooth on the right, from mergeVertices().
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    antialias: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })

  // A sphere's positions and index, without its uvs: mergeVertices keeps
  // vertices with different uvs apart, which would leave the seam open
  const sphere = new Sphere(gl, { radius: 1, widthSegments: 20 })
  const { position, index } = sphere.attributes
  const shape = new Geometry(gl, {
    position: new GeometryAttribute({ size: 3, data: position.data }),
    index: new GeometryAttribute({ data: index.data })
  })
  const smooth = shape.mergeVertices()
  sphere.remove()
  shape.remove()

  // Push each vertex in or out, then upload the change
  const p = smooth.attributes.position.data
  for (let i = 0; i < p.length; i += 3) {
    const [x, y, z] = [p[i], p[i + 1], p[i + 2]]
    const r =
      1 + 0.18 * Math.sin(3 * x + 1) * Math.sin(4 * y + 2) * Math.sin(5 * z)
    p[i] *= r
    p[i + 1] *= r
    p[i + 2] *= r
  }
  smooth.attributes.position.needsUpdate = true
  smooth.computeVertexNormals()

  // Every triangle with vertices of its own, so each gets its face's normal
  const flat = smooth.toNonIndexed()
  flat.computeVertexNormals()

  const program = new NormalProgram(gl)
  const scene = new Obj()
  const meshes = [flat, smooth].map((geometry, i) => {
    const mesh = new Mesh(gl, { geometry, program })
    mesh.position.x = i ? 1.4 : -1.4
    mesh.setParent(scene)
    return mesh
  })

  return {
    frame(time) {
      for (const mesh of meshes) {
        mesh.rotation.x = 0.4
        mesh.rotation.y = time * 0.4
        mesh.updateRotation()
      }
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
      camera.position.z = Math.max(5.5, 9.5 / (width / height))
    },
    dispose() {
      flat.remove()
      smooth.remove()
      program.remove()
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
