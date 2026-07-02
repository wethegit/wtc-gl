import {
  ScrollScene,
  Drawable,
  Mesh,
  Program,
  Uniform,
  TransformFeedback,
  PointCloud,
  DollyCamera
} from 'wtc-gl'
import particlesVert from './particles.vert'
import particlesFrag from './particles.frag'

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

  const particleProgram = new Program(gl, {
    vertex: particlesVert,
    fragment: particlesFrag,
    uniforms: { ...particleScene.uniforms, u_delta },
    transformFeedbackVaryings: ['v_position', 'v_velocity', 'v_life', 'v_seed'],
    transparent: true,
    depthWrite: false
  })

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

  const tf = new TransformFeedback(gl, {
    program: particleProgram.program,
    transformFeedbacks: {
      a_position: {
        data: posData,
        size: 3,
        usage: gl.DYNAMIC_COPY,
        varying: 'v_position'
      },
      a_velocity: {
        data: velData,
        size: 3,
        usage: gl.DYNAMIC_COPY,
        varying: 'v_velocity'
      },
      a_life: {
        data: lifeData,
        size: 1,
        usage: gl.DYNAMIC_COPY,
        varying: 'v_life'
      },
      a_seed: {
        data: seedData,
        size: 1,
        usage: gl.STATIC_DRAW,
        varying: 'v_seed'
      }
    }
  })

  new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new PointCloud(gl, {
      particles: N,
      dimensions: 3,
      transformFeedbacks: tf
    }),
    program: particleProgram
  }).setParent(particleDrawable)

  particleScene.onBeforeRender = (delta, rect) => {
    u_delta.value = Math.min(delta * 0.001, 0.05)
    particleCamera.perspective({ aspect: rect.width / rect.height })
    particleCamera.update()
  }

  scrollRenderer.addScene(particleScene)
}
