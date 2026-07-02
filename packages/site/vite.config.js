import { defineConfig } from 'vite'
import { resolve } from 'path'
import glsl from 'vite-plugin-glsl'

const resolvePath = (str) => resolve(__dirname, str)

// Dev server for the demos site. `import ... from 'wtc-gl'` in the demos is
// aliased to the workspace package source so changes hot-reload without a
// library build.
export default defineConfig({
  plugins: [glsl()],
  resolve: {
    alias: {
      'wtc-gl': resolvePath('../wtc-gl/src/index.ts')
    }
  }
})
