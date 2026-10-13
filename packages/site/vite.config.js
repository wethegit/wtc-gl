import { defineConfig } from 'vite'
import { resolve } from 'path'
import glsl from 'vite-plugin-glsl'
import react from '@vitejs/plugin-react'

const resolvePath = (str) => resolve(__dirname, str)

// Dev server for the demos site. Workspace packages are aliased to their
// source so changes hot-reload without a library build.
export default defineConfig({
  plugins: [glsl(), react()],
  // Multi-page: unknown paths 404 instead of falling back to the root
  // index.html, whose relative redirect to demos/ would then loop forever
  appType: 'mpa',
  resolve: {
    alias: {
      'wtc-gl': resolvePath('../wtc-gl/src/index.ts'),
      '@wethegit/react-wtc-gl': resolvePath('../react/src/index.ts')
    },
    dedupe: ['react', 'react-dom']
  },
  server: { host: true }
})
