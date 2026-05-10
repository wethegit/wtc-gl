import { FragmentShader, Uniform } from '../../src/lib'
import fragment from './demo.frag'
import vertex from '../fs.vert'

const u_mouse = new Uniform({
  name: 'u_mouse',
  value: [0, 0],
  kind: 'float_vec2'
})

const fs = new FragmentShader({
  fragment,
  vertex,

  uniforms: { u_mouse }
})
fs.gl.canvas.classList.add('hero-canvas')

window.addEventListener('mousemove', (e) => {
  u_mouse.value = [
    e.clientX * window.devicePixelRatio,
    (window.innerHeight - e.clientY) * window.devicePixelRatio
  ]
})
