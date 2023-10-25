import { FragmentShader, Texture, Uniform } from './lib'

import './style.css'

import fragment from './main.frag'
import vertex from './main.vert'

console.clear()

// Create the fragment shader wrapper
const FSWrapper = new FragmentShader({
  fragment: fragment,
  vertex
})

const { gl, uniforms } = FSWrapper

// Create the texture
const texture = new Texture(gl, {
  wrapS: gl.REPEAT,
  wrapT: gl.REPEAT
})

// Load the image into the uniform
const img = new Image()
img.crossOrigin = 'anonymous'
img.src = 'https://assets.codepen.io/982762/noise.png'
img.onload = () => (texture.image = img)

uniforms.s_noise = new Uniform({
  name: 'noise',
  value: texture,
  kind: 'texture'
})
