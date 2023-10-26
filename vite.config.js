import { defineConfig } from "vite"
import { resolve } from "path"
import glsl from "vite-plugin-glsl"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [glsl()],
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      // eslint-disable-next-line no-undef
      entry: resolve(__dirname, "src/lib/index.ts"),
      name: "WTCGL",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["wtc-math"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          'wtc-math': "wtcMath",
        },
      },
    },
  },
})
