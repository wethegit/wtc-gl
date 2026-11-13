# wtc-gl Roadmap

Findings from a review of `packages/wtc-gl` (October 2026), grouped into phases. Line numbers are as of `wtc-gl@1.4.0` and will drift.

Coverage: Renderer, Program, Mesh, Uniform, Texture, Geometry, RenderTarget, Framebuffer, TransformFeedback, and the FragmentShader and ScrollRenderer recipes were read closely. Camera, DollyCamera, ParticleSimulation, ScrollScene/ScrollImage and `packages/react` were only skimmed.

---

## Phase 1 — Bug fixes (patch release)

- [x] **Some meshes are never drawn when sorting** — `core/Renderer.ts` `getRenderList`. A program with `transparent: true, depthTest: false` isn't added to any list, so it never renders when `sort: true` (the default). The `else` that should put it in `ui` is attached to `if (program)` instead. Also, `sortUI` reads `a.program.id`, so a node with no program would crash there anyway.
- [x] **Mesh rebuilds its matrix uniforms on every draw** — `core/Mesh.ts` `draw`. It checks `uniforms.modelMatrix` but stores the uniforms as `u_modelMatrix`. The check never passes, so every mesh creates 7 new `Uniform` objects each frame. The no-camera branch has the same problem.
- [x] **A mesh scaled to zero crashes when drawn with a camera** — `core/Mesh.ts` `draw`. In wtc-math, `Mat3.fromMat4` returns `null` when the matrix can't be inverted, and `.array` is then read on `null`.
- [x] **`u_objectPosition` uses local position** — `core/Mesh.ts`. It reads `this.position` rather than the world translation, so it's wrong for any child object.
- [x] **Framebuffer tiling modes are swapped** — `ext/Framebuffer.ts` `get wrap`. `IMAGETYPE_TILING` sets `MIRRORED_REPEAT` and `IMAGETYPE_MIRROR` sets `REPEAT`.
- [x] **Framebuffer mipmaps go to the wrong texture** — `ext/Framebuffer.ts` `render`. `generateMipmap` runs on whichever texture happens to be bound, because the line that binds the write target's texture is commented out.
- [x] **The renderer can lose track of the bound framebuffer** — `core/RenderTarget.ts`. The constructor calls `gl.bindFramebuffer` directly, so `renderer.state.framebuffer` goes stale. If you then render into the target that was last bound, the bind is skipped and the frame goes to the canvas. Route the binds through `renderer.bindFramebuffer`.
- [x] **Changing a typed array in place never re-uploads** — `core/Uniform.ts` `setUniform`. A non-`Array` value (such as a `Float32Array`) is compared by reference, so editing it in place looks unchanged to the cache.
- [x] **Program initialisation gaps** — `core/Program.ts`:
  - `blendEquation` is never initialised, so calling `setBlendEquation()` throws.
  - If linking fails, the constructor returns early and leaves `uniformLocations` undefined, so `use()` throws on the next frame. Failed shaders are also never deleted.
- [x] **Wrong initial blend state** — `core/Renderer.ts`. `state.blendEquation.modeAlpha` starts as `ONE_MINUS_SRC_ALPHA`, which is a blend factor, not a blend equation (should be `FUNC_ADD`).
- [x] **Debug code left in** — `geometry/Geometry.ts` `bindTransformFeedbacks`. `window.feedbk = feedbk` writes to the global object on every transform-feedback draw.
- [x] **Indexed draw ranges only work with 16-bit indices** — `geometry/Geometry.ts` `draw`. The offset is `drawRange.start * 2`, so a `drawRange` on `Uint32` indices points at the wrong place. Use the index type's byte size.
- [x] **`getPosition()` throws without a position attribute** — `geometry/Geometry.ts`. It reads `.data` on `undefined` before it gets to the warning.
- [x] **`Sphere` isn't exported** — `geometry/Sphere.ts` exists but `index.ts` doesn't export it.

## Phase 2 — Resource lifecycle and disposal

