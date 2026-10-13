import { FragmentShader, VideoTexture, Uniform } from 'wtc-gl'

import fragment from './main.frag'
import vertex from './main.vert'

const video = document.createElement('video')
video.autoplay = true
video.loop = true
video.muted = true
video.playsInline = true
video.src = './smoke.mp4'
// autoplay doesn't always start a video that isn't in the document
video.play()

const FSWrapper = new FragmentShader({
  fragment,
  vertex,
  rendererProps: { alpha: false, premultipliedAlpha: false }
})

const { gl, uniforms } = FSWrapper

// Uploads a new frame whenever the video presents one, and an empty pixel
// until it has loaded
const videoTexture = new VideoTexture(gl, {
  video,
  wrapS: gl.REPEAT,
  wrapT: gl.REPEAT
})

uniforms.s_smoke = new Uniform({ name: 'smoke', value: videoTexture, kind: 'texture' })

const u_mouse = new Uniform({ name: 'u_mouse', value: [0, 0], kind: 'float_vec2' })
uniforms.u_mouse = u_mouse
window.addEventListener('mousemove', (e) => {
  u_mouse.value = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight]
})
