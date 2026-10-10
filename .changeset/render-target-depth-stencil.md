---
'wtc-gl': minor
---

`RenderTarget` now honours its `stencil` and `depthTexture` options, and adds `depthFormat`:

- `stencil: true` gives the target a stencil buffer. With `depth`, the two share a `DEPTH24_STENCIL8` texture or renderbuffer; on its own it's a `STENCIL_INDEX8` renderbuffer.
- `depthTexture: false` uses a renderbuffer (`target.depthBuffer`) instead of a depth texture, and a `Texture` can be passed to use as the depth texture. A texture passed in isn't deleted by `remove()`.
- The depth texture now defaults to `DEPTH_COMPONENT24` under WebGL2 instead of `DEPTH_COMPONENT16`, which z-fought on coplanar faces. Set `depthFormat` to choose another (e.g. `gl.DEPTH_COMPONENT32F`).
- When rendering to a target, `Renderer.render` now clears the target's own depth and stencil buffers rather than going by the renderer's `depth` and `stencil` settings.