Several classes have no way to free what they allocate. This matters most for React and route changes, where these objects are created and torn down repeatedly. Follow the pattern already used by `TransformFeedback.remove()` and `ScrollRenderer.destroy()`.

- [x] `Texture.remove()` — delete the `WebGLTexture` and clear the renderer's texture-unit cache entry.
- [x] `RenderTarget.remove()` — delete the framebuffer, colour textures and depth texture.
- [x] `Framebuffer.remove()`. `Framebuffer.resize()` creates two new render targets and never deletes the old ones, so it leaks GPU memory on every resize.
- [x] `Program.remove()` should clear its cached uniform values (resetting `renderer.currentProgram` is done).
- [x] `Renderer.dispose()`.
- [x] `FragmentShader.destroy()` — stop the render loop, remove the `resize` listener, and release the mesh, program and geometry.
- [x] Handle `webglcontextlost` / `webglcontextrestored`.

## Phase 3 — Tests and type safety

- [x] Add Vitest for the pure logic: render-list sorting, uniform caching, bounds, and the scene-graph matrices.
- [x] Add a Playwright smoke test that loads each demo in `packages/site` and fails on any console error or WebGL warning.
- [x] Run tests (and lint) in the `build.yml` CI workflow. Lint already runs in `lint.yml`.
- [x] Turn on `strictPropertyInitialization` and remove the `!` assertions that hide uninitialised-field bugs.
- [x] Check uniform kinds properly. A `Texture` passed without `kind: 'texture'` currently falls through to `gl.uniform1i` with an object.

## Phase 4 — v2.0: WebGL2 only and fewer allocations

### Drop WebGL1

The WebGL1 fallback adds a lot of code and, as far as I can tell, image textures already don't work there:

- `Texture.update` uses the 9-argument `texImage2D(…, image)` form, which only exists in WebGL2, so WebGL1 would throw.
- The WebGL1 power-of-two check also uses `image.width` rather than `naturalWidth`.

