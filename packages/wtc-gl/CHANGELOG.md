# wtc-gl

## 1.5.0

### Minor Changes

- [#164](https://github.com/wethegit/wtc-gl/pull/164) [`b2485ef`](https://github.com/wethegit/wtc-gl/commit/b2485ef40074cfd1fb683aac8019fce3b849aacd) Thanks [@liamegan](https://github.com/liamegan)! - Add teardown for renderers and fragment shaders:

  - `Renderer.dispose()` clears the renderer's state caches. If the renderer created its own canvas, it also releases the WebGL context straight away. A canvas passed in through the `canvas` option keeps its context, so a new renderer can still use it.
  - `FragmentShader.destroy()` stops the render loop, removes the `resize` listener, deletes the geometry and program, and disposes the renderer. A canvas the renderer created is removed from the DOM; it's returned either way. A `post` framebuffer is left for the caller to remove.
  - `FragmentShader.playing = false` now cancels the pending animation frame, so one more frame no longer renders after pausing.
  - `Program.remove()` now drops its uniform values from the renderer's cache.
  - `ScrollRenderer.destroy()` now calls `Renderer.dispose()`.
  - `FragmentShader`'s `rendererProps` option is now typed as `Partial<RendererOptions>` instead of `object`.

- [#162](https://github.com/wethegit/wtc-gl/pull/162) [`9eb5a54`](https://github.com/wethegit/wtc-gl/commit/9eb5a54d7c7d83bb6c24a58d8e5acefd556d7633) Thanks [@liamegan](https://github.com/liamegan)! - Add disposal for textures and render targets, and fix a GPU memory leak in `Framebuffer`:

  - `Texture.remove()` deletes the WebGL texture and clears it from the renderer's texture-unit cache.
  - `RenderTarget.remove()` deletes the framebuffer and its colour and depth textures. If the target is bound, the canvas is bound in its place.
  - `Framebuffer.remove()` deletes both ping-pong targets.
  - `Framebuffer.resize()` now frees the previous targets. It used to create two new ones on every resize and never delete the old ones. If you keep a reference to `fbo.read.texture` across a resize, read it again after resizing.

### Patch Changes

- [#165](https://github.com/wethegit/wtc-gl/pull/165) [`5e6b33a`](https://github.com/wethegit/wtc-gl/commit/5e6b33a500e796c9ab86f71e3a9d8855f7a9f565) Thanks [@liamegan](https://github.com/liamegan)! - Fix `GeometryAttribute` counts and bounds for interleaved attributes:

  - An explicit `count` is now used as given. Without a `stride` it used to become `Infinity`, and with a `stride` it was ignored.
  - `computeBoundingBox` / `computeBoundingSphere` now treat `stride` and `offset` as bytes, matching what's passed to `vertexAttribPointer`. They used them as array indices, so bounds for interleaved attributes were read from the wrong values.

## 1.4.1

### Patch Changes

- [#158](https://github.com/wethegit/wtc-gl/pull/158) [`6b30270`](https://github.com/wethegit/wtc-gl/commit/6b30270f3647b2d2fefd9f0ba0a8cf632c5f5038) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Framebuffer` and `RenderTarget` bugs:

  - `Framebuffer.IMAGETYPE_TILING` and `IMAGETYPE_MIRROR` were swapped. `TILING` now uses `REPEAT` and `MIRROR` uses `MIRRORED_REPEAT`. If you used `IMAGETYPE_MIRROR` and relied on it wrapping around, switch to `IMAGETYPE_TILING`.
  - `Framebuffer` with `generateMipmaps: true` now generates mipmaps for the texture it just rendered to, instead of whichever texture happened to be bound.
  - Creating a `RenderTarget` no longer leaves the renderer's cached framebuffer binding out of date. Previously, rendering again into the last-used target after creating a new one could draw to the canvas instead.

- [#160](https://github.com/wethegit/wtc-gl/pull/160) [`eb4f735`](https://github.com/wethegit/wtc-gl/commit/eb4f73537ddfc6ae14aff822ee986898b87ab0bd) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Geometry` bugs and export `Sphere`:

  - `setDrawRange` now works with 32-bit (`Uint32Array`) indices. The draw offset assumed 2-byte indices, which gave an invalid offset and drew nothing.
  - `computeBoundingBox` / `computeBoundingSphere` no longer throw on a geometry with no `position` attribute. The bounds are left unset instead.
  - Transform-feedback draws no longer write a `feedbk` global to `window`.
  - `Sphere` geometry is now exported from the package.

- [#157](https://github.com/wethegit/wtc-gl/pull/157) [`a12126c`](https://github.com/wethegit/wtc-gl/commit/a12126c37063811b266a0f8eaf467954d9cb6344) Thanks [@liamegan](https://github.com/liamegan)! - Fix several `Mesh` bugs:

  - `Mesh.draw` no longer creates new matrix uniforms on every frame. It was checking for `modelMatrix` instead of `u_modelMatrix`, so the check never passed.
  - Drawing a mesh scaled to zero with a camera no longer throws. The previous normal matrix is kept when the model-view matrix can't be inverted.
  - `u_objectPosition` is now the mesh's world position, not its local position, so it's correct for child objects.
  - `removeBeforeRender` / `removeAfterRender` now remove every copy of the callback, including ones registered back to back.

- [#159](https://github.com/wethegit/wtc-gl/pull/159) [`92657ce`](https://github.com/wethegit/wtc-gl/commit/92657ce9ef18439b0dcd99aa215b6ef252abe993) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Program` and `Uniform` bugs:

  - `Program.setBlendEquation()` no longer throws. `blendEquation` now defaults to `FUNC_ADD`.
  - A program that fails to link no longer throws on every frame. It logs the link error once, has the new `linked` flag set to `false`, and meshes using it draw nothing. Its shaders are now deleted when linking fails too.
  - `Program.remove()` clears the renderer's current-program cache when it deletes the active program.
  - `Float32Array` uniform values are now cached by copy, so changes made in place are uploaded on the next draw. `Float32Array` values for `float[]` uniforms are now set at all.

- [#155](https://github.com/wethegit/wtc-gl/pull/155) [`c91a9c5`](https://github.com/wethegit/wtc-gl/commit/c91a9c503c4e94fc31095e1037cfb62ea4a2e358) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Renderer.getRenderList` skipping meshes whose program is `transparent` with `depthTest: false` when sorting. These now render last, in the UI group. Also fix the renderer's initial blend-equation state, which used a blend factor (`ONE_MINUS_SRC_ALPHA`) instead of `FUNC_ADD`.
