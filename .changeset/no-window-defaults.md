---
'wtc-gl': minor
---

Work without a `window` or `document` when given a canvas, e.g. in a worker, under SSR or in tests:

- `FragmentShader` and `ParticleSimulation` default `container` to `null` (don't append the canvas) when there's no document, instead of throwing on `document.body`. `container: null` can also be passed explicitly.
- `Renderer` and `Framebuffer` default `dpr` to 1 when there's no `devicePixelRatio`.
- `GeometryAttribute` no longer reads `window.WebGLRenderingContext` to pick its default `type`.
- `Geometry.computeBoundingBox` and `computeBoundingSphere` handle 2D positions (`size: 2`), treating z as 0. They used to read the next vertex's x as z.
