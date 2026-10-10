---
'wtc-gl': minor
---

Add `RenderTarget.resize(width, height)`. It reallocates the target's textures and depth/stencil buffer in place, keeping the same framebuffer and texture objects, so uniforms holding the textures stay valid. Previously a target had to be removed and recreated to change size.
