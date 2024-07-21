import {
  Renderer,
  Uniform,
  Triangle,
  DollyCamera,
  Vec2,
  Program,
  Mesh,
  GeometryAttribute,
  Drawable,
  Vec3,
  Mat4
} from '../../src/lib'

import '../style.css'

import fragment from './main.frag'
import vertex from './main.vert'

const numT = 3

const initWebgl = () => {
  const rendererProps = { antialias: true, premultipliedAlpha: true }
  const dimensions = new Vec2(window.innerWidth, window.innerHeight)

  const mats = []
  const transformationsa = new Float32Array(numT * 16)
  for (let i = 0; i < numT; i++) {
    mats.push(new Mat4())
    transformationsa.set([...mats[i]], i * 16)
  }
  const attributes = {
    colour: new GeometryAttribute({
      size: 3,
      data: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    }),
    transformation: new GeometryAttribute({
      instanced: 1,
      size: 16,
      data: transformationsa
    })
  }

  const dpr = 2
  const uniforms = {
    u_time: new Uniform({ name: 'time', value: 0.0, kind: 'float' }),
    u_resolution: new Uniform({
      name: 'resolution',
      value: [...dimensions],
      kind: '2fv'
    }),
    u_transform: new Uniform({
      name: 'transform',
      value: [...new Mat4()],
      kind: 'Matrix4fv'
    })
  }

  const renderer = new Renderer(rendererProps)
  const gl = renderer.gl
  document.body.appendChild(gl.canvas)
  gl.clearColor(0.1, 0.15, 0.2, 1)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
  gl.colorMask(true, true, true, false)

  const scene = new Drawable(gl)

  const geometry = new Triangle(gl, {
    attributes
  })
  const program = new Program(gl, {
    fragment,
    vertex,
    uniforms,
    cullFace: null,
    transparent: true,
    depthTest: true,
    depthWrite: false
  })
  program.setBlendFunc(gl.SRC_ALPHA, gl.ONE)
  const mesh = new Mesh(gl, { geometry, program })

  mesh.setParent(scene)

  const camera = new DollyCamera()
  camera.setPosition(0.5, 5.5, 5.85)
  camera.fov = 90
  camera.lookAt(new Vec3(0, 0, 0))

  let playing = true

  const resize = () => {
    dimensions.reset(window.innerWidth, window.innerHeight)
    uniforms.u_resolution.value = [...dimensions.scaleNew(dpr)]
    renderer.dimensions = dimensions
  }
  window.addEventListener('resize', resize, false)
  resize()

  const run = (d) => {
    camera.update()
    uniforms.u_time.value += d * 0.0001

    mats[0].rotate(0.01, [0, 1, 0])
    transformationsa.set([...mats[0]], 0)
    mats[1].rotate(0.012, [0, 0.5, -0.5])
    transformationsa.set([...mats[1]], 16)
    mats[2].rotate(0.014, [0.5, 0, 0.5])
    transformationsa.set([...mats[2]], 2 * 16)
    attributes.transformation.updateAttribute(gl)

    renderer.render({ scene, camera })
    if (playing) requestAnimationFrame(run)
  }
  requestAnimationFrame(run)
}

initWebgl()
