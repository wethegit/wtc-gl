import { Texture, Drawable, ScrollScene, Mesh, Triangle, Program } from 'wtc-gl'
import vert from './default.vert'

export const makeTexture = (gl, data, size) => {
  const tex = new Texture(gl, {
    image: data,
    width: size,
    height: size,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    generateMipmaps: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR
  })
  tex.needsUpdate = true
  return tex
}

// 0 when element top is at viewport bottom, 1 when element bottom is at viewport top
export const scrollProgress = (rect) =>
  Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)))

export const smoothstep = (a, b, t) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

export const makeScene = (gl, element, fragShader, extraUniforms = {}) => {
  const scene = new Drawable(gl)
  const scrollScene = new ScrollScene({ element, scene })
  new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex: vert,
      fragment: fragShader,
      uniforms: { ...scrollScene.uniforms, ...extraUniforms },
      transparent: true
    })
  }).setParent(scene)
  return scrollScene
}
