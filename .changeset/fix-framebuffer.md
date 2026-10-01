---
'wtc-gl': patch
---

Fix `Framebuffer` and `RenderTarget` bugs:

- `Framebuffer.IMAGETYPE_TILING` and `IMAGETYPE_MIRROR` were swapped. `TILING` now uses `REPEAT` and `MIRROR` uses `MIRRORED_REPEAT`. If you used `IMAGETYPE_MIRROR` and relied on it wrapping around, switch to `IMAGETYPE_TILING`.
- `Framebuffer` with `generateMipmaps: true` now generates mipmaps for the texture it just rendered to, instead of whichever texture happened to be bound.
- Creating a `RenderTarget` no longer leaves the renderer's cached framebuffer binding out of date. Previously, rendering again into the last-used target after creating a new one could draw to the canvas instead.
