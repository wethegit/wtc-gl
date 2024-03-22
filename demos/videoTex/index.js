import { FragmentShader, Texture, Uniform } from '../../src/lib'

import '../style.css'

import fragment from './main.frag'
import vertex from './main.vert'

const initWebgl = (video) => {
  // Create the fragment shader wrapper
  const FSWrapper = new FragmentShader({
    fragment,
    vertex,
    rendererProps: { alpha: true, premultipliedAlpha: false },
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

  uniforms.s_smoke = new Uniform({
    name: 'smoke',
    value: videoTexture,
    kind: 'texture'
  })
}

// Create the video element
const video = document.createElement('video')
video.autoplay = true
video.loop = true
video.muted = true
video.crossOrigin = true
video.src = 'https://assets.codepen.io/982762/smoke.mp4'
video.addEventListener('canplaythrough', () => {
  video.play()
  initWebgl(video)
  // videoTexture.image = video;
})
