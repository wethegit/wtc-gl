# Renderer

The renderer owns the canvas and its WebGL2 context, keeps track of WebGL state, and draws a scene through a camera. {.lead}

Everything else in wtc-gl takes the renderer's context, `renderer.gl`, as its first argument. The context also points back at the renderer, as `gl.renderer`, which is how programs, geometry and textures reach its state cache.

```js
import { Renderer, Vec2 } from 'wtc-gl'

const renderer = new Renderer({
  dpr: Math.min(devicePixelRatio, 2),
  antialias: true,
  clearColour: [0.95, 0.96, 0.97, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)
renderer.dimensions = new Vec2(innerWidth, innerHeight)
```

The constructor throws if the browser can't make a WebGL2 context, so wrap it in `try` where you want a fallback.

## Options

Most options are passed straight to `getContext` as context attributes, so they can only be set when the renderer is made.

| Option                  | Default                         | What it does                                                                                          |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `canvas`                | a new canvas                    | The canvas to draw to.                                                                                |
| `width`, `height`       | `300`, `150`                    | The starting size, in CSS pixels.                                                                     |
| `dpr`                   | `devicePixelRatio`, capped at 2 | The device pixel ratio the drawing buffer is scaled by.                                               |
| `alpha`                 | `false`                         | Give the drawing buffer an alpha channel, so the page can show through.                               |
| `premultipliedAlpha`    | `false`                         | Whether the page treats the canvas's colours as premultiplied by alpha.                               |
| `antialias`             | `false`                         | Smooth the edges of triangles and lines.                                                              |
| `depth`                 | `true`                          | Give the drawing buffer a depth buffer.                                                               |
| `stencil`               | `false`                         | Give the drawing buffer a stencil buffer.                                                             |
| `preserveDrawingBuffer` | `false`                         | Keep the drawing buffer between frames, for example to read the canvas back as an image.              |
| `powerPreference`       | `'default'`                     | The GPU hint: `'default'`, `'high-performance'` or `'low-power'`.                                     |
| `autoClear`             | `true`                          | Clear before each render.                                                                             |
| `clearColour`           | `[0, 0, 0, 0]`                  | The colour to clear to, as `[r, g, b, a]` from 0 to 1. Without `alpha`, the alpha part has no effect. |

`autoClear` and `clearColour` can be changed later, as properties.

### A see-through canvas

To draw over the page, turn on `alpha` and clear to a transparent colour. With `antialias` as well, turn on `premultipliedAlpha`: smoothed edges are blended towards the transparent clear colour, and the page only composites them correctly as premultiplied colour. `LitProgram` and the helpers read `renderer.premultipliedAlpha` and premultiply their output to match, and transparent programs choose a matching blend function. In your own fragment shaders, multiply the colour by its alpha yourself.

```js
const renderer = new Renderer({
  alpha: true,
  premultipliedAlpha: true,
  antialias: true,
  clearColour: [0, 0, 0, 0]
})
```

## Size and pixel ratio

`dimensions` is the canvas size in CSS pixels. Setting it sizes the drawing buffer to that times `dpr`:

```js
renderer.dimensions = new Vec2(container.clientWidth, container.clientHeight)
```

Assign a new `Vec2`; changing `dimensions.x` in place doesn't resize anything. The renderer doesn't set the canvas's CSS size, so give it one, such as `width: 100%; height: 100%`, or it shows at `dpr` times the size.

`dpr` can be changed after the renderer is made; set `dimensions` again afterwards so the drawing buffer follows. A `dpr` above 2 costs a lot of pixels for little visible gain, which is why the default is capped there.

## Rendering

`render()` draws a scene. Only `scene` is required:

```js
renderer.render({ scene, camera })
```

