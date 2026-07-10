import {
  Renderer,
  DollyCamera,
  Drawable,
  Program,
  Mesh,
  Box,
  Uniform,
  Vec2,
  Vec3,
  Mat4,
} from 'wtc-gl'

import vertex from './main.vert'
import fragment from './main.frag'

const renderer = new Renderer({ autoClear: true, dpr: 2, webgl: 2 })
const gl = renderer.gl
document.body.appendChild(gl.canvas)
gl.clearColor(0, 0.05, 0.1, 1)

const camera = new DollyCamera()
camera.setPosition(0, 0.5, 1.85)
camera.fov = 85
camera.lookAt(new Vec3(0, 0, 0))

function resize() {
  renderer.dimensions = new Vec2(window.innerWidth, window.innerHeight)
  camera.perspective({ aspect: gl.canvas.width / gl.canvas.height })
}
window.addEventListener('resize', resize, false)
resize()

const scene = new Drawable(gl)
const cubeGeometry = new Box(gl)

const uniforms = {
  u_matrix: new Uniform({ name: 'u_matrix', value: [...new Mat4()], kind: 'mat4' }),
  u_cameraPosition: new Uniform({ name: 'u_cameraPosition', value: [0, 0.5, 1.85], kind: 'float_vec3' }),
}

const program = new Program(gl, { vertex, fragment, uniforms, cullFace: null })

const cube = new Mesh(gl, { geometry: cubeGeometry, program })
cube.position.reset(0, 0, 0)
cube.setParent(scene)

const rot = new Vec3(0.005, 0.02, 0.01)

requestAnimationFrame(update)
function update() {
  requestAnimationFrame(update)

  camera.update()
  uniforms.u_cameraPosition.value = [...camera.position]

  cube.rotation.add(rot)
  cube.updateMatrixWorld()
  uniforms.u_matrix.value = [...cube.matrix]

  renderer.render({ scene, camera })
}
