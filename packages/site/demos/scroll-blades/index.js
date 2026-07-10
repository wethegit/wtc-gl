import {
  ScrollRenderer,
  ScrollScene,
  ScrollImage,
  Drawable,
  Mesh,
  Triangle,
  Program,
  Uniform,
  TransformFeedback,
  Geometry,
  GeometryAttribute
} from 'wtc-gl'

import defaultVert from './default.vert'
import bgFrag from './bg.frag'
import imageVert from './image.vert'
import imageFrag from './image.frag'

// Renderer
const renderer = new ScrollRenderer({
  rendererProps: { antialias: true, premultipliedAlpha: false }
})
renderer.canvas.classList.add('scroll-canvas')
document.body.appendChild(renderer.canvas)

const { gl } = renderer

// Background scene
const bgEl = document.querySelector('.bg-scene')
const bgDrawable = new Drawable(gl)
const bgScene = new ScrollScene({ element: bgEl, scene: bgDrawable })

new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: defaultVert,
    fragment: bgFrag,
    uniforms: { ...bgScene.uniforms },
    depthTest: false
  })
}).setParent(bgDrawable)

renderer.addScene(bgScene)

// Scroll velocity tracking
let scrollVelG = 0
let lastScrollYG = window.scrollY

window.addEventListener(
  'scroll',
  () => {
    scrollVelG = window.scrollY - lastScrollYG
    lastScrollYG = window.scrollY
  },
  { passive: true }
)
;(function decayTick() {
  scrollVelG *= 0.85
  requestAnimationFrame(decayTick)
})()

// Grid builder - basically an extension of the plane geometry that allows for resting position and velocity properties
function buildGrid(cols, rows) {
  const vCount = cols * rows * 6
  const positions = new Float32Array(vCount * 2)
  const velocities = new Float32Array(vCount * 2)
  const restPositions = new Float32Array(vCount * 2)

  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c / cols,
        x1 = (c + 1) / cols
      const y0 = 1 - r / rows,
        y1 = 1 - (r + 1) / rows
      // Two triangles per quad (counter-clockwise)
      const verts = [
        [x0, y0],
        [x0, y1],
        [x1, y0],
        [x0, y1],
        [x1, y1],
        [x1, y0]
      ]
      for (const [x, y] of verts) {
        positions[i * 2] = x
        positions[i * 2 + 1] = y
        restPositions[i * 2] = x
        restPositions[i * 2 + 1] = y
        i++
      }
    }
  }

  return { positions, velocities, restPositions, vCount }
}

// Image scenes
document.querySelectorAll('.blade-img').forEach((imgEl) => {
  const drawable = new Drawable(gl)
  const scene = new ScrollImage({
    gl,
    element: imgEl,
    scene: drawable,
    useViewport: false,
    clipToViewport: false,
    elementSpace: true
  })

  const { positions, velocities, restPositions } = buildGrid(24, 18)

  const u_delta = new Uniform({ name: 'u_delta', value: 16, kind: 'float' })
  const u_scrollVel = new Uniform({
    name: 'u_scrollVel',
    value: 0,
    kind: 'float'
  })
  const u_mouse = new Uniform({
    name: 'u_mouse',
    value: [0.5, 0.5],
    kind: 'float_vec2'
  })

  const program = new Program(gl, {
    vertex: imageVert,
    fragment: imageFrag,
    uniforms: { ...scene.uniforms, u_delta, u_scrollVel, u_mouse },
    transformFeedbackVaryings: ['v_position', 'v_velocity'],
    transparent: true
  })

  const tf = new TransformFeedback(gl, {
    program: program.program,
    transformFeedbacks: {
      a_position: {
        data: positions,
        size: 2,
        usage: gl.STREAM_COPY,
        varying: 'v_position'
      },
      a_velocity: {
        data: velocities,
        size: 2,
        usage: gl.STREAM_COPY,
        varying: 'v_velocity'
      }
    }
  })

  // a_restPos is constant, add it to both TF VAOs at layout location 2
  const restPosBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, restPosBuf)
  gl.bufferData(gl.ARRAY_BUFFER, restPositions, gl.STATIC_DRAW)
  tf.VAOs.forEach((vao) => {
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, restPosBuf)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0)
  })
  gl.bindVertexArray(null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)

  // Create the custom plane geo
  const geometry = new Geometry(
    gl,
    {
      a_position: new GeometryAttribute({ size: 2, data: positions }),
      a_velocity: new GeometryAttribute({ size: 2, data: velocities }),
      a_restPos: new GeometryAttribute({ size: 2, data: restPositions })
    },
    tf
  )

  new Mesh(gl, { geometry, program }).setParent(drawable)

  let mouseTarget = [0.5, 0.5]
  let smoothMouse = [0.5, 0.5]
  const mediaEl = imgEl.parentElement

  mediaEl.addEventListener('mousemove', (e) => {
    const r = mediaEl.getBoundingClientRect()
    mouseTarget = [
      (e.clientX - r.left) / r.width,
      1 - (e.clientY - r.top) / r.height
    ]
  })
  mediaEl.addEventListener('mouseleave', () => {
    mouseTarget = [0.5, 0.5]
  })

  scene.onBeforeRender = (delta) => {
    const k = 1 - Math.exp(-delta * 0.006)
    smoothMouse = [
      smoothMouse[0] + (mouseTarget[0] - smoothMouse[0]) * k,
      smoothMouse[1] + (mouseTarget[1] - smoothMouse[1]) * k
    ]
    u_delta.value = delta
    u_scrollVel.value = scrollVelG
    u_mouse.value = smoothMouse
  }

  renderer.addScene(scene)
})

renderer.playing = true

// Debug toggle, swap between WebGL canvas and raw images
const debugBtn = document.getElementById('debug-toggle')
debugBtn.addEventListener('click', () => {
  const isDebug = debugBtn.classList.toggle('is-active')
  renderer.canvas.style.display = isDebug ? 'none' : ''
  document.body.classList.toggle('debug', isDebug)
  debugBtn.textContent = isDebug ? 'DOM' : 'WebGL'
})
