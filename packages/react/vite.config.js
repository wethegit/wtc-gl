import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

// eslint-disable-next-line no-undef
const resolvePath = (str) => resolve(__dirname, str)

export default defineConfig({
  plugins: [
    dts({
      include: 'src'
    })
  ],
  build: {
    copyPublicDir: false,
    lib: {
      entry: resolvePath('src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: 'react-wtc-gl'
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'wtc-gl', 'wtc-math']
    }
  }
})
