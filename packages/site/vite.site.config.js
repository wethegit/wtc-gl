import { defineConfig } from 'vite'
import { resolve } from 'path'
import glsl from 'vite-plugin-glsl'

const resolvePath = (str) => resolve(__dirname, str)

export default defineConfig({
  plugins: [glsl()],
  base: '/wtc-gl/',
  resolve: {
    alias: {
      'wtc-gl': resolvePath('../wtc-gl/src/index.ts')
    }
  },
  build: {
    outDir: 'dist-site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        root: resolvePath('index.html'),
        demosIndex: resolvePath('demos/index.html'),
        cameraInstancing: resolvePath('demos/Camera-and-instancing/index.html'),
        fragmentShader: resolvePath('demos/fragment-shader/index.html'),
        framebuffer: resolvePath('demos/framebuffer/index.html'),
        scrollImageCloth: resolvePath('demos/scroll-image-cloth/index.html'),
        scrollRendererHomepage: resolvePath('demos/scroll-renderer-homepage/index.html'),
        scrollRenderer: resolvePath('demos/scrollRenderer/index.html'),
        scrollRendererOld: resolvePath('demos/scroll-renderer/index.html'),
        transformFeedback: resolvePath('demos/transformFeedback/index.html'),
        videoTex: resolvePath('demos/videoTex/index.html'),
        webcamCa: resolvePath('demos/webcam-ca/index.html'),
        raymarchingWebgl2: resolvePath('demos/raymarching-webgl2/index.html'),
        scrollBlades: resolvePath('demos/scroll-blades/index.html'),
      }
    }
  }
})
