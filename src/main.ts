import { FragmentShader, Texture, Uniform } from './lib'

import './style.css'

import fragment from './main.frag'
import vertex from './main.vert'

async function init() {
  // Create the fragment shader wrapper
  const { gl, uniforms } = new FragmentShader({
    fragment: fragment,
    vertex
  })

  // Load the image into the uniform
  const image: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image()

    img.src = '/noise.png'
    img.onload = () => resolve(img)
    img.onerror = reject
  })

  // Create the texture
  const texture = new Texture(gl, {
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    image: image
  })

  uniforms.s_noise = new Uniform({
    name: 'noise',
    value: texture,
    kind: 'texture'
  })
}

init()
