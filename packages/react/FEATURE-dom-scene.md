# DOMScene - declarative React scenes

Tracking doc for the declarative scene layer in `@wethegit/react-wtc-gl`.

## Overview

A declarative layer over the ScrollRenderer infrastructure: `DOMScene` renders a
real `<div>` tracked by a `ScrollScene` on the provider's shared canvas, and its
children describe GL content as React elements.

```tsx
<ScrollRendererProvider>
  <DOMScene className="hero">
    <Plane
      ref={planeRef}
      width={300}
      height={200}
      position={[100, 0, 0]}
      fragment={fragSrc}
      uniforms={{ u_color: [1, 0, 0] }}
    />
    <Plane />
  </DOMScene>
</ScrollRendererProvider>
```

An optional `<Camera>` child overrides the scene's default camera. Planes only
for v1 - see [Future extensions](#future-extensions).

## API sketch

- `<DOMScene {...divProps} margin? clipToViewport? clearOnRender? initializedClass? onBeforeRender? onAfterRender?>`
  - the `<div>` + `ScrollScene` + default camera + per-frame subscriber set.
- `<Plane width? height? widthSegments? heightSegments? position? rotation? scale? visible? vertex? fragment? uniforms? transparent? depthTest? depthWrite? doubleSided? renderOrder? setup? ref?>`
  - a mesh in the scene; `ref` receives a `PlaneHandle` (`mesh`, `program`,
    `geometry`, `uniforms`, `position`/`rotation`/`scale`, `setUniform()`).
- `<Camera instance? type? near? far? fov? aspect? left? right? top? bottom? zoom? position? lookAt? dolly? ref?>`
  - replaces the default camera while mounted; `type` is `'perspective'`
    (default) | `'orthographic'` | `'dolly'`; `ref` receives the raw camera.
- `useDOMSceneContext()` - escape hatch to the scene internals
  (`gl`, `renderer`, `scrollScene`, `camera`, `subscribeFrame`, `nextRenderOrder`, `setCamera`)
  for building custom scene children.

## Decisions log

- **CSS-pixel coordinates.** The default camera is orthographic with extents
  from the element's CSS-px rect (origin = element center, +Y up), so
  1 world unit = 1 CSS px regardless of dpr (the viewport is the rect × dpr, so
  NDC spans the element either way). Camera sits at `z = 1` with
  `near: 0.1, far: 100`; usable plane z range is roughly (−99, 0.9].
- **React package only.** No changes to `wtc-gl`; everything builds on the
  existing `ScrollScene`/`Mesh`/`Program` primitives. Extract a
  framework-agnostic recipe later if the design stabilizes.
- **Inline default shaders.** The react package build has no GLSL plugin, so
  defaults are template strings (wrapped in wtc-gl's `glsl` no-op tag). A bare
  `<Plane>` renders a uv-gradient debug shader. `resolveShaders` pairs a lone
  user shader with the matching-`#version` default - mixed-version pairs don't
  link.
- **Plane program defaults `transparent: true, depthTest: true, depthWrite: false`.**
  The renderer's sort buckets (`Renderer.ts` `getRenderList`) silently drop
  `transparent && !depthTest` meshes, so `depthTest` stays on; `depthWrite: false`
  lets same-z planes composite in draw order without z-fighting.
- **Auto `renderOrder` per plane.** The transparent-sort tiebreaker is
  `b.id - a.id` - later-created meshes draw _first_ (underneath). DOMScene hands
  each plane an incrementing default `renderOrder` so later JSX children stack
  on top, DOM-like. Overridable via the `renderOrder` prop.
- **Rotation Euler sync runs in `scrollScene.onBeforeRender`.** `Obj.rotation`
  (Euler) is not auto-synced to the quaternion the matrix is built from;
  `updateRotation()` must run before `renderer.render` calls
  `updateMatrixWorld()`, which is earlier than `mesh.addBeforeRender` fires.
  DOMScene owns a frame-subscriber set invoked from its internal
  `onBeforeRender`; each plane registers a dirty-check (3 float compares/frame,
  `updateRotation()` only on change).
- **`u_`-prefixed matrix uniforms are reserved.** `Mesh.draw` re-assigns
  `u_projectionMatrix`, `u_viewMatrix`, `u_modelMatrix`, `u_modelViewMatrix`,
  `u_normalMatrix`, `u_cameraPosition`, `u_objectPosition` every frame (its
  injection guard checks a key that's never set). User values for these keys -
  and for the scene's `u_time`/`u_resolution`/`u_origin` - are ignored/clobbered.
- **New uniform keys after mount are unsupported.** Program uniform locations
  are fixed at link; adding keys post-creation dev-warns. Change the `fragment`
  or `vertex` prop identity to force a rebuild instead. Value changes on
  existing uniforms are always live (and cheap - the engine caches values).
- **Structural props recreate, the rest mutate.** `width`/`height`/segments/
  `vertex`/`fragment` (and `transparent`/`depthTest`/`depthWrite`, captured at
  program creation) rebuild the geometry/program/mesh trio; transforms,
  `visible`, and uniform values mutate live objects with no recreation.
- **Perspective pixel-fit.** A `<Camera type="perspective">` with no `position`
  is placed at `z = (rect.height / 2) / tan(fov/2)` so 1 unit ≈ 1 CSS px at
  z = 0. Planes off z = 0 scale with perspective - that's the point, not a bug.
- **One `<Camera>` per DOMScene.** A second concurrent camera dev-warns and
  wins (last registration takes the scene); unmounting restores the default
  ortho camera.

## Phase checklist

- [x] Tracking doc
- [x] `dom-scene-context.ts` + `default-shaders.ts`
- [x] `DOMScene`
- [x] `Plane` + `PlaneHandle`
- [x] `Camera`
- [x] Exports + package build
- [x] Demo (`packages/site/demos/react-dom-scene`)
- [x] README + end-to-end verification (headless Chromium over the demo:
      defaults, ref animation, resize refit, stacking/renderOrder, visibility + unmount cleanup, dolly orbit, camera swap + default restore - zero
      console errors under StrictMode)

## Future extensions

- More primitives: `<Box>`, `<Sphere>`, `<Triangle>`, `<PointCloud>` (geometry
  classes already exist in wtc-gl).
- `<Group>` for nested transforms (`Obj` hierarchy is already there).
- `<ImagePlane>` with texture loading (reuse `ScrollImage`/`use-scroll-image`
  patterns; `uniforms` already accepts `Uniform` instances for textures).
- DOM-anchored planes: a plane that tracks a child DOM element's rect within
  the scene (position/size sync per frame).
- `width="fill"` / `height="fill"` planes that resize with the element.
- **Instanced programs.** The stress-test demo (scene 4 of
  `react-dom-scene`) makes the current cost model plain: N `<Plane>`s means
  N shader compiles, N meshes, and N draw calls per frame. wtc-gl already
  has the primitives to collapse that - `GeometryAttribute` supports
  `instanced` (attribute divisors) and `Geometry.draw` takes the instanced
  draw path when any attribute is instanced. A `<Particles>` (or an
  `instanced` variant of `<Plane>`) could share one program and one quad
  geometry, exposing per-instance position/rotation/scale/color as instanced
  attributes updated from a single typed array each frame - one draw call
  for the whole system, with a handle API for CPU sims to write into.
- Shared geometry cache (planes with identical segment counts could share a
  `Geometry` across programs - VAOs are keyed per program already).
- `useFrame(cb)` hook exposing the frame-subscriber set to arbitrary children.
- Pointer events / raycasting on planes.
- Per-resource rebuild in `Plane` (geometry-only when size changes, program-only
  when shaders change) instead of the v1 whole-trio recreate.
- A custom reconciler (react-three-fiber style) if the primitive count grows
  beyond what per-component effects handle cleanly.
