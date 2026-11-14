# React

`@wethegit/react-wtc-gl` puts the [ScrollRenderer](/recipes/scroll-renderer) recipe into React: a provider for the canvas and hooks that add a scene for an element. {.lead}

The package is small. `ScrollRendererProvider` makes one `ScrollRenderer` and its canvas for the page, and `useScrollScene` and `useScrollImage` make a scene for an element in any component inside it, removing it again when the component unmounts. Everything you draw is still wtc-gl: programs, meshes and uniforms, built in a setup function.

## Installing

```sh
npm install @wethegit/react-wtc-gl wtc-gl
```

React 18 or later and `wtc-gl` are peer dependencies, so install both. See [Installation](/getting-started/installation) for importing shader files.

## One provider per page

Mount a `ScrollRendererProvider` near the top of the page, around everything that might draw. It renders the canvas, fixed over the viewport, before its children, and runs the render loop. In an app with routes, put it in the layout, so the canvas and its WebGL context last across pages.

```tsx
import { ScrollRendererProvider } from '@wethegit/react-wtc-gl'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ScrollRendererProvider>{children}</ScrollRendererProvider>
}
```

One provider is the point: every scene shares one canvas and one context. Two providers make two canvases, each with its own context.

## A first scene

`useScrollScene` takes a ref to an element and a setup function. Once the provider's renderer is ready, it makes a `ScrollScene` for the element and calls the setup function with the WebGL context and the scene. Build the scene there, and return a function that frees what you made:

```tsx
import { useRef } from 'react'
import { Mesh, Program, Triangle } from 'wtc-gl'
import { useScrollScene } from '@wethegit/react-wtc-gl'

const vertex = /* glsl */ `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec4 u_origin;
out vec4 colour;
void main() {
  vec2 uv = (gl_FragCoord.xy - u_origin.xy) / u_resolution;
  colour = vec4(uv, 0.5 + 0.5 * sin(u_time * 60.0), 1.0);
}`

export function Hero() {
  const ref = useRef<HTMLDivElement>(null)

  useScrollScene(ref, ({ gl, scrollScene }) => {
    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment,
      // u_time, u_resolution and u_origin, updated every frame
      uniforms: { ...scrollScene.uniforms }
    })
    new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

    return () => {
      geometry.remove()
      program.remove()
    }
  })

  return <div ref={ref} className="hero" />
}
```

The element sets the size and place of the scene, so give it a size in CSS. The canvas is transparent where no scene draws, and lets the pointer through to the page.

The uniforms, the options and the way scenes are drawn are the recipe's own, covered in [ScrollRenderer](/recipes/scroll-renderer).

## Cleaning up

When the component unmounts, the hook removes the scene from the renderer and destroys it, then calls the function your setup returned. The provider usually outlives any one scene, and so does its WebGL context: anything you don't free in that function stays in the context, and builds up as components mount and unmount across navigations.

Free whatever setup made: `program.remove()`, `geometry.remove()`, `texture.remove()`, `transformFeedback.remove()`. Leave alone what it didn't make, such as a texture shared between scenes.

React's StrictMode mounts each component twice in development, unmounting in between. The hooks handle that, making the scene, destroying it and making it again, so a cleanup that frees only what setup made works in both.

When the provider unmounts, it stops the loop and destroys the renderer and any scenes left. React removes the canvas.

## Where things live

| You want                                         | Use                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| The canvas, the render loop, per-frame callbacks | [`ScrollRendererProvider`](/react/scroll-renderer-provider)                |
| The `ScrollRenderer`, its `gl`, from anywhere    | [`useScrollRenderer()`](/react/scroll-renderer-provider#usescrollrenderer) |
| A scene drawn inside an element                  | [`useScrollScene`](/react/use-scroll-scene)                                |
| A scene with an `<img>` uploaded as a texture    | [`useScrollImage`](/react/use-scroll-image)                                |
| Meshes, programs, uniforms, cameras              | `wtc-gl` itself, from the setup function                                   |

The [React demo](https://wethegit.github.io/wtc-gl/demos/react-scroll-renderer/) has three shader sections and a transform feedback particle panel, with a pause button, in StrictMode.

## Related

- [Scroll-synced scenes](/getting-started/scroll-synced-scenes) and [ScrollRenderer](/recipes/scroll-renderer), for the recipe underneath
- [Cleaning up](/core/cleaning-up)
- API: [react-wtc-gl](/api/react/)
