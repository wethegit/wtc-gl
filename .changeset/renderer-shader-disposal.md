---
'wtc-gl': minor
---

Add teardown for renderers and fragment shaders:

- `Renderer.dispose()` clears the renderer's state caches. If the renderer created its own canvas, it also releases the WebGL context straight away. A canvas passed in through the `canvas` option keeps its context, so a new renderer can still use it.
- `FragmentShader.destroy()` stops the render loop, removes the `resize` listener, deletes the geometry and program, and disposes the renderer. A canvas the renderer created is removed from the DOM; it's returned either way. A `post` framebuffer is left for the caller to remove.
- `FragmentShader.playing = false` now cancels the pending animation frame, so one more frame no longer renders after pausing.
- `Program.remove()` now drops its uniform values from the renderer's cache.
- `ScrollRenderer.destroy()` now calls `Renderer.dispose()`.
- `FragmentShader`'s `rendererProps` option is now typed as `Partial<RendererOptions>` instead of `object`.
