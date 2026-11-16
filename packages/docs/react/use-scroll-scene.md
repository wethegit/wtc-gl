# useScrollScene

Draw a scene inside an element, from a component. {.lead}

`useScrollScene(ref, setup, options)` makes a [ScrollScene](/recipes/scroll-renderer#scrollscene) for the element in `ref`, calls `setup` to build what it draws, and adds it to the renderer from the nearest [ScrollRendererProvider](/react/scroll-renderer-provider). When the component unmounts, it removes and destroys the scene and calls the cleanup that `setup` returned.

```tsx
import { useRef } from 'react'
import { Mesh, Program, Triangle } from 'wtc-gl'
import { useScrollScene } from '@wethegit/react-wtc-gl'

import vertex from './fill.vert'
import fragment from './waves.frag'

export function Waves() {
  const ref = useRef<HTMLElement>(null)

  useScrollScene(ref, ({ gl, scrollScene }) => {
    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: { ...scrollScene.uniforms }
    })
    new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

    return () => {
      geometry.remove()
      program.remove()
    }
  })

  return <section ref={ref} className="waves" />
}
```

## When the scene is made

The scene is made in an effect, once the provider's renderer exists and `ref.current` is an element. On the provider's first render the renderer isn't there yet, so the scene is usually made on the second; see [the first render](/react/scroll-renderer-provider#the-first-render).

Then:

1. A `ScrollScene` is made for the element, with an empty `Drawable` as its `scene` and your options.
2. `setup` is called with the context below.
3. The scene is added to the renderer, which adds its `initializedClass` to the element.

On unmount, or if the provider makes a new renderer, the scene is removed from the renderer and destroyed, and then the cleanup is called.

The effect doesn't run again when only `ref.current` changes. Render the element whenever the component is mounted, rather than behind a condition: if it isn't there when the renderer arrives, no scene is made, and if it's swapped for another element, the scene keeps tracking the old one. To draw in an element that comes and goes, put the hook in a component that renders only with it.

## The setup function

`setup` is given a [ScrollSceneSetupContext](/api/react/interfaces/ScrollSceneSetupContext):

- `gl`: the WebGL context, shared by every scene on the page.
- `scrollScene`: the scene, made and not yet added. Parent meshes to `scrollScene.scene`, and spread `scrollScene.uniforms` into programs.
- `renderer`: the `ScrollRenderer`, for `renderer.overscanPx` or the underlying `renderer.renderer`.

It runs once per scene. Changing the function between renders does nothing until the scene is made again, so read anything that changes from refs, not from the props the function closed over. Like a `useEffect` callback, it can return a cleanup function, called after the scene is removed and destroyed. Free everything setup made in it; see [cleaning up](/react/#cleaning-up).

`setup` is optional. Without it, you can build the scene later from the returned ref, but you'll have to free what you make yourself.

## Options

The third argument takes the [ScrollScene options](/recipes/scroll-renderer#scrollscene), except `element` (from the ref) and `scene` (made for you):

```tsx
useScrollScene(ref, setup, {
  camera,
  useViewport: false,
  clipToViewport: false,
  clearOnRender: true,
  elementSpace: true,
  margin: 200,
  initializedClass: 'has-webgl',
  onBeforeRender: (delta, rect) => {},
  onAfterRender: (delta, rect) => {}
})
```

`onBeforeRender` and `onAfterRender` are always the latest ones passed, so an inline arrow that reads current props or state works. Every other option is read once, when the scene is made. To change one later, set it on the scene through the returned ref, such as `sceneRef.current.clearOnRender = false`, or remount the component with a new `key`. See [UseScrollSceneOptions](/api/react/type-aliases/UseScrollSceneOptions).

A camera's aspect ratio should follow the element. `rect` in `onBeforeRender` is the element's `DOMRect`, in CSS pixels:

```tsx
import { useMemo, useRef } from 'react'
import { Box, Camera, Lights, LitProgram, Mesh } from 'wtc-gl'
import { useScrollScene } from '@wethegit/react-wtc-gl'

export function Product() {
  const ref = useRef<HTMLDivElement>(null)
  const camera = useMemo(() => {
    const camera = new Camera({ fov: 35 })
    camera.position.z = 4
    return camera
  }, [])

  useScrollScene(
    ref,
    ({ gl, scrollScene }) => {
      const geometry = new Box(gl)
      const program = new LitProgram(gl, { lights: new Lights() })
      new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)
      return () => {
        geometry.remove()
        program.remove()
      }
    },
    {
      camera,
      onBeforeRender: (delta, rect) => {
        camera.perspective({ aspect: rect.width / rect.height })
      }
    }
  )

  return <div ref={ref} className="product" />
}
```

## The returned ref

The hook returns a ref to the live `ScrollScene`, `null` before it's made and after it's removed. Read it in callbacks and effects, not while rendering: it's set in an effect, and setting it doesn't re-render.

Its uniforms are the usual way to reach in from outside the setup function. This one holds a scene's `u_time` still while a `playing` prop is off, so the scene still follows its element:

```tsx
import { useRef } from 'react'
import { useScrollScene } from '@wethegit/react-wtc-gl'

import { setup } from './waves-setup' // a setup function, as above

function Section({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const frozen = useRef(0)

  const sceneRef = useScrollScene(ref, setup, {
    onBeforeRender: () => {
      const scrollScene = sceneRef.current
      if (!scrollScene) return
      // u_time has already moved on for this frame; put it back when paused
      if (playingRef.current)
        frozen.current = scrollScene.u_time.value as number
      else scrollScene.u_time.value = frozen.current
    }
  })

  return <section ref={ref} />
}
```

## Things to know

- Scenes draw in the order they were added, which is the order their effects ran. That's usually mount order, but Suspense and conditional rendering can change it. With `clearOnRender: false`, where order matters, mount the scenes that go underneath first.
- A remounted scene, StrictMode's second mount included, starts with `u_time` at 0.
- `u_time` only moves while the element is on screen, so scenes drift apart. Share a `Uniform` of your own for a common clock.

## Related

- [React](/react/), for setting up and cleaning up
- [useScrollImage](/react/use-scroll-image), for scenes drawn from an `<img>`
- [ScrollRenderer](/recipes/scroll-renderer), for the options, the uniforms and spilling outside an element
- The [React demo](https://wethegit.github.io/wtc-gl/demos/react-scroll-renderer/)
- API: [useScrollScene](/api/react/functions/useScrollScene), [ScrollSceneSetup](/api/react/type-aliases/ScrollSceneSetup), [ScrollSceneSetupContext](/api/react/interfaces/ScrollSceneSetupContext), [UseScrollSceneOptions](/api/react/type-aliases/UseScrollSceneOptions)