- [x] Require WebGL2. This removes the `getExtension` aliasing in `Renderer`, the `HALF_FLOAT_OES` branches in `RenderTarget`/`Framebuffer`, and the depth-texture fallbacks. It should also greatly reduce the context-restore code in `Renderer`: the extension aliases are why `#enableExtensions()` returns functions that the constructor copies one by one (to satisfy `strictPropertyInitialization`) and restore re-assigns.
- [x] Support WebGL2 uniform types that are currently ignored: `sampler3D`, `sampler2DArray`, `isampler*`/`usampler*`, `uint`/`uvec*` and the non-square matrices.
- [x] Support `INTERLEAVED_ATTRIBS` transform feedback (`Program`'s `transformFeedbackBufferMode`).
- [x] Make `TransformFeedback` manage its own state instead of `Geometry`, and stop it binding VAOs directly (which bypasses `renderer.currentGeometry`). It's now a standalone simulation: `step()` runs it without drawing, and `attribute(name)` feeds the results to any geometry, optionally per instance. See the `swarm` demo.

### Fewer allocations per frame

The wtc-math getters (`.array`, `multiplyNew`, `translation`, `scaleNew`, `Mat3.fromMat4`) create new objects on every call. That adds up to roughly 10–20 new arrays or matrices per mesh per frame, plus a new frustum on every `updateFrustum`. That's fine for one full-screen shader, but it will cause garbage-collection stutter with many ScrollScenes.

- [x] Keep a reusable `Float32Array` per matrix and vector uniform in `Mesh.draw`.
- [x] Update matrices in place in `Obj.updateMatrix` / `updateMatrixWorld`.
- [x] Reuse the frustum planes in `Camera.updateFrustum`.
- [x] Stop allocating in `Renderer.render` and `ScrollRenderer.render`: the viewport `Vec2`s, the `resize()` read every frame, and the render-list arrays. (`resize()` no longer allocates, but still reads the canvas size each frame to catch changes the ResizeObserver hasn't reported yet.)
- [ ] Fix allocation upstream in wtc-math, then remove wtc-gl's workarounds (likely for the next major version). wtc-math's "in place" methods still allocate: `multiply` and `invert` clone first, `invert` and `determinant` build intermediate objects, and `.array`, `.translation` and `Quat.fromEuler` return new objects. Its components are also stored in private fields behind getters and setters, which makes V8 box doubles in code that isn't optimised. Once wtc-math has truly in-place operations (e.g. `multiply(a, b, out)`, `invert(out)`, `fromRotationTranslationScale(..., out)`, `toArray(out)`), replace the copied formulas in `src/core/matrix.ts` with calls to it and delete that file. `test/allocations.test.ts` should keep passing throughout. wtc-math 1.4.0 ships its own type declarations, so wtc-gl's `types/wtc-math.d.ts` shim is gone, but it has no in-place operations yet, so `matrix.ts` stays.

## Phase 5 — Smaller improvements

- [x] The `FragmentShader` default `container = document.body` runs even when there's no `window`, so it breaks server-side rendering despite the `hasWindow` guard.
- [x] `Texture` should accept `Uint8Array`/`Uint16Array`/`Int32Array` data, `ImageBitmap` and `OffscreenCanvas`.
- [x] Add a video-texture helper that sets `needsUpdate` via `requestVideoFrameCallback`.
- [x] `RenderTarget` should honour the `stencil` and `depthTexture` options (both are currently ignored).
- [x] `RenderTarget` creates its depth texture as `DEPTH_COMPONENT16` (inherited from OGL), which z-fights on coplanar faces. Default to `DEPTH_COMPONENT24` or add a `depthFormat` option.
- [x] `Renderer` should throw when it can't get a context, rather than logging an error and returning a half-built object.
- [x] Add a clear-colour API on `Renderer` instead of raw `gl.clearColor` calls.
- [x] `Geometry.computeBoundingBox` should handle 2D positions (`size: 2`); there's already a TODO.
- [x] `Mesh.removeBeforeRender` / `removeAfterRender` remove items while iterating, so the item right after a removed one is skipped.

## Phase 6 — 3D modelling

wtc-gl already has a scene graph, cameras, indexed and instanced geometry, and `Box`/`Sphere`/`Plane`. What's missing is the layer for building and shading models in code. The manifold-divider demo works around most of these gaps by hand (a `Builder` class that offsets and merges boxes, hand-written normals, a sweep done in `helix.vert`, per-demo lighting).

Much of this can be ported from [OGL](https://github.com/oframe/ogl) (MIT; keep its licence notice), which wtc-gl's core is descended from. Items marked _new_ have no OGL equivalent.

### Building geometry

- [x] `Geometry.computeVertexNormals()` — area-weighted normals for indexed and non-indexed geometry. _New._
- [x] `Geometry.applyMatrix(mat4)` — transform positions in place and normals by the normal matrix, then reset bounds. _New._
- [x] `mergeGeometries([...])` — combine geometries with matching attributes into one, rebasing indices. _New._
- [x] `toNonIndexed()` for flat shading, and `mergeVertices(tolerance)` to weld vertices back together for smooth shading. _New._
- [x] `Geometry.setIndex()` — replace the index buffer after construction (OGL).
- [x] Vitest coverage for all of the above. They're pure array work.

### Primitives and generators

- [x] `Cylinder` (a cylinder with `radiusTop: 0` is a cone) and `Torus` (OGL).
- [x] `Capsule`. _New._
- [x] `Curve` — Catmull-Rom and quadratic/cubic Bézier point generation (OGL). Built as a `Path`, with centripetal Catmull-Rom, `tension`, a smoother `bspline` type and closed loops.
- [x] `Path` — `moveTo`/`lineTo`/`bezierCurveTo`, sampling by length, tangents and Frenet frames (OGL). Sampling is by distance inside segments too, and the frames are rotation-minimising.
- [x] `Tube` — sweep a circular profile along a `Path` (OGL). The radius can be a function, for tapers.
- [x] `Extrude` (2D outline to a solid, with optional bevel). _New._ Caps triangulated with `earcut`, with crease-angle shading on the sides.
- [x] `Lathe` (spin a profile around an axis). _New._

### Lines (Polyline)

A `Polyline` class (a MeshLine equivalent) based on OGL's `Polyline`. Each point is doubled with a `side` of ±1 and given prev/next attributes, then extruded in screen space with mitred corners. It's extended with what three.js MeshLine adds, and named after `Path.toPolyline()`, whose points it draws.

- [x] `Polyline extends Mesh`, rather than wrapping a mesh like OGL, so it sits in the scene graph, frustum-culls from its bounds and works with `ScrollScene`.
- [x] Width in pixels or world units (`sizeAttenuation`).
- [x] Per-vertex width from a `taper` callback (`(u, i) => 1 - u`) for tapers and trails.
- [x] Dashes: `dashArray`, `dashOffset`, `dashRatio`. They're measured along the real distance travelled rather than MeshLine's 0→1 counter, so dashes keep their size as the line grows.
- [x] Texture `map` with repeat along the line, `alphaTest`, `opacity`, and `visibility` for drawing it on.
- [x] Closed loops and a mitre limit.
- [x] `setPoints()` that reuses buffers when the count is unchanged, plus `push()` for trails, which adds a new head point and drops the tail.
- [x] Export the extrusion as a GLSL function (`polylineExtrude`) so custom shaders can reuse it. Extra `uniforms` and (instanced) `attributes` for custom shaders, as in the `polyline-trails` demo.
- [x] From `Line` on `feature/polyline-and-demo`: resolution from the viewport (right in render targets), premultiplied output, a `map` that can be swapped at any time, and clip space without a camera.
- [x] `billboard: false` for a flat ribbon in world space. It follows rotation-minimising frames (now `rotationMinimisingFrames`, shared with `Path`) from `facing`, which defaults to the plane of the points. `tilt` rolls it and `bank` leans it into turns.
- [x] Vitest for buffer building (end-point prev/next, closed loops, cumulative distance, ribbon frames, banking and mitres) and a `lines` demo: a tapered, dashed spiral that draws itself on, plus a mouse trail.
- Known limits, same as MeshLine:
  - Mitred joins only: no round joins or caps.
  - Self-overlapping transparent lines double up, unless depth writes are off or `alphaTest` is used.
  - A billboard line with a width in pixels is culled by its points alone.

### Shading and viewing

- [x] A built-in lit program: Lambert/Blinn-Phong with a directional light, hemisphere/ambient light and a colour or texture. _New._ `LitProgram`, lit by a shared `Lights` object in world space, with `flatShading`, `vertexColours` and `doubleSided`. The lighting ships as the `litShading` GLSL string for custom shaders, the way `polylineExtrude` does; the `#include` work in Future features item 2 can register it as a named chunk later. The `lighting` demo shows each option, and the primitives, building-geometry and paths demos now use `litShading`.
- [x] `NormalProgram` and `WireMesh` for debugging (OGL). `NormalProgram` shows normals in view or world space, optionally flat or double-sided. `WireMesh` draws each edge once from the source geometry's own position buffer (an external attribute), so it never copies or deletes it.
- [x] `AxesHelper`, `GridHelper`, `VertexNormalsHelper`, `FaceNormalsHelper` (OGL). All of them, and `WireMesh`, draw `gl.LINES`, so the lines are one device pixel wide, and pull their lines slightly towards the camera so they show on a surface. The normals helpers parent themselves to the mesh and keep `size` world units long however it's scaled. They're shown in the primitives and lighting demos. The many-meshes demo's hand-built frustum lines could move onto the same line program later.

### Import

For the occasional hero model from Blender. It lands after the lit program, which is what it draws with. Moved here from Future features item 6.

- [ ] Async `Texture.fromURL`, decoded with `createImageBitmap`. GLB textures need it, and it's useful on its own.
- [ ] `GLTFLoader` for `.glb` and `.gltf` (embedded or external buffers) (OGL). Nodes become `Transform`s, meshes become `Geometry` and `Mesh`, with every accessor type, indices and multiple primitives per mesh. Cameras are imported too.
- [ ] Materials map the base colour factor and texture, normals and UVs onto the lit program. glTF materials are PBR and the lit program is Blinn-Phong, so this is an approximation, and the docs should say so.
- [ ] `EXT_mesh_gpu_instancing` creates an `InstancedMesh`, once that exists.
- Out of scope: skinning, morph targets and animation (a whole animation system, and three.js territory); PBR materials and IBL; Draco/meshopt compression. If compression is ever needed, it ships as an opt-in entry point, like the CSG adapter, so the decoder dependency stays optional.

### Core additions this depends on

- [x] `Camera.project(v)` / `unproject(v)` and `updateProjectionMatrix()` (OGL). They return the vector rather than the camera, take an optional `out`, and don't allocate. The `paths` demo uses them for picking and dragging.
- [x] Per-instance culling, as an optional `worldMatrix` argument to `Camera.frustumIntersects(node, worldMatrix)` rather than OGL's separate `frustumIntersectsMesh` (OGL).
- [ ] Renderer state setters: `setScissor`, `setStencilMask`/`Func`/`Op`, `setDepthFunc`, `setDepthMask`, `setCullFace`, `setFrontFace`; plus `Program.setStencilFunc`/`Op` (OGL).
- [ ] `Program.setShaders()` — swap shaders on an existing program. Also needed for hot reload (Future features item 4) (OGL).
- [ ] `InstancedMesh` with per-instance matrix and colour attributes, and per-instance frustum culling (OGL). Replaces Future features item 8.

### Interaction

- [ ] `Raycast` — `castMouse`, then `intersectBounds`, then `intersectMeshes` returning point, UV and normal (OGL). Replaces Future features item 9.
  - Once it lands, regroup on the `paths` demo. Its handles are picked by their projected screen position and dragged in the plane facing the camera, as a stand-in. Decide whether to switch to raycast picking, and to dragging along a surface or constrained plane.

### Later

- [ ] `Shadow` — shadow-map pass from a light camera (OGL).
- [ ] CSG via a thin `manifold-3d` adapter, e.g. `Geometry.fromManifold(mesh)` / `toManifold()`, rather than writing CSG ourselves. Ship it as a separate entry point so the WASM dependency stays opt-in.
- Model export moved to Future features item 11.

---

## Future features

These come after Phases 1–5 and run alongside Phase 6. They build on what wtc-gl is already good at: shader-driven effects in agency sites, synced to DOM elements and scroll. Phase 6 adds basic 3D modelling, but wtc-gl still doesn't need to compete with three.js as a general 3D engine.

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

6. **Loaders.** `Texture.fromURL` and the glTF loader moved to Phase 6 (Import).
   - [ ] KTX2/Basis compressed textures for large image-heavy pages.
7. **A GPGPU helper.** Generalise `ParticleSimulation` into a "simulate N values in textures" utility. That would cover fluid, reaction-diffusion and flocking without each one re-implementing the ping-pong setup.
   - [ ] Neighbour awareness for `TransformFeedback` simulations, which can only see their own vertex. For example, render the results into a small density target and let the simulation steer down its gradient. That would give the `swarm` demo real separation.
8. **Instancing helpers.** Moved to Phase 6 (Core additions).
9. **Picking.** Ray casting moved to Phase 6 (Interaction). A GPU ID-buffer pass is still worth considering for dense scenes.
10. **React parity.** `packages/react` only covers ScrollRenderer. Add:
    - [ ] `useFragmentShader`
    - [ ] `useUniform`, for reactive uniform values without React re-renders
    - [ ] `useTexture`
11. **Model export.** Moved here from Phase 6 (Later). Only worth doing if a project needs models to leave the browser, for example to 3D-print or hand off something generated in code.
    - [ ] OBJ/STL/GLB export from a `Geometry` or a scene graph. _New._ GLB export can share its accessor and buffer layout code with the Phase 6 glTF loader.

### Longer term

- **WebGPU.** Worth watching, but only take it on if a project needs compute. Abstracting the backend would mean rewriting the core, so don't do it speculatively.
