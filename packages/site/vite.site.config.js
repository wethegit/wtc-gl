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
        cameraInstancing: resolvePath('demos/camera-and-instancing/index.html'),
        fragmentShader: resolvePath('demos/fragment-shader/index.html'),
        framebuffer: resolvePath('demos/framebuffer/index.html'),
        scrollImageCloth: resolvePath('demos/scroll-image-cloth/index.html'),
        scrollRendererHomepage: resolvePath(
          'demos/scroll-renderer-homepage/index.html'
        ),
        scrollRendererBasic: resolvePath(
          'demos/scroll-renderer-basic/index.html'
        ),
        scrollRendererOld: resolvePath('demos/scroll-renderer/index.html'),
        reactScrollRenderer: resolvePath(
          'demos/react-scroll-renderer/index.html'
        ),
        reactManifoldDivider: resolvePath(
          'demos/react-manifold-divider/index.html'
        ),
        reactDragWorld: resolvePath('demos/react-drag-world/index.html'),
        reactDragWorldInfinite: resolvePath(
          'demos/react-drag-world-infinite/index.html'
        ),
        transformFeedback: resolvePath('demos/transform-feedback/index.html'),
        videoTexture: resolvePath('demos/video-texture/index.html'),
        webcamCa: resolvePath('demos/webcam-ca/index.html'),
        raymarchingWebgl2: resolvePath('demos/raymarching-webgl2/index.html'),
        scrollBlades: resolvePath('demos/scroll-blades/index.html'),
        stencilDepth: resolvePath('demos/stencil-depth/index.html'),
        manyMeshes: resolvePath('demos/many-meshes/index.html'),
        manifoldMandala: resolvePath('demos/manifold-mandala/index.html'),
        progressiveRender: resolvePath('demos/progressive-render/index.html'),
        lines: resolvePath('demos/lines/index.html'),
        particleTrails: resolvePath('demos/particle-trails/index.html')
      }
    }
  }
})
