# wtc-gl

## 1.5.0

### Minor Changes

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`16936b8`](https://github.com/wethegit/wtc-gl/commit/16936b87337fd6976a51e53d769994961100ba41) Thanks [@liamegan](https://github.com/liamegan)! - Recover from WebGL context loss:

  - `Renderer` now handles `webglcontextlost` and `webglcontextrestored` on its canvas. While the context is lost, `renderer.contextLost` is `true` and `render()` does nothing. When it's restored, the renderer resets its state and rebuilds every `Program`, `Texture`, `Geometry`, `RenderTarget` and `TransformFeedback` that hasn't been removed.
  - New `renderer.onContextLost` and `renderer.onContextRestored` callbacks, e.g. to show a fallback while the context is gone.
  - New `renderer.track(resource)` / `untrack(resource)` to rebuild your own GL objects on restore. A resource is any object with a `restoreContext()` method. Library resources register themselves and unregister in `remove()`. The renderer only holds them weakly, so keep your own reference to anything you track.
  - Each of those classes has a `restoreContext()` method, called by the renderer.
  - What's lost: render target contents, and transform feedback state, which restarts from each attribute's initial `data`. Buffers passed to `TransformFeedback` through the `buffer` option can't be rebuilt and must be recreated by the caller.
  - `TransformFeedback`'s `program` option now accepts the `Program` as well as its `WebGLProgram`. Pass the `Program` so the feedback can be relinked after a restore.
  - `Renderer.dispose()` removes the context listeners.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`039b232`](https://github.com/wethegit/wtc-gl/commit/039b2323684e536d6c54dea97099f1a448adaf34) Thanks [@liamegan](https://github.com/liamegan)! - The render loop makes almost no garbage. With 1,000 animated meshes it used to allocate about 7.8 KB per mesh per frame; now it's about 70 bytes. In Chrome, a 6,000-mesh scene went from ~45 ms to ~10 ms of CPU per frame.

  - `Obj` updates `matrix`, `worldMatrix` and `quaternion` in place, and `Camera` does the same for `viewMatrix`, `projectionViewMatrix`, `worldPosition` and the frustum planes. The wtc-math methods used before allocate even in their "in place" forms, so these use allocation-free versions of the same formulas.
  - `Mesh.draw` keeps a typed array per matrix and vector uniform, updates `modelViewMatrix` and `normalMatrix` in place, and reuses its option objects.
  - `Renderer.render` reuses its render lists, viewport vectors and draw options, and culls and sorts without temporary objects. `getRenderList()` still returns a new array.
  - `ScrollRenderer` updates its viewport and each scene's `u_resolution`, `u_origin` and `u_elementSize` values in place.

  Behaviour change: those matrices and vectors are now the same objects from frame to frame. Code that kept a reference expecting a snapshot (e.g. `const before = mesh.worldMatrix`) should `clone()` it. Matrix uniform values set by `Mesh` are now `Float32Array`s rather than plain arrays.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - Work without a `window` or `document` when given a canvas, e.g. in a worker, under SSR or in tests:

  - `FragmentShader` and `ParticleSimulation` default `container` to `null` (don't append the canvas) when there's no document, instead of throwing on `document.body`. `container: null` can also be passed explicitly.
  - `Renderer` and `Framebuffer` default `dpr` to 1 when there's no `devicePixelRatio`.
  - `GeometryAttribute` no longer reads `window.WebGLRenderingContext` to pick its default `type`.
  - `Geometry.computeBoundingBox` and `computeBoundingSphere` handle 2D positions (`size: 2`), treating z as 0. They used to read the next vertex's x as z.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`8d6d778`](https://github.com/wethegit/wtc-gl/commit/8d6d778f936979aac97c4ac3c4eb3de507049b34) Thanks [@liamegan](https://github.com/liamegan)! - Programs can set a stencil test and turn off colour writes, so stencil passes no longer need raw `gl.stencilFunc` / `gl.colorMask` calls:

  - `stencil: { func, ref, mask, writeMask, fail, zfail, zpass }` applies a stencil test when the program is used. Anything left out uses the WebGL default, and it can be changed later through `program.stencil`.
  - `colourWrite: false` stops the program writing colour, for passes that only write depth or stencil.
  - The renderer only undoes state it set itself, so programs without these options leave stencil and colour-mask state set directly on the context alone. Before a clear, colour and stencil writes are turned back on if a program turned them off.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - `RenderTarget` now honours its `stencil` and `depthTexture` options, and adds `depthFormat`:

  - `stencil: true` gives the target a stencil buffer. With `depth`, the two share a `DEPTH24_STENCIL8` texture or renderbuffer; on its own it's a `STENCIL_INDEX8` renderbuffer.
  - `depthTexture: false` uses a renderbuffer (`target.depthBuffer`) instead of a depth texture, and a `Texture` can be passed to use as the depth texture. A texture passed in isn't deleted by `remove()`.
  - The depth texture now defaults to `DEPTH_COMPONENT24` under WebGL2 instead of `DEPTH_COMPONENT16`, which z-fought on coplanar faces. Set `depthFormat` to choose another (e.g. `gl.DEPTH_COMPONENT32F`).
  - When rendering to a target, `Renderer.render` now clears the target's own depth and stencil buffers rather than going by the renderer's `depth` and `stencil` settings.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`8d6d778`](https://github.com/wethegit/wtc-gl/commit/8d6d778f936979aac97c4ac3c4eb3de507049b34) Thanks [@liamegan](https://github.com/liamegan)! - Add `RenderTarget.resize(width, height)`. It reallocates the target's textures and depth/stencil buffer in place, keeping the same framebuffer and texture objects, so uniforms holding the textures stay valid. Previously a target had to be removed and recreated to change size.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - Add `Renderer.clearColour` (and a `clearColour` option), as `[r, g, b, a]`. Unlike calling `gl.clearColor` directly, it's re-applied after the WebGL context is restored. `FragmentShader` and `ParticleSimulation` now set their default clear colours this way, so a `clearColour` in `rendererProps` (or one set in `onInit`) is respected instead of being overwritten.

- [#164](https://github.com/wethegit/wtc-gl/pull/164) [`b2485ef`](https://github.com/wethegit/wtc-gl/commit/b2485ef40074cfd1fb683aac8019fce3b849aacd) Thanks [@liamegan](https://github.com/liamegan)! - Add teardown for renderers and fragment shaders:

  - `Renderer.dispose()` clears the renderer's state caches. If the renderer created its own canvas, it also releases the WebGL context straight away. A canvas passed in through the `canvas` option keeps its context, so a new renderer can still use it.
  - `FragmentShader.destroy()` stops the render loop, removes the `resize` listener, deletes the geometry and program, and disposes the renderer. A canvas the renderer created is removed from the DOM; it's returned either way. A `post` framebuffer is left for the caller to remove.
  - `FragmentShader.playing = false` now cancels the pending animation frame, so one more frame no longer renders after pausing.
  - `Program.remove()` now drops its uniform values from the renderer's cache.
  - `ScrollRenderer.destroy()` now calls `Renderer.dispose()`.
  - `FragmentShader`'s `rendererProps` option is now typed as `Partial<RendererOptions>` instead of `object`.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`16936b8`](https://github.com/wethegit/wtc-gl/commit/16936b87337fd6976a51e53d769994961100ba41) Thanks [@liamegan](https://github.com/liamegan)! - Fix fields that could be read before they were set. The library is now compiled with `strictPropertyInitialization`.

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

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - More texture sources, and a video texture:

  - `Texture` accepts `ImageBitmap` and `OffscreenCanvas` images, and any integer typed array as `data` (`Uint8Array`, `Uint16Array`, `Int32Array` and so on) as well as `Float32Array`. The new `TextureImage` and `TextureData` types describe these. Image sizes are now read without `instanceof` checks, so textures also work in workers.
  - New `VideoTexture`, which follows a video element and uploads a frame only when the video presents a new one (via `requestVideoFrameCallback`, falling back to every use while playing). It shows an empty pixel until the video has loaded, and has mipmaps off by default. This replaces setting `needsUpdate = true` every frame.

- [#162](https://github.com/wethegit/wtc-gl/pull/162) [`9eb5a54`](https://github.com/wethegit/wtc-gl/commit/9eb5a54d7c7d83bb6c24a58d8e5acefd556d7633) Thanks [@liamegan](https://github.com/liamegan)! - Add disposal for textures and render targets, and fix a GPU memory leak in `Framebuffer`:

  - `Texture.remove()` deletes the WebGL texture and clears it from the renderer's texture-unit cache.
  - `RenderTarget.remove()` deletes the framebuffer and its colour and depth textures. If the target is bound, the canvas is bound in its place.
  - `Framebuffer.remove()` deletes both ping-pong targets.
  - `Framebuffer.resize()` now frees the previous targets. It used to create two new ones on every resize and never delete the old ones. If you keep a reference to `fbo.read.texture` across a resize, read it again after resizing.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`16936b8`](https://github.com/wethegit/wtc-gl/commit/16936b87337fd6976a51e53d769994961100ba41) Thanks [@liamegan](https://github.com/liamegan)! - Bind texture uniforms by value and check them against the shader:

  - A `Texture` (or array of textures) now binds as a texture whatever its `kind`. Without `kind: 'texture'` it used to be passed to `gl.uniform1i` as an object. A mismatched `kind` still binds, with a warning.
  - A texture on a uniform the shader doesn't declare as a sampler, a texture whose target doesn't match the sampler (such as a cube map on a `sampler2D`), and a non-texture value on a sampler are now skipped with a warning instead of being sent to WebGL. `null` and texture unit numbers are still accepted on samplers.
  - Each of these warnings is shown once per uniform.
  - WebGL2 sampler types are now uploaded: `sampler3D`, `sampler2DArray`, the shadow samplers, and the `isampler*`/`usampler*` types. They were silently ignored before.
  - `uint`/`uvec2`–`uvec4` and the non-square matrix types (`mat2x3`, `mat2x4`, `mat3x2`, `mat3x4`, `mat4x2`, `mat4x3`) are now uploaded too, with matching `kind` names.

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
