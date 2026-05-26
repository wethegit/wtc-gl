import {
  ScrollRenderer,
  ScrollScene,
  ScrollImage,
  Drawable,
  Mesh,
  Triangle,
  Program,
  Uniform
} from '../../src/lib'

import vert from './default.vert'
import bgFrag from './bg.frag'
import imageFrag from './image.frag'

// ── Renderer ─────────────────────────────────────────────────────────────────

const renderer = new ScrollRenderer({
  rendererProps: { antialias: true, premultipliedAlpha: false }
})
renderer.canvas.classList.add('scroll-canvas')
document.body.appendChild(renderer.canvas)

const { gl } = renderer

// ── Background scene (fixed full-viewport element) ───────────────────────────

const bgEl = document.querySelector('.bg-scene')
const bgDrawable = new Drawable(gl)
const bgScene = new ScrollScene({ element: bgEl, scene: bgDrawable })

new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: vert,
    fragment: bgFrag,
    uniforms: { ...bgScene.uniforms },
    depthTest: false
  })
}).setParent(bgDrawable)

renderer.addScene(bgScene)

// ── Image scenes (one ScrollImage per blade) ──────────────────────────────────

// 0 when element top reaches viewport bottom, 1 when element bottom leaves viewport top
const scrollProgress = (rect) => {
  const entered = window.innerHeight - rect.top
  const total = window.innerHeight + rect.height
  return Math.max(0, Math.min(1, entered / total))
}

document.querySelectorAll('.blade-img').forEach((imgEl) => {
  const drawable = new Drawable(gl)
  const scene = new ScrollImage({
    gl,
    element: imgEl,
    scene: drawable,
    clearOnRender: false
  })

  const u_scroll = new Uniform({ name: 'u_scroll', value: 0.5, kind: 'float' })
  const u_mouse = new Uniform({
    name: 'u_mouse',
    value: [0.5, 0.5],
    kind: 'float_vec2'
  })
  scene.uniforms.u_scroll = u_scroll
  scene.uniforms.u_mouse = u_mouse

  new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex: vert,
      fragment: imageFrag,
      uniforms: { ...scene.uniforms },
      // depthTest: false,
      transparent: true
    })
  }).setParent(drawable)

  // Smooth mouse tracking
  let mouseTarget = [0.5, 0.5]
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

  scene.onBeforeRender = (delta, rect) => {
    u_scroll.value = scrollProgress(rect)
    const k = 1 - Math.exp(-delta * 0.006)
    const [mx, my] = u_mouse.value
    u_mouse.value = [
      mx + (mouseTarget[0] - mx) * k,
      my + (mouseTarget[1] - my) * k
    ]
  }

  renderer.addScene(scene)
})

renderer.playing = true

// Debug toggle — swap between WebGL canvas and raw images
const debugBtn = document.getElementById('debug-toggle')
debugBtn.addEventListener('click', () => {
  const isDebug = debugBtn.classList.toggle('is-active')
  renderer.canvas.style.display = isDebug ? 'none' : ''
  document.body.classList.toggle('debug', isDebug)
  debugBtn.textContent = isDebug ? 'DOM' : 'WebGL'
})
