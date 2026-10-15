import {
  ScrollScene,
  Drawable,
  Mesh,
  Program,
  Uniform,
  TransformFeedback,
  Geometry,
  GeometryAttribute,
  DollyCamera
} from 'wtc-gl'
import particlesVert from './particles.vert'
import particlesFrag from './particles.frag'
import simulateVert from './simulate.vert'
import simulateFrag from './simulate.frag'

export const initParticles = ({ gl, scrollRenderer }) => {
  const N = 10000

  const particleEl = document.querySelector('.scene--particles')
  const particleDrawable = new Drawable(gl)

  const particleCamera = new DollyCamera(
    { element: particleEl, enableZoom: false },
    { fov: 45, near: 0.1, far: 100 }
  )
  particleCamera.setPosition(2, 0, 1)

  const particleScene = new ScrollScene({
    element: particleEl,
    scene: particleDrawable,
    camera: particleCamera,
    clipToViewport: false,
    useViewport: false,
    elementSpace: true,
    margin: 400
  })

  const u_delta = new Uniform({ name: 'u_delta', value: 0.016, kind: 'float' })

  const posData = new Float32Array(N * 3)
  const velData = new Float32Array(N * 3)
  const lifeData = new Float32Array(N)
  const seedData = new Float32Array(N)

  for (let i = 0; i < N; i++) {
    const angle = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI
    const speed = 0.002 + Math.random() * 0.004
    posData[i * 3] = 0.2
    velData[i * 3] = Math.sin(phi) * Math.cos(angle) * speed
    velData[i * 3 + 1] = Math.sin(phi) * Math.sin(angle) * speed
    velData[i * 3 + 2] = Math.cos(phi) * speed
    lifeData[i] = Math.random()
    seedData[i] = Math.random()
  }
  const seed = new GeometryAttribute({ size: 1, data: seedData })

  // The simulation advances every particle on the GPU each frame...
  const simulation = new TransformFeedback(gl, {
    program: new Program(gl, {
      vertex: simulateVert,
      fragment: simulateFrag,
      uniforms: { ...particleScene.uniforms, u_delta },
      transformFeedbackVaryings: ['v_position', 'v_velocity', 'v_life']
    }),
    attributes: {
      a_position: { data: posData, size: 3, varying: 'v_position' },
      a_velocity: { data: velData, size: 3, varying: 'v_velocity' },
      a_life: { data: lifeData, size: 1, varying: 'v_life' }
    },
    staticAttributes: { a_seed: seed }
  })

  // ...and the points are drawn from its latest results
  new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      a_position: simulation.attribute('a_position'),
      a_life: simulation.attribute('a_life'),
      a_seed: seed
    }),
    program: new Program(gl, {
      vertex: particlesVert,
      fragment: particlesFrag,
      uniforms: { ...particleScene.uniforms },
      transparent: true,
      depthWrite: false
    })
  }).setParent(particleDrawable)

  particleScene.onBeforeRender = (delta, rect) => {
    u_delta.value = Math.min(delta * 0.001, 0.05)
    simulation.step()
    particleCamera.perspective({ aspect: rect.width / rect.height })
    particleCamera.update()
  }

  scrollRenderer.addScene(particleScene)
}
