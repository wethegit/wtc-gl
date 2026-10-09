---
'wtc-gl': minor
---

Fix fields that could be read before they were set. The library is now compiled with `strictPropertyInitialization`.

- `Renderer` now throws `Unable to create a WebGL context` when it can't get one. It used to log an error and return a half-built renderer, which threw as soon as it was used.
- `Camera.frustum` is created up front, so `frustumIntersects` no longer throws when called before `updateFrustum`.
- `ParticleSimulation` throws a clear error if a custom `createGeometry` doesn't set `this.cloud`.
- `GeometryAttribute.updateAttribute` does nothing until the attribute has been added to a geometry, instead of uploading to a missing buffer.
- `Framebuffer` keeps its default size (512) and pixel ratio (1) when given 0 or a negative value, instead of leaving them undefined.
- `Texture.width`/`height` default to `0` and `Texture.data` to `null` instead of `undefined`. `RenderTarget.stencil` is `false`.

TypeScript changes. These may need small updates in typed code:

- Now optional: `Drawable.program` (a plain `Drawable` used as a group has none; `Mesh.program` is still required), `Geometry.bounds` (unset until computed), `Geometry.transformFeedbacks`, `Texture.image` and `ParticleSimulation.cloud`.
- `GeometryAttribute.buffer` and `WTCGLGeometryAttribute.buffer` are `WebGLBuffer | null`.
- `FragmentShader.post` and `ParticleSimulation.post` are typed `Framebuffer | null`.
- `Geometry.computeBoundingBox()` now returns the bounds.
- Removed unused fields that were never set: `Texture.glState`, `Geometry.glState`, and `RenderTarget.depthBuffer`, `stencilBuffer` and `depthStencilBuffer`.
