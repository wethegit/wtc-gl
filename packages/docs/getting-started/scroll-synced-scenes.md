# Scroll-synced scenes

Draw a scene inside each of several page elements, all on one canvas, kept in place as the page scrolls. {.lead}

A canvas per element soon runs into trouble: each canvas needs its own WebGL context, browsers only allow a few at once, and contexts can't share programs or textures. `ScrollRenderer` keeps one canvas over the viewport instead. Each element gets a `ScrollScene`, and every frame the renderer reads the element's position, sets the viewport and scissor to its rectangle, and draws its scene there. Scenes whose elements are off screen are skipped.

It needs a whole page to show, so there's no live example here. See the [basic demo](https://wethegit.github.io/wtc-gl/demos/scroll-renderer-basic/), with three shaders on one canvas, and the [homepage demo](https://wethegit.github.io/wtc-gl/demos/scroll-renderer-homepage/), which mixes shaders, particles and layered scenes.

## Setting up

Make the renderer, style its canvas to cover the viewport, and append it. Then make a scene for each element and add it. The `vertex` and `fragment` shaders are in the next section.

```js
import {
  ScrollRenderer,
  ScrollScene,
  Obj,
  Mesh,
  Program,
  Triangle
} from 'wtc-gl'

const scrollRenderer = new ScrollRenderer()
Object.assign(scrollRenderer.canvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none'
})
document.body.appendChild(scrollRenderer.canvas)

const { gl } = scrollRenderer

for (const element of document.querySelectorAll('.effect')) {
  const scrollScene = new ScrollScene({ element, scene: new Obj() })

  // A triangle that covers the viewport, which is the element's rectangle
  new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: { ...scrollScene.uniforms },
      transparent: true
    })
  }).setParent(scrollScene.scene)

  scrollRenderer.addScene(scrollScene)
}

scrollRenderer.playing = true
```

`pointer-events: none` lets clicks and scrolling through to the page. The canvas is cleared to transparent every frame, and the renderer has an alpha channel, so the page shows wherever no scene draws. Pass options for the underlying [Renderer](/core/renderer) as `rendererProps`, such as `{ antialias: true }`; `autoClear` is always turned off, since the scroll renderer does its own clearing.

## The uniforms

Each `ScrollScene` keeps a set of uniforms up to date as it's drawn. Spread `scrollScene.uniforms` into your program's uniforms to use them:

| Uniform        | Type    | What it holds                                                                                                                                             |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `u_time`       | `float` | Time that advances while the scene is drawn, slowly: about 0.05 a second.                                                                                 |
| `u_resolution` | `vec2`  | The element's size in device pixels.                                                                                                                      |
| `u_origin`     | `vec4`  | `xy` is the element's bottom-left corner in device pixels, in the same space as `gl_FragCoord`. `zw` is the element's centre in clip space, from -1 to 1. |

With `elementSpace: true` there's a fourth, `u_elementSize` (`vec2`): the element's size in clip-space units, for positioning geometry relative to the element while drawing on the whole canvas.

`gl_FragCoord` is in canvas pixels, so subtract `u_origin.xy` to work in the element's own pixels:

```glsl
#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_origin;

out vec4 colour;

void main() {
  vec2 uv = (gl_FragCoord.xy - u_origin.xy) / u_resolution;
  float wave = 0.5 + 0.5 * sin(uv.x * 12.0 + u_time * 100.0);
  colour = vec4(uv, wave, 1.0);
}
```

The vertex shader passes the triangle through as it is:

```glsl
#version 300 es
in vec3 position;

void main() {
  gl_Position = vec4(position, 1.0);
}
```

## A 3D scene in an element

Give a scene a `camera` to draw it in 3D. The camera's aspect ratio should follow the element's, which `onBeforeRender` can set each frame from the element's rect, in CSS pixels:

```js
import { Camera, Mesh, Box, Lights, LitProgram } from 'wtc-gl'

const camera = new Camera({ fov: 35 })
camera.position.z = 4

const scrollScene = new ScrollScene({
  element: document.querySelector('.product'),
  scene: new Obj(),
  camera,
  onBeforeRender(delta, rect) {
    camera.perspective({ aspect: rect.width / rect.height })
  }
})

const box = new Mesh(gl, {
  geometry: new Box(gl),
  program: new LitProgram(gl, { lights: new Lights() })
})
box.setParent(scrollScene.scene)
scrollRenderer.addScene(scrollScene)
```

