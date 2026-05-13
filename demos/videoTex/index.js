import { FragmentShader, Texture, Uniform } from '../../src/lib'

import fragment from './main.frag'
import vertex from './main.vert'

const initWebgl = (video) => {
  const FSWrapper = new FragmentShader({
    fragment,
    vertex,
    rendererProps: { alpha: false, premultipliedAlpha: false },
    onBeforeRender: () => {
      videoTexture.needsUpdate = true
    }
  })

  const { gl, uniforms } = FSWrapper

  const videoTexture = new Texture(gl, {
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    image: video,
    generateMipmaps: false
  })

  uniforms.s_smoke = new Uniform({ name: 'smoke', value: videoTexture, kind: 'texture' })

  const u_mouse = new Uniform({ name: 'u_mouse', value: [0, 0], kind: 'float_vec2' })
  uniforms.u_mouse = u_mouse
  window.addEventListener('mousemove', (e) => {
    u_mouse.value = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]
  })
}

const video = document.createElement('video')
video.autoplay = true
video.loop = true
video.muted = true
video.playsInline = true
video.src = './smoke.mp4'
video.addEventListener('canplaythrough', () => {
  video.play()
  initWebgl(video)
})
