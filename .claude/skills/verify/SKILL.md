---
name: verify
description: Build, run, and drive the wtc-gl demos site to verify library changes end-to-end.
---

# Verifying wtc-gl changes

Library changes (packages/wtc-gl, packages/react) have no runnable surface of
their own - they're verified through the demos site, which aliases both
packages to **source** (`packages/site/vite.config.js`), so no library build
is needed for runtime verification.

## Build checks

- React package: `pnpm --filter @wethegit/react-wtc-gl build` (tsc + vite + dts)
- Core package: `pnpm --filter wtc-gl build`
- Site (compiles every demo): `pnpm --filter wtc-gl-site build`
  - New demos must be added to `rollupOptions.input` in
    `packages/site/vite.site.config.js` AND get a card in
    `packages/site/demos/index.html`.

## Run + drive

```sh
cd packages/site && pnpm dev --port 5199 --strictPort   # background
# demo URLs: http://localhost:5199/demos/<demo-dir>/
```

Playwright 1.60 is installed globally (`/home/liamegan/npm/lib/node_modules/playwright`)
with Chromium cached. NODE_PATH doesn't work for ESM - import by absolute path:

```js
import { chromium } from '/home/liamegan/npm/lib/node_modules/playwright/index.mjs'
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] // software WebGL works
})
```

Capture `page.on('console')` and `page.on('pageerror')` - the wtc-gl engine
warns (not throws) on shader/uniform problems ("Active uniform X has not been
supplied"), so a visually-fine page can still be logging per-frame warnings.

## Gotchas

- Demos run under `<StrictMode>` - double-mount bugs (duplicate meshes,
  leaked GL resources) show up as visual artifacts or console errors here.
- WebGL renders headlessly with the flags above; screenshots are reliable
  evidence of shader output.
- The site package has no tsconfig/d.ts - `.frag` imports show IDE
  diagnostics in demo files; vite-plugin-glsl handles them at runtime
  (pre-existing, all demos).
