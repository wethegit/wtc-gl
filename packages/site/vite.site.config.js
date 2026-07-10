import { defineConfig } from 'vite'
import { resolve } from 'path'
import glsl from 'vite-plugin-glsl'
import react from '@vitejs/plugin-react'

const resolvePath = (str) => resolve(__dirname, str)

export default defineConfig({
  plugins: [glsl(), react()],
  base: '/wtc-gl/',
  resolve: {
    alias: {
      'wtc-gl': resolvePath('../wtc-gl/src/index.ts'),
      '@wethegit/react-wtc-gl': resolvePath('../react/src/index.ts')
    },
    dedupe: ['react', 'react-dom']
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
        reactScrollRenderer: resolvePath(
          'demos/react-scroll-renderer/index.html'
        ),
        reactDragWorld: resolvePath('demos/react-drag-world/index.html'),
        reactDragWorldInfinite: resolvePath(
          'demos/react-drag-world-infinite/index.html'
        ),
        transformFeedback: resolvePath('demos/transformFeedback/index.html'),
        videoTex: resolvePath('demos/videoTex/index.html'),
        webcamCa: resolvePath('demos/webcam-ca/index.html'),
        raymarchingWebgl2: resolvePath('demos/raymarching-webgl2/index.html'),
        scrollBlades: resolvePath('demos/scroll-blades/index.html'),
      }
    }
  }
})
