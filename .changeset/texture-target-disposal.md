---
'wtc-gl': minor
---

Add disposal for textures and render targets, and fix a GPU memory leak in `Framebuffer`:

- `Texture.remove()` deletes the WebGL texture and clears it from the renderer's texture-unit cache.
- `RenderTarget.remove()` deletes the framebuffer and its colour and depth textures. If the target is bound, the canvas is bound in its place.
- `Framebuffer.remove()` deletes both ping-pong targets.
- `Framebuffer.resize()` now frees the previous targets. It used to create two new ones on every resize and never delete the old ones. If you keep a reference to `fbo.read.texture` across a resize, read it again after resizing.
