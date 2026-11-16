# ScrollRendererProvider

Make the page's `ScrollRenderer` and its canvas, and share it with every component inside. {.lead}

`ScrollRendererProvider` renders a `<canvas>`, then its children. Once it has mounted, it makes a [ScrollRenderer](/recipes/scroll-renderer) that draws into that canvas, starts its loop, and passes it down through context, where [`useScrollScene`](/react/use-scroll-scene) and [`useScrollImage`](/react/use-scroll-image) pick it up. Mount one per page; see [React](/react/) for where.

```tsx
import { ScrollRendererProvider } from '@wethegit/react-wtc-gl'

export function Page() {
  return (
    <ScrollRendererProvider
      rendererProps={{ antialias: true, premultipliedAlpha: true }}
      layout="fixed"
      onBeforeRender={(delta) => {}}
      playing
    >
      <Hero />
      <Gallery />
    </ScrollRendererProvider>
  )
}
```

## Props

| Prop             | Default   | What it does                                                                                                         |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `children`       |           | The page. Components anywhere inside can add scenes.                                                                 |
| `rendererProps`  | `{}`      | [RendererOptions](/api/wtc-gl/interfaces/RendererOptions) for the `Renderer`, except `canvas`. Read on mount.        |
| `layout`         | `'fixed'` | `'fixed'` or `'absolute'`: how the canvas stays over the viewport. Read on mount.                                    |
| `overscan`       | `0.25`    | With `layout="absolute"`, the extra canvas above and below the viewport, as a fraction of its height. Read on mount. |
| `onBeforeRender` |           | Called every frame before the scenes draw, with the milliseconds since the last frame, at most 50.                   |
| `onAfterRender`  |           | Called every frame after the scenes draw, with the same.                                                             |
| `playing`        | `true`    | Whether the loop runs. Can change at any time.                                                                       |
| `className`      |           | A class for the canvas. When set, the default styles aren't applied.                                                 |
| `style`          |           | Styles for the canvas, merged over the defaults (or used alone with `className`).                                    |

The options are the recipe's, so [ScrollRenderer](/recipes/scroll-renderer#the-renderer) explains them in full. In `rendererProps`, `alpha` defaults to `true`, `autoClear` is always turned off, and the canvas is always the provider's own.

### Read once, on mount

The renderer is made once, when the provider mounts, and kept until it unmounts. `rendererProps`, `layout` and `overscan` are read then, and changing them later does nothing. To change them, remount the provider with a new `key`, which makes a new renderer and new scenes.

`onBeforeRender` and `onAfterRender` are the opposite: the latest ones are always called, so an inline arrow that reads current props or state is fine. `playing` is applied whenever it changes.

```tsx
import { useState } from 'react'
import { ScrollRendererProvider } from '@wethegit/react-wtc-gl'

function Page() {
  const [paused, setPaused] = useState(false)
  const reduceMotion = usePrefersReducedMotion() // your own hook

  return (
    <ScrollRendererProvider playing={!paused && !reduceMotion}>
      {/* ... */}
      <button onClick={() => setPaused((p) => !p)}>Pause</button>
    </ScrollRendererProvider>
  )
}
```

Stopping the loop stops everything moving and stops scenes following their elements, since they're only redrawn by the loop. To freeze a scene while still tracking scroll, keep `playing` on and hold its `u_time` instead, as the [React demo](https://wethegit.github.io/wtc-gl/demos/react-scroll-renderer/) does with its pause button.

## The canvas

Without a `className`, the canvas gets inline styles that suit the layout. For `'fixed'`:

```css
position: fixed;
inset: 0;
width: 100%;
height: 100lvh;
pointer-events: none;
z-index: 0;
```

For `'absolute'`, the same without `inset` and `height`, and with `position: absolute; top: 0; left: 0`, since the renderer sets the height and transform itself. `100lvh` is the largest viewport height, so the canvas still covers the screen on mobile browsers as their toolbars slide away.

`style` is merged over these, which is the way to change one or two, such as `z-index` to put the canvas in front of the page:

```tsx
<ScrollRendererProvider style={{ zIndex: 10 }}>
```

A `className` replaces them, for positioning the canvas entirely in your own CSS.

The canvas comes before the children in the DOM. With `layout="absolute"`, it's positioned against its nearest positioned ancestor, which must be the document, so don't wrap the provider in anything with `position: relative`, and don't position the body.

## The first render

The renderer is made in an effect, after the first render, so on the first pass there's no renderer yet and the hooks wait. They make their scenes on the next pass, once it's there. Nothing shows in between, since the canvas starts transparent.

## useScrollRenderer

`useScrollRenderer()` returns the nearest provider's `ScrollRenderer`, or `null` before it has been made, or with no provider above. Use it for the shared `gl`, the renderer's options, or to make scenes outside the hooks:

```tsx
import { useEffect, useState } from 'react'
import { Texture } from 'wtc-gl'
import { useScrollRenderer } from '@wethegit/react-wtc-gl'

function useNoiseTexture(src: string) {
  const scrollRenderer = useScrollRenderer()
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    if (!scrollRenderer) return
    const t = new Texture(scrollRenderer.gl)
    const image = new Image()
    image.onload = () => {
      t.image = image
      setTexture(t)
    }
    image.src = src
    return () => t.remove()
  }, [scrollRenderer, src])

  return texture
}
```

Expect `null`, and put the renderer in the effect's dependencies. A scene you make yourself with `new ScrollScene()` and `addScene` needs removing and destroying yourself too; the hooks do that for you. `scrollRenderer.overscanPx` is useful as a scene's `margin` in absolute layout.

## Related

- [React](/react/), for setting up
- [useScrollScene](/react/use-scroll-scene) and [useScrollImage](/react/use-scroll-image)
- [ScrollRenderer](/recipes/scroll-renderer), for the options and the layouts
- API: [ScrollRendererProvider](/api/react/functions/ScrollRendererProvider), [ScrollRendererProviderProps](/api/react/interfaces/ScrollRendererProviderProps), [useScrollRenderer](/api/react/functions/useScrollRenderer)
