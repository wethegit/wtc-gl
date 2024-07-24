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
  Mat4,
  Framebuffer
} from '../../src/lib'

import '../style.css'

import fragment from './main.frag'
import vertex from './main.vert'
import screenspace from './post.vert'
import post from './post.frag'

const numT = 3
const dimensions = new Vec2(window.innerWidth, window.innerHeight)

const initBlurBuffer = (renderer, u) => {
  const gl = renderer.gl
  const uniforms = {
    u_bd: new Uniform({ name: 'bd', value: [0, 1], kind: '2fv' }),
    u_time: u.u_time,
    u_resolution: u.u_resolution,
    b_render: new Uniform({
      name: 'render',
      value: null,
      kind: 'texture'
    })
  }

  const geometry = new Triangle(gl)
  const mainProgram = new Program(gl, {
    vertex: screenspace,
    fragment: post,
    uniforms: uniforms
  })
  const mainMesh = new Mesh(gl, { geometry, program: mainProgram })
  const mainFBO = new Framebuffer(gl, {
    dpr: renderer.dpr,
    name: 'render',
    width: dimensions.width,
    height: dimensions.height
  })

  const passes = 4
  const render = (d) => {
    for (let i = 0; i < passes; i++) {
      uniforms['u_bd'].value = [0, 1]
      uniforms[`b_render`].value = mainFBO.read.texture

      mainFBO.render(renderer, { scene: mainMesh })

      uniforms['u_bd'].value = [1, 0]
      uniforms[`b_render`].value = mainFBO.read.texture

      if (i == passes - 1) renderer.render({ scene: mainMesh })
      else mainFBO.render(renderer, { scene: mainMesh })
    }
  }

  return { mainFBO, render }
}

const initWebgl = () => {
  const rendererProps = { antialias: true, premultipliedAlpha: true, dpr: 2 }

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

  let { mainFBO, render: renderFramebuffer } = initBlurBuffer(
    renderer,
    uniforms
  )

  const resize = () => {
    dimensions.reset(window.innerWidth, window.innerHeight)
    uniforms.u_resolution.value = [...dimensions.scaleNew(dpr)]
    renderer.dimensions = dimensions
    mainFBO.resize(dimensions.width, dimensions.height)
  }
  window.addEventListener('resize', resize, false)
  resize()

  const run = (d) => {
    camera.update()
    uniforms.u_time.value += d * 0.0001

    mats[0].rotate(0.01, [0, 1, 0])
    transformationsa.set([...mats[0]], 0)
    mats[1].rotate(0.012, [0, 0, 1])
    transformationsa.set([...mats[1]], 16)
    mats[2].rotate(0.014, [1, 0, 0])
    transformationsa.set([...mats[2]], 2 * 16)
    attributes.transformation.updateAttribute(gl)

    mainFBO.render(renderer, { scene, camera })
    renderFramebuffer(d)

    if (playing) requestAnimationFrame(run)
  }
  requestAnimationFrame(run)
}

initWebgl()
