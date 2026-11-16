# ScrollRenderer

One canvas over the page, drawing a scene inside each of several elements, kept in step with scrolling. {.lead}

`ScrollRenderer` owns a single WebGL canvas and a `requestAnimationFrame` loop. Each element that wants WebGL gets a `ScrollScene`, and every frame the renderer reads the element's position, points the viewport and scissor at its rectangle, and draws its scene there. [Scroll-synced scenes](/getting-started/scroll-synced-scenes) is the quick introduction; this page covers every option, the uniforms, `ScrollImage` and `ScrollHTML`, and how it works.

It needs a whole page to show, so there's no live example here. The demos are:

- [Basic](https://wethegit.github.io/wtc-gl/demos/scroll-renderer-basic/): three shaders on one canvas.
- [Homepage](https://wethegit.github.io/wtc-gl/demos/scroll-renderer-homepage/): shaders, particles and layered scenes that spill out of their elements.
- [Image cloth](https://wethegit.github.io/wtc-gl/demos/scroll-image-cloth/): `ScrollImage` and `ScrollHTML` as cloth that hangs below its element.
- [Blades](https://wethegit.github.io/wtc-gl/demos/scroll-blades/): images simulated with transform feedback, over a fixed background scene.

## Why one canvas

A canvas per element runs into trouble on a long page. Each canvas needs its own WebGL context, browsers only allow a handful at once (older ones are lost without warning), and contexts can't share programs, textures or geometry. One canvas means one context: every scene can share a noise texture, a program or a loaded model, and compiling a shader happens once.

The cost is that the canvas covers the viewport, so it has to be transparent where nothing is drawn, let the pointer through, and redraw whenever the page scrolls. `ScrollRenderer` handles the first and last of those; `pointer-events: none` on the canvas handles the second.

## How a frame is drawn

Each frame, while `playing`:

1. `onBeforeRender(delta)` is called, with the milliseconds since the last frame, at most 50.
2. The canvas's drawing buffer is matched to its size on the page, and in absolute layout the canvas is moved back over the viewport.
3. The whole canvas is cleared to transparent.
4. For each scene, in the order they were added, that's on screen and has a size:
   1. The element's rectangle is read with `getBoundingClientRect()` and turned into device pixels, from the bottom left as WebGL counts.
   2. The scene's `u_time`, `u_resolution` and `u_origin` (and `u_elementSize`) are updated.
   3. The scene's `onBeforeRender(delta, rect)` is called.
   4. The scene is drawn with the viewport set to the rectangle (if `useViewport`) and the scissor test limiting drawing to it (if `clipToViewport`). With the scissor on, `clearOnRender` clears just that rectangle first.
   5. The scene's `onAfterRender(delta, rect)` is called.
5. `onAfterRender(delta)` is called.

Whether a scene is on screen comes from an `IntersectionObserver` on its element, so scenes far down the page cost nothing but the observer. With no scenes added, the canvas is cleared once and the loop idles.

## The renderer

```js
import { ScrollRenderer } from 'wtc-gl'

const scrollRenderer = new ScrollRenderer({
  rendererProps: { antialias: true, premultipliedAlpha: true },
  layout: 'fixed', // or 'absolute'
  overscan: 0.25, // absolute layout only
  onBeforeRender(delta) {},
  onAfterRender(delta) {}
})
Object.assign(scrollRenderer.canvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none'
})
document.body.appendChild(scrollRenderer.canvas)
scrollRenderer.playing = true
```

- `rendererProps` are [RendererOptions](/api/wtc-gl/interfaces/RendererOptions) for the underlying `Renderer`. `alpha` defaults to `true` here, and `autoClear` is always `false`, since the scroll renderer does its own clearing. `premultipliedAlpha: true` avoids dark fringes where antialiased edges meet the page. Pass `canvas` to draw into a canvas you already have; you then position it and remove it yourself.
- `layout` (default `'fixed'`) and `overscan` (default `0.25`) decide how the canvas stays over the viewport; see [below](#fixed-or-absolute).
- `onBeforeRender` and `onAfterRender` are called once a frame, around all the scenes, with the milliseconds since the last frame, capped at 50. They're plain properties too, so you can set them later.

The renderer doesn't append or style the canvas: `scrollRenderer.canvas` is yours to place. The scroll renderer's own properties are `renderer` (the `Renderer`), `gl`, `canvas`, `layout`, `overscan` and `overscanPx`.

### Adding and removing scenes

`addScene(scrollScene)` adds a scene to the end of the list and adds its `initializedClass` to its element. Scenes draw in the order they were added, so add backgrounds before what goes over them.

`removeScene(scrollScene)` stops drawing it. It doesn't destroy the scene: call `scrollScene.destroy()` as well when you're done with it, to disconnect its observer.

### Playing

`playing` starts and stops the loop; nothing is drawn until you set it to `true`. Stopping resets the frame clock, so the first frame after starting again adds no time to the scenes. Stopping also cancels the frame that was already requested, so stopping and starting again within a frame doesn't run two loops.

## ScrollScene

```js
import { ScrollScene, Obj } from 'wtc-gl'

const scrollScene = new ScrollScene({
  element: document.querySelector('.hero'),
  scene: new Obj(),
  camera, // optional
  useViewport: true,
  clipToViewport: true,
  clearOnRender: true,
  elementSpace: false,
  margin: 0,
  initializedClass: 'scroll-scene--initialized',
  onBeforeRender(delta, rect) {},
  onAfterRender(delta, rect) {}
})
scrollRenderer.addScene(scrollScene)
```

- `element` is the element the scene is drawn in, and `scene` the root of what's drawn: an `Obj` (or `Drawable`) to parent meshes to, or a single mesh.
- `camera` draws the scene in 3D. Without one, meshes are drawn with no camera matrices, so the vertex shader's output is clip space: a [Triangle](/geometry/primitives) passed straight through covers the viewport, which is the element's rectangle. Keep a camera's `aspect` in step with the element, from `rect` in `onBeforeRender`.
- `useViewport` (default `true`) sets the viewport to the element's rectangle, so clip space covers the element. Turn it off to keep the viewport on the whole canvas and place things with `u_origin` and `u_elementSize`.
- `clipToViewport` (default `true`) scissors drawing to the element. Turn it off to let the scene spill over its edges; it's then never cleared, whatever `clearOnRender` says.
- `clearOnRender` (default `true`) clears the element's rectangle before drawing. The whole canvas has already been cleared, so this only matters when scenes overlap: turn it off to draw over the scenes before it, such as particles over a background.
- `elementSpace` (default `false`) adds the `u_elementSize` uniform.
- `margin` (default `0`) is the `IntersectionObserver`'s `rootMargin`, in pixels. A positive margin starts drawing the scene that far before its element comes on screen, which a scene that spills outside its element needs; a negative one stops it early.
- `initializedClass` (default `'scroll-scene--initialized'`) is added to the element when the scene is added to a renderer. Hide parts of the page that rely on WebGL in CSS, and show them with this class.
- `onBeforeRender` and `onAfterRender` are called each frame the scene is drawn, with the milliseconds since the last frame (at most 50) and the element's `DOMRect` in CSS pixels. They're properties too.

`visible` is whether the observer last saw the element on screen, and `destroy()` disconnects the observer. Every option is also a property, so `scrollScene.clearOnRender = false` works between frames, but `margin` only applies when the scene is made.

See [ScrollSceneOptions](/api/wtc-gl/interfaces/ScrollSceneOptions).

### The uniforms

Each scene owns a set of uniforms, updated just before it's drawn. Spread `scrollScene.uniforms` into each of its programs' uniforms:

| Uniform         | Type    | What it holds                                                                                                                                                |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `u_time`        | `float` | Grows by the milliseconds since the last frame (at most 50) times `0.00005`, about 0.05 a second, and only while the scene is drawn. Each scene has its own. |
| `u_resolution`  | `vec2`  | The element's size in device pixels.                                                                                                                         |
| `u_origin`      | `vec4`  | `xy`: the element's bottom-left corner in device pixels on the canvas, the space of `gl_FragCoord`. `zw`: the element's centre in clip space, -1 to 1.       |
| `u_elementSize` | `vec2`  | With `elementSpace: true` only: the element's size in clip-space units, so 2 when it's as wide or as tall as the canvas.                                     |

```js
const program = new Program(gl, {
  vertex,
  fragment,
  uniforms: { ...scrollScene.uniforms, u_pointer: pointer }
})
```

`gl_FragCoord` is always in canvas pixels, so element-relative coordinates in the fragment shader are `(gl_FragCoord.xy - u_origin.xy) / u_resolution`, with or without `useViewport`. Since a scene's `u_time` stops while its element is off screen, scenes drift apart; share a `Uniform` of your own if they need the same clock.

Adding to `scrollScene.uniforms` before spreading it makes the extra uniform part of the set, which suits code that builds programs from it in more than one place.

### Spilling outside the element

`elementSpace` with `useViewport: false` and `clipToViewport: false` draws the scene on the whole canvas, positioned relative to its element, so it can hang over the edges. In the vertex shader, a position from -1 to 1 across the element becomes canvas clip space like this:

```glsl
#version 300 es
in vec3 position; // a Plane with width and height 2
in vec2 uv;
uniform vec4 u_origin;
uniform vec2 u_elementSize;
out vec2 v_uv;

void main() {
  v_uv = uv;
  vec2 p = position.xy * u_elementSize * 0.5 + u_origin.zw;
  gl_Position = vec4(p, 0.0, 1.0);
}
```

Give the scene a `margin` as large as the overhang, so it starts drawing before its element is on screen, and turn off `depthTest` on programs that overlap other scenes, since the depth buffer is shared. The image cloth and blades demos work this way.

## ScrollImage

`ScrollImage` is a `ScrollScene` that uploads an image to a texture, for effects on images that are on the page. It takes the scene's options, plus `gl` and an optional `image`:

```js
import { ScrollImage, Obj, Mesh, Program, Triangle } from 'wtc-gl'

const img = document.querySelector('img.hero')
const scrollImage = new ScrollImage({
  gl: scrollRenderer.gl,
  element: img,
  scene: new Obj()
})

new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex,
    fragment,
    uniforms: { ...scrollImage.uniforms }
  })
}).setParent(scrollImage.scene)

scrollRenderer.addScene(scrollImage)
```

It adds two uniforms to the set:

| Uniform       | Type        | What it holds                                                     |
| ------------- | ----------- | ----------------------------------------------------------------- |
| `u_image`     | `sampler2D` | The image, clamped at the edges, with no mipmaps.                 |
| `u_imageSize` | `vec2`      | The image's natural size in pixels, `[0, 0]` until it has loaded. |

When `image` is left out, `element` must be the `<img>`. Pass `image` to track one element while drawing an image from elsewhere, such as an `<img>` the CSS hides inside a wrapper. If the image hasn't loaded yet, the texture is filled when it does.

The texture is the image as it is. Fitting it to the element is the shader's job, which is where `u_imageSize` comes in. To cover the element, as `object-fit: cover` does:

```glsl
#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_imageSize;
uniform vec2 u_resolution;
uniform vec4 u_origin;
out vec4 colour;

void main() {
  vec2 uv = (gl_FragCoord.xy - u_origin.xy) / u_resolution;
  // Scale the shorter side to fit, and centre the longer one
  vec2 ratio = (u_resolution / u_resolution.y) / (u_imageSize / u_imageSize.y);
  vec2 scale = ratio.x > 1.0 ? vec2(1.0, 1.0 / ratio.x) : vec2(ratio.x, 1.0);
  uv = (uv - 0.5) * scale + 0.5;
  colour = texture(u_image, uv);
}
```

The `<img>` stays in the page underneath. Hide it with `opacity: 0` (or `visibility: hidden` on an image you track through a wrapper), so it keeps its layout and the browser still loads it, and show it again if WebGL isn't there, using `initializedClass`. An image from another origin needs CORS headers and `crossorigin="anonymous"` to be uploaded.

`scrollImage.texture` is the [Texture](/core/textures). `destroy()` deletes it, disconnects the observer, and stops waiting for the image if it hasn't loaded yet.

## ScrollHTML

`ScrollHTML` does the same for any HTML element, using the experimental [HTML-in-Canvas API](https://github.com/WICG/html-in-canvas): text, forms and all, copied into a texture every frame. It's only in Chromium behind the `chrome://flags/#canvas-draw-element` flag, so treat it as an experiment, not something to ship.

```js
import { ScrollHTML, Obj } from 'wtc-gl'

const scrollHTML = new ScrollHTML({
  gl: scrollRenderer.gl,
  element: document.querySelector('.card-anchor'),
  htmlElement: document.querySelector('.card'),
  scene: new Obj()
})
```

It adds `u_html` (`sampler2D`, the element as last painted) and `u_htmlSize` (`vec2`, the capture canvas's size in device pixels).

It moves `htmlElement` into a hidden `<canvas layoutsubtree>` appended to the body, which is how the API draws it, so it's no longer where it was in the page. `element` stays put, for the scene to track. With only `element`, or the same element twice, that element is moved, and a hidden placeholder `<div>` the same size holds its place in the page; the scene tracks the placeholder. The capture canvas is `scrollHTML.captureCanvas`: position it over the element, with a tiny opacity and `pointer-events: auto`, to let the pointer reach a form inside it, as the image cloth demo does.

Where the API isn't supported, the uniforms exist but the texture stays empty. `destroy()` puts the element back where it was, in place of the placeholder or in its old spot among its parent's children, and only at the end of `document.body` when neither is still in the page. It also removes the capture canvas and placeholder, and deletes the texture.

## Fixed or absolute

`layout` decides how the canvas stays over the viewport.

`'fixed'`, the default, expects a canvas with `position: fixed` that never moves. Each frame reads every element's position and draws it there. Browsers scroll on a separate thread from JavaScript, though, so a scroll that lands between two frames moves the page and not the drawing. On touch devices, with momentum scrolling, scenes can be seen lagging behind their elements.

`'absolute'` expects a canvas with `position: absolute` at the top of the document, which scrolls with the page between frames, so scenes stay attached to their elements. Each frame the renderer moves the canvas back over the viewport with a `transform`. The lag then shows at the canvas's top or bottom edge instead, so the canvas is made taller than the viewport by `overscan`, a fraction of the viewport height above and below:

```js
const scrollRenderer = new ScrollRenderer({
  layout: 'absolute',
  overscan: 0.25
})
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

- The renderer sets the canvas's `height` and `transform`; you set the rest.
- Append it to the body (or another element that isn't positioned), so it's placed against the document. The body itself mustn't be positioned, since the end of the content is measured from it.
- Near the end of the page the canvas stops at the end of the content instead of making the page longer, so the band below shrinks and the one above grows by as much.
- Give scenes a `margin` of `overscanPx`, the band's height in CSS pixels, so they start drawing as they enter the band rather than the viewport.
- More overscan hides faster scrolls, at the cost of drawing more pixels. `overscan` is ignored, and `overscanPx` is 0, in fixed layout.

Don't use absolute layout for scenes on elements fixed to the viewport, such as a full-screen background: those are the ones that lag in it. The blades demo stays on fixed layout for that reason.

## Performance

- Off-screen scenes skip everything, including their callbacks. Keep `margin` small unless a scene spills over its element.
- Every visible scene is a separate pass with its own viewport and scissor, and each reads its element's position with `getBoundingClientRect()` every frame. Tens of scenes are fine; hundreds of small ones may be better as one scene.
- Turning off `clipToViewport` draws over the whole canvas. A full-screen triangle with no scissor and no viewport fills every pixel, so limit spilling scenes to geometry that only covers what it needs.
- The canvas is drawn at the renderer's `dpr`, capped at 2 by default. Pass a lower `dpr` in `rendererProps` for heavy shaders on high-density screens.
- Share programs, textures and geometry between scenes where you can: they're all in one context.
- Set `playing = false` when nothing on the page needs to move.

## Cleaning up

`destroy()` stops the loop, disconnects the renderer's `ResizeObserver`, destroys every scene and disposes of the renderer. If the renderer made its canvas, its WebGL context is released straight away; a canvas you passed in keeps its context, so a new renderer can use it. It returns the canvas for you to remove:

```js
scrollRenderer.destroy().remove()
```

Remove the scenes' programs, geometries and textures first if the context will be kept. A `ScrollImage`'s or `ScrollHTML`'s own texture goes when its scene is destroyed. See [Cleaning up](/core/cleaning-up).

## Related

- [Scroll-synced scenes](/getting-started/scroll-synced-scenes), the introduction
- [React](/react/), for `ScrollRendererProvider`, `useScrollScene` and `useScrollImage`
- [Scroll distortion](/cookbook/scroll-distortion) and the [image cloth showcase](/showcase/scroll-image-cloth)
- [Renderer](/core/renderer), for viewports and scissors
- API: [ScrollRenderer](/api/wtc-gl/classes/ScrollRenderer), [ScrollRendererOptions](/api/wtc-gl/interfaces/ScrollRendererOptions), [ScrollScene](/api/wtc-gl/classes/ScrollScene), [ScrollSceneOptions](/api/wtc-gl/interfaces/ScrollSceneOptions), [ScrollImage](/api/wtc-gl/classes/ScrollImage), [ScrollImageOptions](/api/wtc-gl/interfaces/ScrollImageOptions), [ScrollHTML](/api/wtc-gl/classes/ScrollHTML), [ScrollHTMLOptions](/api/wtc-gl/interfaces/ScrollHTMLOptions)
