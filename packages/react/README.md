# @wethegit/react-wtc-gl

React components and hooks for [wtc-gl](https://github.com/wethegit/wtc-gl) recipes.

Currently wraps the **ScrollRenderer** recipe: render multiple independent WebGL scenes on a single fixed canvas, each scissor-tested to a DOM element's bounds and driven by one `requestAnimationFrame` loop.

## Install

```sh
npm install @wethegit/react-wtc-gl wtc-gl
```

`react >= 18` and `wtc-gl` are peer dependencies.

## Usage

Mount one `ScrollRendererProvider` per page (it owns the fixed, full-viewport canvas), then register scenes from descendant components.

```tsx
import { useRef } from 'react'
import { Mesh, Program, Triangle } from 'wtc-gl'
import { ScrollRendererProvider, useScrollScene } from '@wethegit/react-wtc-gl'

import vertex from './hero.vert'
import fragment from './hero.frag'

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null)

  useScrollScene(ref, ({ gl, scrollScene }) => {
    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment,
      // u_time, u_resolution and u_origin, auto-updated every frame
      uniforms: { ...scrollScene.uniforms }
    })
    new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

    // Free GL resources when the section unmounts - the provider (and its
    // WebGL context) may outlive any one scene.
    return () => {
      geometry.remove()
      program.remove()
    }
  })

  return <div ref={ref} className="hero" />
}

export default function Page() {
  return (
    <ScrollRendererProvider>
      <HeroSection />
    </ScrollRendererProvider>
  )
}
```

The setup function runs once when the scene is created and, like a `useEffect` callback, may return a cleanup function. Always free the GL resources setup created there (`program.remove()`, `geometry.remove()`, `transformFeedback.remove()`) - with a long-lived provider (e.g. mounted in a layout), anything you don't free accumulates in the WebGL context as scenes mount and unmount across navigations.

For image-based scenes (`u_image` / `u_imageSize` uniforms) use `useScrollImage` with a ref to an `<img>`:

```tsx
const ref = useRef<HTMLImageElement>(null)
useScrollImage(ref, ({ gl, scrollScene }) => {
  /* ... */
})
return <img ref={ref} src={src} alt="" />
```

### Declarative scenes

For scenes that are mostly "some planes in a box", skip the setup callback and describe the scene as JSX. `DOMScene` renders a real `<div>` (className/style pass through) and hosts the GL content in its bounds; `Plane` children become meshes sized in **CSS pixels** (origin at the element centre, +Y up):

```tsx
const planeRef = useRef<PlaneHandle>(null)

<ScrollRendererProvider>
  <DOMScene className="hero">
    <Plane /> {/* fills the element with a debug shader */}
    <Plane
      ref={planeRef}
      width={300}
      height={200}
      position={[100, 0, 0]}
      fragment={frag}
      uniforms={{ u_mix: 0.5 }}
    />
  </DOMScene>
</ScrollRendererProvider>
```

The ref exposes an imperative `PlaneHandle` for per-frame work without React re-renders: mutate `position`/`rotation`/`scale` (Euler rotations are synced to the quaternion automatically) or call `setUniform(name, value)`. `mesh`/`program`/`geometry` are there as escape hatches.

An optional `<Camera>` child replaces the scene's default pixel-mapped orthographic camera - `type` is `'perspective'` (placed at the pixel-fit distance, so planes keep their CSS-px size at z=0), `'orthographic'`, or `'dolly'` (drag to orbit, wheel to zoom; handlers attach to the scene's div). Unmounting it restores the default camera. See `FEATURE-dom-scene.md` for design notes and the roadmap.

## API

- `<ScrollRendererProvider rendererProps? onBeforeRender? onAfterRender? playing? className? style?>` - creates the `ScrollRenderer` and canvas.
- `useScrollRenderer()` - the nearest provider's `ScrollRenderer` (or `null` while it initializes).
- `useScrollScene(elementRef, setup?, options?)` - registers a `ScrollScene`; returns a ref to it.
- `useScrollImage(elementRef, setup?, options?)` - registers a `ScrollImage`; returns a ref to it.
- `<DOMScene {...divProps} margin? clipToViewport? clearOnRender? onBeforeRender? onAfterRender?>` - a `<div>` hosting a declarative scene.
- `<Plane width? height? position? rotation? scale? visible? fragment? vertex? uniforms? doubleSided? renderOrder? setup? ref?>` - a mesh in the nearest `DOMScene`; ref receives a `PlaneHandle`.
- `<Camera type? instance? fov? near? far? position? lookAt? dolly? ref?>` - replaces the scene's default camera while mounted.
- `useDOMSceneContext()` - the nearest `DOMScene`'s internals, for custom scene children.

