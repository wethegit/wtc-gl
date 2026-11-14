import { defineConfig } from 'vite'
import { resolve } from 'path'
import glsl from 'vite-plugin-glsl'
import react from '@vitejs/plugin-react'

const resolvePath = (str) => resolve(__dirname, str)

// The docs run on their own VitePress dev server (`pnpm docs:dev`). When
// published they sit next to the demos at /docs/, so in development send
// /docs links there instead of 404ing.
const docsPort = process.env.DOCS_PORT ?? 5273
const docsRedirect = {
  name: 'docs-redirect',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!/^\/docs(\/|$)/.test(req.url ?? '')) return next()
      const path = req.url.replace(/^\/docs/, '')
      res.statusCode = 302
      res.setHeader(
        'Location',
        `http://localhost:${docsPort}/wtc-gl/docs${path || '/'}`
      )
      res.end()
    })
  }
}

// Dev server for the demos site. Workspace packages are aliased to their
// source so changes hot-reload without a library build.
export default defineConfig({
  plugins: [glsl(), react(), docsRedirect],
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
