# wtc-gl Roadmap

Findings from a review of `packages/wtc-gl` (October 2026), grouped into phases. Line numbers are as of `wtc-gl@1.4.0` and will drift.

Coverage: Renderer, Program, Mesh, Uniform, Texture, Geometry, RenderTarget, Framebuffer, TransformFeedback, and the FragmentShader and ScrollRenderer recipes were read closely. Camera, DollyCamera, ParticleSimulation, ScrollScene/ScrollImage and `packages/react` were only skimmed.

---

## Phase 1 — Bug fixes (patch release)

- [x] **Some meshes are never drawn when sorting** — `core/Renderer.ts` `getRenderList`. A program with `transparent: true, depthTest: false` isn't added to any list, so it never renders when `sort: true` (the default). The `else` that should put it in `ui` is attached to `if (program)` instead. Also, `sortUI` reads `a.program.id`, so a node with no program would crash there anyway.
- [x] **Mesh rebuilds its matrix uniforms on every draw** — `core/Mesh.ts` `draw`. It checks `uniforms.modelMatrix` but stores the uniforms as `u_modelMatrix`. The check never passes, so every mesh creates 7 new `Uniform` objects each frame. The no-camera branch has the same problem.
- [x] **A mesh scaled to zero crashes when drawn with a camera** — `core/Mesh.ts` `draw`. In wtc-math, `Mat3.fromMat4` returns `null` when the matrix can't be inverted, and `.array` is then read on `null`.
- [x] **`u_objectPosition` uses local position** — `core/Mesh.ts`. It reads `this.position` rather than the world translation, so it's wrong for any child object.
- [ ] **Framebuffer tiling modes are swapped** — `ext/Framebuffer.ts` `get wrap`. `IMAGETYPE_TILING` sets `MIRRORED_REPEAT` and `IMAGETYPE_MIRROR` sets `REPEAT`.
- [ ] **Framebuffer mipmaps go to the wrong texture** — `ext/Framebuffer.ts` `render`. `generateMipmap` runs on whichever texture happens to be bound, because the line that binds the write target's texture is commented out.
- [ ] **The renderer can lose track of the bound framebuffer** — `core/RenderTarget.ts`. The constructor calls `gl.bindFramebuffer` directly, so `renderer.state.framebuffer` goes stale. If you then render into the target that was last bound, the bind is skipped and the frame goes to the canvas. Route the binds through `renderer.bindFramebuffer`.
- [ ] **Changing a typed array in place never re-uploads** — `core/Uniform.ts` `setUniform`. A non-`Array` value (such as a `Float32Array`) is compared by reference, so editing it in place looks unchanged to the cache.
- [ ] **Program initialisation gaps** — `core/Program.ts`:
  - `blendEquation` is never initialised, so calling `setBlendEquation()` throws.
  - If linking fails, the constructor returns early and leaves `uniformLocations` undefined, so `use()` throws on the next frame. Failed shaders are also never deleted.
- [x] **Wrong initial blend state** — `core/Renderer.ts`. `state.blendEquation.modeAlpha` starts as `ONE_MINUS_SRC_ALPHA`, which is a blend factor, not a blend equation (should be `FUNC_ADD`).
- [ ] **Debug code left in** — `geometry/Geometry.ts` `bindTransformFeedbacks`. `window.feedbk = feedbk` writes to the global object on every transform-feedback draw.
- [ ] **Indexed draw ranges only work with 16-bit indices** — `geometry/Geometry.ts` `draw`. The offset is `drawRange.start * 2`, so a `drawRange` on `Uint32` indices points at the wrong place. Use the index type's byte size.
- [ ] **`getPosition()` throws without a position attribute** — `geometry/Geometry.ts`. It reads `.data` on `undefined` before it gets to the warning.
- [ ] **`Sphere` isn't exported** — `geometry/Sphere.ts` exists but `index.ts` doesn't export it.

## Phase 2 — Resource lifecycle and disposal

Several classes have no way to free what they allocate. This matters most for React and route changes, where these objects are created and torn down repeatedly. Follow the pattern already used by `TransformFeedback.remove()` and `ScrollRenderer.destroy()`.

- [ ] `Texture.remove()` — delete the `WebGLTexture` and clear the renderer's texture-unit cache entry.
- [ ] `RenderTarget.remove()` — delete the framebuffer, colour textures and depth texture.
- [ ] `Framebuffer.remove()`. `Framebuffer.resize()` creates two new render targets and never deletes the old ones, so it leaks GPU memory on every resize.
- [ ] `Program.remove()` should reset `renderer.currentProgram` and clear its cached uniform values.
- [ ] `Renderer.dispose()`.
- [ ] `FragmentShader.destroy()` — stop the render loop, remove the `resize` listener, and release the mesh, program and geometry.
- [ ] Handle `webglcontextlost` / `webglcontextrestored`.

## Phase 3 — Tests and type safety

- [ ] Add Vitest for the pure logic: render-list sorting, uniform caching, bounds, and the scene-graph matrices.
- [ ] Add a Playwright smoke test that loads each demo in `packages/site` and fails on any console error or WebGL warning.
- [ ] Run tests (and lint) in the `build.yml` CI workflow.
- [ ] Turn on `strictPropertyInitialization` and remove the `!` assertions that hide uninitialised-field bugs.
- [ ] Check uniform kinds properly. A `Texture` passed without `kind: 'texture'` currently falls through to `gl.uniform1i` with an object.

## Phase 4 — v2.0: WebGL2 only and fewer allocations

### Drop WebGL1

The WebGL1 fallback adds a lot of code and, as far as I can tell, image textures already don't work there:
- `Texture.update` uses the 9-argument `texImage2D(…, image)` form, which only exists in WebGL2, so WebGL1 would throw.
- The WebGL1 power-of-two check also uses `image.width` rather than `naturalWidth`.