`options` accepts everything the underlying `ScrollScene` / `ScrollImage` constructors do (`camera`, `useViewport`, `clipToViewport`, `clearOnRender`, `elementSpace`, `margin`, `initializedClass`, per-frame callbacks, …).

## Gotchas

**React 18 StrictMode** mounts every component twice in development (mount → unmount → mount). The scene hooks handle this: the effect cleanup removes and destroys the scene between the two mounts, and the second mount recreates it. If scenes flicker or disappear in dev but not production, the likely culprit is the cleanup function returned by your setup - make sure it only frees resources that setup itself created.

**Two-render cycle.** The provider creates the renderer in an effect, which runs after the first paint, so `useScrollRenderer()` returns `null` on the first render pass and scene hooks register on the second. This is normal - nothing is visible in the gap because the canvas is transparent.

**Setup runs once.** The setup function is called when the scene is created (once the renderer and element are available) and never again - changing it between renders has no effect until the component remounts. The per-frame `onBeforeRender` / `onAfterRender` options are the exception: the latest ones are always called, so inline arrows capturing fresh props or state are fine there.

**Scene ordering.** Scenes render in registration order, which is mount order. If you composite scenes with `clearOnRender: false`, be aware that Suspense boundaries or conditional rendering can change mount order between dev and prod builds.

**`u_time` resets on remount.** A remounted scene starts with `u_time = 0`. Shaders that use time as a seed (rather than just an animation offset) will restart on remount.

**Reserved uniforms.** In `Plane` programs, `u_time` / `u_resolution` / `u_origin` are the scene's live uniforms, and the `u_*Matrix` / `u_cameraPosition` / `u_objectPosition` family is re-assigned by the engine every frame. Supplying your own values for these keys has no effect (a dev warning fires).

**Plane structural props recreate, the rest mutate.** Changing `width`/`height`/segments or `fragment`/`vertex` rebuilds the plane's GL resources; `position`/`rotation`/`scale`/`visible` and uniform *values* update in place. New uniform *keys* after mount are unsupported - change the shader prop identity to force a rebuild.

**Keep `depthTest` on for transparent planes.** The renderer's sorter silently drops meshes whose program is `transparent` with `depthTest: false`. `Plane` defaults (`transparent: true, depthTest: true, depthWrite: false`) are chosen to avoid this; override with care.

## Performance and memory testing

### Verifying cleanup with heap snapshots (Chrome DevTools)

The main leak risk is a `ScrollScene` whose `IntersectionObserver` is never disconnected. The hooks call `scene.destroy()` on unmount, so a leak here usually means scenes were registered outside the hooks. To check:

1. Open **Memory** tab → take a baseline heap snapshot.
2. Mount a component that registers a scene, interact with it, then unmount it.
3. Click **Collect garbage** (the bin icon), then take a second snapshot.
4. Switch to **Comparison** view between the two snapshots.
5. Filter by `IntersectionObserver` and `ScrollScene`. Neither should show a positive delta - if they do, the scene is not being destroyed on unmount.

Repeat with StrictMode enabled to ensure the double-invoke cycle leaves no residue.

### Verifying the render loop stops

When the provider unmounts, the `requestAnimationFrame` loop should stop:

1. Open **Performance** tab → start recording.
2. Unmount the provider (navigate away, or conditionally render it out).
3. Stop recording and inspect the flame chart. There should be no further `render` frames from `ScrollRenderer` after unmount.

### Checking IntersectionObserver pause behaviour

`ScrollScene` skips rendering when its element is off screen. Confirm off-screen scenes aren't burning GPU time:

1. Open **Performance** tab → record while scrolling a scene fully off screen.
2. Verify the per-scene render cost (scissor, draw calls) drops to zero for that scene in the GPU track.
3. A simpler proxy: pass `onBeforeRender: () => console.count('render: hero')` in the hook options and confirm it stops incrementing when the element is not in the viewport.

### Memory pressure with many scenes

If the page has a large number of scenes (10+):

- Each unmounted component should reduce the renderer's registered scene count by one.
- Use the **Performance Monitor** panel (three-dot menu in DevTools) to watch JS heap size over a mount/unmount cycle. A sawtooth that returns to baseline after GC is healthy; a staircase is a leak.