Without a camera, meshes are drawn with no camera matrices, so the vertex shader's output goes straight to clip space, as with the triangle above.

## Scene options

The defaults fit a scene drawn inside its element. These change that:

- `useViewport` (default `true`) sets the viewport to the element's rectangle. Turn it off to draw across the whole canvas, using `u_origin` to place things.
- `clipToViewport` (default `true`) scissors drawing to the element. Turn it off to let the scene spill outside it; it's then never cleared.
- `clearOnRender` (default `true`) clears the element's rectangle before drawing. Turn it off to draw over the scenes before it, such as particles over a background.
- `margin` (default `0`) is in pixels, passed to the `IntersectionObserver` that decides whether the scene is on screen. A positive margin keeps it drawing while it's that far off screen.
- `initializedClass` (default `'scroll-scene--initialized'`) is added to the element once the scene is added to a renderer, so CSS can reveal parts of the page that rely on WebGL.
- `onBeforeRender` and `onAfterRender` are called each frame the scene is drawn, with the time since the last frame in milliseconds and the element's rect.

Scenes are drawn in the order they were added.

## Fixed or absolute

The canvas is `position: fixed` by default, and scenes are placed from their elements' positions every frame. On touch devices, momentum scrolling moves the page between frames, so scenes can lag behind their elements for a moment.

`layout: 'absolute'` avoids that. The canvas sits in the document and scrolls with the page, and the renderer moves it back over the viewport each frame. It's drawn taller than the viewport by `overscan` (a fraction of the viewport height above and below, 0.25 by default), so the band that comes into view between frames has already been drawn:

```js
const scrollRenderer = new ScrollRenderer({ layout: 'absolute' })
Object.assign(scrollRenderer.canvas.style, {
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  pointerEvents: 'none'
})
document.body.appendChild(scrollRenderer.canvas)

const scrollScene = new ScrollScene({
  element,
  scene,
  margin: scrollRenderer.overscanPx
})
```

In this layout the renderer sets the canvas's height and transform itself. Append it to the body, which mustn't be positioned, so it's placed against the document. A `margin` of `overscanPx` starts each scene drawing as it enters the band, before it's on screen. Avoid this layout for scenes on elements fixed to the viewport, which then show the lag instead.

## Stopping and cleaning up

`playing` starts and stops the render loop. `removeScene(scrollScene)` stops drawing a scene, and `scrollScene.destroy()` disconnects its observer. `destroy()` stops everything, destroys every scene and disposes of the renderer, then returns the canvas for you to remove:

```js
scrollRenderer.destroy().remove()
```

Remove the scenes' geometries and programs too if you're keeping the page; see [Cleaning up](/core/cleaning-up).

## React

`@wethegit/react-wtc-gl` wraps all of this. `ScrollRendererProvider` owns the renderer and its canvas, and `useScrollScene` adds a scene for an element and removes it on unmount:

```jsx
import { useRef } from 'react'
import { Program, Mesh, Triangle } from 'wtc-gl'
import { ScrollRendererProvider, useScrollScene } from '@wethegit/react-wtc-gl'

function Hero() {
  const ref = useRef(null)

  useScrollScene(ref, ({ gl, scrollScene }) => {
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: { ...scrollScene.uniforms }
    })
    new Mesh(gl, { geometry: new Triangle(gl), program }).setParent(
      scrollScene.scene
    )
  })

  return <div ref={ref} className="hero" />
}

export function Page() {
  return (
    <ScrollRendererProvider>
      <Hero />
    </ScrollRendererProvider>
  )
}
```

The [React guide](/react/) covers the provider, `useScrollScene` and `useScrollImage`, and the [React API](/api/react/) lists every prop and option.

## See also

- [The ScrollRenderer recipe](/recipes/scroll-renderer), for every option, `ScrollImage` and `ScrollHTML`, layouts and performance.
- [ScrollRenderer](/api/wtc-gl/classes/ScrollRenderer), [ScrollRendererOptions](/api/wtc-gl/interfaces/ScrollRendererOptions), [ScrollScene](/api/wtc-gl/classes/ScrollScene) and [ScrollSceneOptions](/api/wtc-gl/interfaces/ScrollSceneOptions) in the API reference.
- [ScrollImage](/api/wtc-gl/classes/ScrollImage), a scene that loads an `<img>` into a texture for its shader, and [ScrollHTML](/api/wtc-gl/classes/ScrollHTML), which does the same for an element's HTML with the experimental HTML-in-Canvas API.
- [Renderer](/core/renderer), for the viewport and scissor underneath.