- [ ] Require WebGL2. This removes the `getExtension` aliasing in `Renderer`, the `HALF_FLOAT_OES` branches in `RenderTarget`/`Framebuffer`, and the depth-texture fallbacks.
- [ ] Support WebGL2 uniform types that are currently ignored: `sampler3D`, `sampler2DArray`, `isampler*`/`usampler*`, and `uint`/`uvec*`.
- [ ] Support `INTERLEAVED_ATTRIBS` transform feedback (there's already a TODO in `Program.ts`).
- [ ] Make `TransformFeedback` manage its own state instead of `Geometry`, and stop it binding VAOs directly (which bypasses `renderer.currentGeometry`).

### Fewer allocations per frame

The wtc-math getters (`.array`, `multiplyNew`, `translation`, `scaleNew`, `Mat3.fromMat4`) create new objects on every call. That adds up to roughly 10–20 new arrays or matrices per mesh per frame, plus a new frustum on every `updateFrustum`. That's fine for one full-screen shader, but it will cause garbage-collection stutter with many ScrollScenes.

- [ ] Keep a reusable `Float32Array` per matrix and vector uniform in `Mesh.draw`.
- [ ] Update matrices in place in `Obj.updateMatrix` / `updateMatrixWorld`.
- [ ] Reuse the frustum planes in `Camera.updateFrustum`.
- [ ] Stop allocating in `Renderer.render` and `ScrollRenderer.render`: the viewport `Vec2`s, the `resize()` read every frame, and the render-list arrays.

## Phase 5 — Smaller improvements

- [ ] The `FragmentShader` default `container = document.body` runs even when there's no `window`, so it breaks server-side rendering despite the `hasWindow` guard.
- [ ] `Texture` should accept `Uint8Array`/`Uint16Array`/`Int32Array` data, `ImageBitmap` and `OffscreenCanvas`.
- [ ] Add a video-texture helper that sets `needsUpdate` via `requestVideoFrameCallback`.
- [ ] `RenderTarget` should honour the `stencil` and `depthTexture` options (both are currently ignored).
- [ ] `Renderer` should throw when it can't get a context, rather than logging an error and returning a half-built object.
- [ ] Add a clear-colour API on `Renderer` instead of raw `gl.clearColor` calls.
- [ ] `Geometry.computeBoundingBox` should handle 2D positions (`size: 2`); there's already a TODO.
- [x] `Mesh.removeBeforeRender` / `removeAfterRender` remove items while iterating, so the item right after a removed one is skipped.

---

## Future features

These come after Phases 1–5. They build on what wtc-gl is already good at: shader-driven effects in agency sites, synced to DOM elements and scroll. It doesn't need to compete with three.js as a general 3D engine.

### Priority

1. **A post-processing chain.** `Framebuffer` already handles ping-pong buffers, but each project wires up its own passes.
   - [ ] Add a `PostProcess` class that takes a list of fragment passes.
   - [ ] Ship built-in passes: bloom, blur, chromatic aberration, grain and colour grading.
   - [ ] Make it work with both `FragmentShader` and `ScrollRenderer` (per scene).
2. **Shader includes and a GLSL snippet library.** Every project rewrites these today.
   - [ ] Add a `#include` resolver to `Program`, or standardise on `vite-plugin-glsl` includes, which is already a dependency.
   - [ ] Ship common snippets: noise (simplex, curl, fbm), SDFs, easing, colour-space conversions, and UV helpers for aspect-correct cover/contain.
3. **More ScrollRenderer features.** It's the newest part of the library and the one most tied to real projects.
   - [ ] Scroll-progress uniforms per scene: 0→1 as the element crosses the viewport.
   - [ ] Scroll-velocity uniforms, for distortion effects.
   - [ ] Pointer uniforms in element space: hover, position and a smoothed velocity.
   - [ ] A `ScrollVideo` to go with `ScrollImage`.
   - [ ] Shared textures across scenes, so one image used twice isn't uploaded twice.

### Cheap, helps every project

4. **Better shader errors and hot reload.**
   - [ ] Map GLSL compile errors back to the original line, including inside included files.
   - [ ] Show an on-canvas error overlay in development.
   - [ ] Add Vite HMR so a `.frag` file swaps the program live without losing state.
5. **Accessibility and performance controls built in.**
   - [ ] Respect `prefers-reduced-motion` (pause or slow `u_time`).
   - [ ] Pause rendering when the tab is hidden.
   - [ ] Lower `dpr` adaptively when the frame rate drops.
   - [ ] Show a static-image fallback when there's no WebGL.

### Worth considering

6. **Loaders.**
   - [ ] Async `Texture.fromURL`, decoded with `createImageBitmap`.
   - [ ] KTX2/Basis compressed textures for large image-heavy pages.
   - [ ] A minimal glTF loader for the occasional 3D hero model.
7. **A GPGPU helper.** Generalise `ParticleSimulation` into a "simulate N values in textures" utility. That would cover fluid, reaction-diffusion and flocking without each one re-implementing the ping-pong setup.
8. **Instancing helpers.** An `InstancedMesh` with per-instance matrix and colour attributes. `Geometry` already supports divisors, so this is mostly ergonomics.
9. **Picking.** Ray casting against bounds, or a GPU ID-buffer pass, for clickable 3D elements.
10. **React parity.** `packages/react` only covers ScrollRenderer. Add:
    - [ ] `useFragmentShader`
    - [ ] `useUniform`, for reactive uniform values without React re-renders
    - [ ] `useTexture`

### Longer term

- **WebGPU.** Worth watching, but only take it on if a project needs compute. Abstracting the backend would mean rewriting the core, so don't do it speculatively.