| Option        | Default             | What it does                                                                                              |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `scene`       |                     | The root `Obj` to draw.                                                                                   |
| `camera`      |                     | The camera to draw through. Without one, meshes get no camera matrices and nothing is culled.             |
| `target`      | `null`              | A [render target](/core/render-targets) to draw into, or `null` for the canvas.                           |
| `clear`       | `autoClear` decides | `true` or `false` to clear, or not, for this render only.                                                 |
| `update`      | `true`              | Update the scene's world matrices first.                                                                  |
| `sort`        | `true`              | Sort into opaque, transparent and depth-test-free groups; see [draw order](/core/scene-graph#draw-order). |
| `frustumCull` | `true`              | Skip meshes outside the camera's view.                                                                    |
| `viewport`    | the whole target    | The viewport, as `[size, position]` in device pixels.                                                     |
| `scissor`     |                     | Keep the clear and the drawing inside a rectangle: `true` for the viewport, or `[size, position]`.        |

Each render binds the target and sets the viewport, clears, updates the world matrices of the scene and then the camera, collects the visible meshes, sorts them and draws them. Turn `update` off when you've already called `scene.updateMatrixWorld()` that frame, for example to raycast against up-to-date matrices before drawing.

To draw a second scene over the first, such as an overlay, render it without clearing:

```js
renderer.render({ scene, camera })
renderer.render({ scene: overlay, camera, clear: false })
```

## Viewport and scissor

`viewport` and `scissor` take `[size, position]` as two `Vec2`s, in device pixels, measured from the bottom-left of the canvas as WebGL does. The scissor keeps the clear inside the rectangle too, so two views can share a canvas, each clearing only its own half:

```js
const { dpr } = renderer
const width = innerWidth * dpr
const height = innerHeight * dpr
const left = [new Vec2(width / 2, height), new Vec2(0, 0)]
const right = [new Vec2(width / 2, height), new Vec2(width / 2, 0)]

renderer.render({ scene, camera, viewport: left, scissor: true })
renderer.render({ scene, camera: topCamera, viewport: right, scissor: true })
```

Each camera's aspect ratio should match its viewport. The scissor test is turned off again after the render, unless it was on before. The [many meshes demo](https://wethegit.github.io/wtc-gl/demos/many-meshes/) draws two views like this, and [scroll-synced scenes](/getting-started/scroll-synced-scenes) use the same idea to draw into page elements.

## State caching

Changing WebGL state costs time, so the renderer keeps a record of what it has set: blending, depth testing and writing, face culling, the bound framebuffer, the viewport and scissor, the bound textures, program and vertex array, and uploaded uniform values. Each program applies its own state through the renderer before it draws, and calls that wouldn't change anything are skipped.

The record only knows about changes made through the renderer. If you change state on `gl` directly, the renderer may skip a call it needed. Use the renderer's own methods and properties instead:

```js
renderer.enable(gl.BLEND)
renderer.setBlendFunc(gl.ONE, gl.ONE)
renderer.depthMask = false
renderer.cullFace = gl.FRONT
renderer.bindFramebuffer() // the canvas
```

`gl.colorMask` and stencil calls are the exception: the renderer only undoes changes it made itself, so setting these directly keeps working for programs that don't set them.

`renderer.getExtension(name)` looks an extension up once per context. `EXT_color_buffer_float` and `OES_texture_float_linear` are enabled from the start, for rendering to and filtering float textures. `renderer.parameters` holds `maxTextureUnits` and `maxAnisotropy`.

## Context loss

The browser can take the WebGL context away, after a GPU reset or when too many pages hold contexts. The renderer asks for it back, and while it's gone `contextLost` is true and `render()` does nothing. `onContextLost` and `onContextRestored` let you show a fallback or redraw:

```js
renderer.onContextLost = () => canvas.classList.add('is-lost')
renderer.onContextRestored = () => canvas.classList.remove('is-lost')
```

When the context comes back, the renderer resets its state cache, enables its extensions again, reapplies the clear colour, and rebuilds every resource it tracks:

- **Programs** are compiled and linked again.
- **Geometry** makes new buffers and uploads each attribute's `data` again. Vertex arrays are rebuilt when it next draws.
- **Textures** make new WebGL textures and upload their image or data again when next used.
- **Render targets** make new framebuffers and textures. What was drawn into them is gone, so draw it again.
- **Transform feedbacks** start the simulation again from their attributes' `data`.

Anything you made on `gl` directly isn't restored. Pass an object with a `restoreContext()` method to `renderer.track()` to have it called on restore. Only a weak reference is kept, so keep your own:

```js
const myBuffer = {
  buffer: gl.createBuffer(),
  restoreContext() {
    this.buffer = gl.createBuffer()
    // upload the data again
  }
}
renderer.track(myBuffer)
```

Each restore increments `renderer.contextVersion`, which resources compare with their own so each is rebuilt only once.

To test this, lose and restore the context on purpose:

```js
const ext = renderer.getExtension('WEBGL_lose_context')
ext.loseContext()
setTimeout(() => ext.restoreContext(), 1000)
```

## Disposing

`renderer.dispose()` stops listening for context loss and clears the state caches. If the renderer made its own canvas, it also releases the WebGL context straight away, rather than leaving it until the canvas is garbage collected. A canvas passed in with `canvas` keeps its context, since a canvas only ever has one and a new renderer on the same canvas would need it.

`dispose()` doesn't take the canvas out of the page; do that yourself. Remove the programs, geometry and textures you made first; [Cleaning up](/core/cleaning-up) goes through the order.

## See also

- [Your first 3D scene](/getting-started/first-3d-scene), which puts a renderer, a camera and a scene together.
- [Cameras](/core/cameras) and [Scene graph](/core/scene-graph).
- [Renderer](/api/wtc-gl/classes/Renderer), [RendererOptions](/api/wtc-gl/interfaces/RendererOptions) and [RenderOptions](/api/wtc-gl/interfaces/RenderOptions) in the API reference.
