# ScrollRenderer — React integration plan

## Architecture

`ScrollRenderer` is a singleton: one canvas, one render loop, one GL context. In React this maps to a **context provider at the layout or page level**, with individual scene components consuming that context via a hook.

```
<ScrollRendererProvider>   ← creates ScrollRenderer, owns canvas
  <Page>
    <HeroSection />        ← creates + registers a ScrollScene
    <FeatureSection />     ← creates + registers a ScrollScene
  </Page>
</ScrollRendererProvider>
```

---

## Provider

The provider owns the `ScrollRenderer` lifecycle. Pass a `<canvas>` ref so React owns the DOM node — this avoids the teardown problem where `destroy()` would need to remove the canvas itself.

```tsx
// scroll-renderer-context.tsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ScrollRenderer } from 'wtc-gl'

const ScrollRendererCtx = createContext<ScrollRenderer | null>(null)

export function ScrollRendererProvider({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderer, setRenderer] = useState<ScrollRenderer | null>(null)

  useEffect(() => {
    const r = new ScrollRenderer({ rendererProps: { canvas: canvasRef.current! } })
    r.playing = true
    setRenderer(r)
    return () => {
      r.destroy()
      setRenderer(null)
    }
  }, [])

  return (
    <ScrollRendererCtx.Provider value={renderer}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      {children}
    </ScrollRendererCtx.Provider>
  )
}

export const useScrollRenderer = () => useContext(ScrollRendererCtx)
```

---

## Scene hook

The hook takes a ref to the anchor element and a factory that receives `gl` and returns the scene graph. The factory is called once on mount — keep it stable (don't pass an inline function without `useCallback`).

```tsx
// use-scroll-scene.ts
import { useEffect, useRef, type RefObject } from 'react'
import { ScrollScene, type ScrollSceneOptions } from 'wtc-gl'
import { useScrollRenderer } from './scroll-renderer-context'

type Factory = (gl: WebGL2RenderingContext) => Pick<ScrollSceneOptions, 'scene' | 'camera'>

export function useScrollScene(
  elementRef: RefObject<HTMLElement>,
  factory: Factory,
  options: Omit<ScrollSceneOptions, 'element' | 'scene' | 'camera'> = {}
) {
  const renderer = useScrollRenderer()
  // Hold the scene in a ref so cleanup always sees the right instance
  const sceneRef = useRef<ScrollScene | null>(null)

  useEffect(() => {
    if (!renderer || !elementRef.current) return

    const { scene, camera } = factory(renderer.gl as WebGL2RenderingContext)
    const scrollScene = new ScrollScene({ element: elementRef.current, scene, camera, ...options })
    renderer.addScene(scrollScene)
    sceneRef.current = scrollScene

    return () => {
      renderer.removeScene(scrollScene)
      scrollScene.destroy()
      sceneRef.current = null
    }
  }, [renderer]) // re-runs if renderer changes (e.g. StrictMode remount)

  return sceneRef
}
```

### Usage

```tsx
function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null)

  useScrollScene(
    containerRef,
    (gl) => {
      const drawable = new Drawable(gl)
      new Mesh(gl, {
        geometry: new Triangle(gl),
        program: new Program(gl, { vertex, fragment, uniforms: { ... } }),
      }).setParent(drawable)
      return { scene: drawable }
    },
    { onBeforeRender: (delta) => { /* update uniforms */ } }
  )

  return <div ref={containerRef} style={{ height: '100vh' }} />
}
```

---

## Gotchas

**React 18 StrictMode** mounts every component twice in development (mount → unmount → mount). The effect cleanup runs between the two mounts, so `removeScene` + `scene.destroy()` are called before the scene is re-added. This is the correct behaviour — the double-invoke is specifically to surface missing cleanup. If you see scenes flicker or disappear in dev but not production, the cleanup path is at fault.

**Two-render cycle.** The provider sets `renderer` in state inside a `useEffect`, which runs after the first paint. Child hooks that depend on `renderer` will fire on the second render. This is normal — scenes won't be registered until the renderer is ready. Nothing is visible in the gap because the canvas is transparent.

**Factory stability.** If you pass an inline arrow function as `factory`, it's a new reference every render, but because the effect only depends on `renderer` it won't re-run spuriously. Still, wrapping with `useCallback` is good practice if the factory captures props that could change.

**Scene ordering.** `addScene` appends. If you use `clearOnRender: false` to composite scenes, mount order matters. Suspense boundaries or conditional rendering can change the order between dev and prod builds.

**`u_time` resets on remount.** A new `ScrollScene` starts with `u_time = 0`. Shaders that use time as a seed (rather than just animation offset) will restart on remount.

---

## Performance and memory testing

### Verifying cleanup with heap snapshots (Chrome DevTools)

The main leak risk is a `ScrollScene` whose `IntersectionObserver` is never disconnected. To check:

1. Open **Memory** tab → take a baseline heap snapshot.
2. Mount a component that registers a scene, interact with it, then unmount it.
3. Click **Collect garbage** (the bin icon), then take a second snapshot.
4. Switch to **Comparison** view between the two snapshots.
5. Filter by `IntersectionObserver` and `ScrollScene`. Neither should show a positive delta — if they do, `scene.destroy()` is not being called on unmount.

Repeat with StrictMode enabled to ensure the double-invoke cycle leaves no residue.

### Verifying the render loop stops

When the page is hidden or the provider unmounts, the `requestAnimationFrame` loop should stop:

1. Open **Performance** tab → start recording.
2. Unmount the provider (navigate away, or conditionally render it out).
3. Stop recording and inspect the flame chart. There should be no further `render` frames from `ScrollRenderer` after unmount.

### Checking IntersectionObserver pause behaviour

`ScrollScene` skips rendering when `visible` is false. Confirm off-screen scenes aren't burning GPU time:

1. Open **Performance** tab → record while scrolling a scene fully off screen.
2. Verify the per-scene render cost (scissor, draw calls) drops to zero for that scene in the GPU track.
3. A simpler proxy: add a `console.count('render: hero')` in `onBeforeRender` and confirm it stops incrementing when the element is not in the viewport.

### Memory pressure with many scenes

If the page has a large number of scenes (10+):

- Check that `#scenes` array in `ScrollRenderer` doesn't grow unboundedly. Each unmounted component should reduce the count by one.
- Use the **Performance Monitor** panel (three-dot menu in DevTools) to watch JS heap size over a mount/unmount cycle. A sawtooth that returns to baseline after GC is healthy; a staircase is a leak.
