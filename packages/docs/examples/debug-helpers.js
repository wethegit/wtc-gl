import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  NormalProgram,
  WireMesh,
  VertexNormalsHelper,
  FaceNormalsHelper,
  GridHelper,
  AxesHelper,
  Sphere,
  Torus,
  Vec2,
  Vec3
} from 'wtc-gl'

// Two meshes coloured by their world-space normals, so the colours stay put
// as the camera circles. The sphere shows its vertex normals; the torus is
// flat shaded, with a wireframe and its face normals.
export default function (container) {
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true
  })
  const { gl } = renderer
  container.appendChild(gl.canvas)

  const camera = new Camera({ fov: 35 })
  const target = new Vec3(0, 0.6, 0)
  const scene = new Obj()

  const sphere = new Mesh(gl, {
    geometry: new Sphere(gl, { radius: 0.6, widthSegments: 16 }),
    program: new NormalProgram(gl, { space: 'world' })
  })
  sphere.position.reset(-1, 0.7, 0)
  sphere.setParent(scene)
  new VertexNormalsHelper(sphere, { size: 0.15 })

  const torus = new Mesh(gl, {
    geometry: new Torus(gl, {
      radius: 0.5,
      tube: 0.2,
      radialSegments: 6,
      tubularSegments: 16
    }),
    program: new NormalProgram(gl, { space: 'world', flatShading: true })
  })
  torus.position.reset(1, 0.7, 0)
  torus.setParent(scene)
  new WireMesh(gl, {
    geometry: torus.geometry,
    colour: [0.1, 0.1, 0.12]
  }).setParent(torus)
  new FaceNormalsHelper(torus, { size: 0.15 })

  new GridHelper(gl, { size: 6, divisions: 12 }).setParent(scene)
  const axes = new AxesHelper(gl, { size: 0.8 })
  // Just above the grid, whose centre lines run along x and z
  axes.position.y = 0.01
  axes.setParent(scene)

  return {
    frame(time) {
      const a = time * 0.3
      camera.position.reset(Math.sin(a) * 5.5, 2.5, Math.cos(a) * 5.5)
      camera.lookAt(target)
      torus.rotation.x = time * 0.5
      torus.updateRotation()
      renderer.render({ scene, camera })
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
      camera.perspective({ aspect: width / height })
    },
    dispose() {
      scene.traverse((node) => {
        node.geometry?.remove()
        node.program?.remove()
        return null
      })
      renderer.dispose()
      gl.canvas.remove()
    }
  }
}
