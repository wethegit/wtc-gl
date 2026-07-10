import {
  FragmentShader,
  Uniform,
  Triangle,
  Program,
  Mesh,
  Framebuffer
} from 'wtc-gl'

import fragment from './main.frag'
import vertex from './main.vert'
import renderFragment from './render.frag'

let mainFBO = null
let mainMesh = null

const mouse = { x: -100, y: -100 }
const u_mouse = new Uniform({
  name: 'u_mouse',
  value: [0, 0, 0, 0],
  kind: 'float_vec4'
})

const FSWrapper = new FragmentShader({
  fragment: renderFragment,
  vertex,
  rendererProps: { dpr: 2 },
  uniforms: {
    b_render: new Uniform({ name: 'render', value: null, kind: 'texture' }),
    u_mouse
  },
  onBeforeRender() {
    if (!mainFBO || !mainMesh) return

    const [prevX, prevY] = /** @type {number[]} */ (u_mouse.value)
    u_mouse.value = [
      mouse.x * renderer.dpr,
      (window.innerHeight - mouse.y) * renderer.dpr,
      prevX,
      prevY
    ]

    this.uniforms['b_render'].value = mainFBO.read.texture
    mainFBO.render(this.renderer, { scene: mainMesh })
    // After ping-pong, read now holds the new frame — update for the display pass
    this.uniforms['b_render'].value = mainFBO.read.texture
  }
})

const { gl, uniforms, renderer, dimensions } = FSWrapper

const geometry = new Triangle(gl)
const mainProgram = new Program(gl, { vertex, fragment, uniforms })
mainMesh = new Mesh(gl, { geometry, program: mainProgram })

mainFBO = new Framebuffer(gl, {
  dpr: renderer.dpr,
  name: 'render',
  width: dimensions.width,
  height: dimensions.height,
  texdepth: Framebuffer.TEXTYPE_FLOAT,
  tiling: Framebuffer.IMAGETYPE_MIRROR,
  type: gl.FLOAT,
  minFilter: gl.LINEAR,
  generateMipmaps: false
})

window.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
})
document.body.addEventListener('pointerleave', (e) => {
  const c = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const ma = Math.atan2(mouse.y - c.y, mouse.x - c.x)
  mouse.x = c.x + window.innerWidth * 2 * Math.cos(ma)
  mouse.y = c.y + window.innerHeight * 2 * Math.sin(ma)
})

window.addEventListener('resize', () => {
  mainFBO.resize(FSWrapper.dimensions.width, FSWrapper.dimensions.height)
})
