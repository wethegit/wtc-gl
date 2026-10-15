---
'wtc-gl': major
---

Require WebGL2. `Renderer` now only asks for a `webgl2` context and throws `Unable to create a WebGL2 context` if it can't get one. It no longer falls back to WebGL1, which was already broken for image textures.

**Migrating**

- **`webgl` option removed.** Delete `webgl: 1` / `webgl: 2` from `new Renderer({...})`.
- **`renderer.isWebgl2` removed.** It was always true for working code. Remove the checks.
- **Extension aliases removed.** `renderer.vertexAttribDivisor`, `drawArraysInstanced`, `drawElementsInstanced`, `createVertexArray`, `deleteVertexArray` and `drawBuffers` are gone. Call the same methods on `gl` instead, e.g. `gl.drawBuffers([...])`.
- **`renderer.bindVertexArray(vao, key?)`** still exists, but now also resets `renderer.currentGeometry` (or sets it to `key`), so a VAO you bind yourself doesn't stop the next `Geometry` draw from binding its own. Use it, rather than `gl.bindVertexArray`, for VAOs you bind between wtc-gl draws.
- **`renderer.getExtension(name)`** takes just the extension name and returns the extension object or `null`. The second and third arguments (the WebGL2 function name and WebGL1 alias) are gone. Known WebGL2 extensions are typed through the new `WTCGLExtensionMap`. Lookups are cached per context, and the cache is cleared when the context is restored.
- **`renderer.extensions` removed.** Use `renderer.getExtension(name)`.
- **Types:** `WTCGLRenderingContext` is now `WebGL2RenderingContext & { renderer, canvas }`. `WTCGLExtensions` is replaced by `WTCGLExtensionMap`.
- **`Framebuffer.TEXTYPE_HALF_FLOAT_OES`** is deprecated in favour of `Framebuffer.TEXTYPE_HALF_FLOAT` (same value). Half-float framebuffers and render targets always use `gl.HALF_FLOAT` with `RGBA16F`.
- **`RenderTarget`** depth buffers always default to `DEPTH_COMPONENT24`, or `DEPTH24_STENCIL8` with `stencil`. The WebGL1 `DEPTH_COMPONENT16` / `DEPTH_STENCIL` fallbacks are gone, and `depthTexture` no longer depends on `WEBGL_depth_texture`.
- **`Texture`** always generates mipmaps when `generateMipmaps` is set, including for non-power-of-two images. Under WebGL1 these silently fell back to no mipmaps, clamped wrapping and linear filtering. An `anisotropy` value on a device without `EXT_texture_filter_anisotropic` is now ignored instead of throwing.
