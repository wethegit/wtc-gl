---
'wtc-gl': minor
---

Recover from WebGL context loss:

- `Renderer` now handles `webglcontextlost` and `webglcontextrestored` on its canvas. While the context is lost, `renderer.contextLost` is `true` and `render()` does nothing. When it's restored, the renderer resets its state and rebuilds every `Program`, `Texture`, `Geometry`, `RenderTarget` and `TransformFeedback` that hasn't been removed.
- New `renderer.onContextLost` and `renderer.onContextRestored` callbacks, e.g. to show a fallback while the context is gone.
- New `renderer.track(resource)` / `untrack(resource)` to rebuild your own GL objects on restore. A resource is any object with a `restoreContext()` method. Library resources register themselves and unregister in `remove()`. The renderer only holds them weakly, so keep your own reference to anything you track.
- Each of those classes has a `restoreContext()` method, called by the renderer.
- What's lost: render target contents, and transform feedback state, which restarts from each attribute's initial `data`. Buffers passed to `TransformFeedback` through the `buffer` option can't be rebuilt and must be recreated by the caller.
- `TransformFeedback`'s `program` option now accepts the `Program` as well as its `WebGLProgram`. Pass the `Program` so the feedback can be relinked after a restore.
- `Renderer.dispose()` removes the context listeners.
