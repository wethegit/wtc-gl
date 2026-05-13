import {
  FragmentShader,
  Uniform,
  Triangle,
  Program,
  Mesh,
  Framebuffer,
  Texture
} from '../../src/lib'

import simFragment from './sim.frag'
import renderFragment from './render.frag'
import vertex from './main.vert'

let caFBO = null
let simMesh = null
let webcamTexture = null

// Shared uniform references — updated each frame in onBeforeRender
const u_state = new Uniform({ name: 'state', value: null, kind: 'texture' })
const u_webcam = new Uniform({ name: 'webcam', value: null, kind: 'texture' })
const u_camResolution = new Uniform({
  name: 'camResolution',
  value: [1280, 720],
  kind: 'float_vec2'
})

const FSWrapper = new FragmentShader({
  fragment: renderFragment,
  vertex,
  rendererProps: { dpr: 2 },
  uniforms: { b_state: u_state, b_webcam: u_webcam, u_camResolution },
  onBeforeRender() {
    if (!caFBO || !simMesh) return

    // Mark webcam texture dirty so the GPU uploads the new video frame
    if (webcamTexture) webcamTexture.needsUpdate = true

    // Point sim shader at the current read buffer
    u_state.value = caFBO.read.texture
    u_webcam.value = webcamTexture

    // Run one CA generation into the write buffer, then swap
    caFBO.render(this.renderer, { scene: simMesh })

    // After swap, read now holds the just-computed generation
    u_state.value = caFBO.read.texture
  }
})

const { gl, uniforms, renderer, dimensions } = FSWrapper

// Sim pass — shares uniforms so it gets u_resolution, u_time, b_state, b_webcam
const geometry = new Triangle(gl)
const simProgram = new Program(gl, { vertex, fragment: simFragment, uniforms })
simMesh = new Mesh(gl, { geometry, program: simProgram })

// CA runs at CSS-pixel resolution (dpr:1) so u_resolution in the sim shader matches
caFBO = new Framebuffer(gl, {
  dpr: 2,
  name: 'state',
  width: dimensions.width,
  height: dimensions.height,
  texdepth: Framebuffer.TEXTYPE_UNSIGNED_BYTE,
  tiling: Framebuffer.IMAGETYPE_MIRROR,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  generateMipmaps: false,
  depth: false
})

// Placeholder 1×1 black texture so shaders work before camera is ready
const placeholderData = new Uint8Array([0, 0, 0, 255])
webcamTexture = new Texture(gl, {
  data: placeholderData,
  width: 1,
  height: 1,
  generateMipmaps: false,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  wrapS: gl.CLAMP_TO_EDGE,
  wrapT: gl.CLAMP_TO_EDGE
})

async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    const video = document.createElement('video')
    video.srcObject = stream
    video.autoplay = true
    video.playsInline = true
    video.muted = true
    await video.play()
    u_camResolution.value = [video.videoWidth, video.videoHeight]

    webcamTexture = new Texture(gl, {
      image: video,
      generateMipmaps: false,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      flipY: true
    })
  } catch (e) {
    console.warn('Webcam unavailable — running with random seeding only:', e)
  }
}

initWebcam()

window.addEventListener('resize', () => {
  caFBO.resize(FSWrapper.dimensions.width, FSWrapper.dimensions.height)
})
