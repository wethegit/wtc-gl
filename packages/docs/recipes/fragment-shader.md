# FragmentShader

A canvas, a full-screen triangle, a render loop and two uniforms, ready for a fragment shader. {.lead}

`FragmentShader` is the quickest way to put a shader on a page. It makes a [Renderer](/core/renderer) and appends its canvas, covers the canvas with a `Triangle`, makes a [Program](/core/programs-and-shaders) from your shaders, and starts a `requestAnimationFrame` loop that keeps `u_time` and `u_resolution` up to date. [Your first shader](/getting-started/first-shader) is the short version; this page covers every option.

<Example src="first-shader" :height="320" demo="fragment-shader" />

<<< @/examples/first-shader.js

## Options

Everything is optional. With no options at all you get a demo gradient filling the window.

```js
import { FragmentShader, Uniform, Vec2 } from 'wtc-gl'

const shader = new FragmentShader({
  vertex, // default: passes the triangle through, with a v_uv varying
  fragment, // default: a demo colour gradient
  container: document.querySelector('.hero'), // default: document.body
  autoResize: false, // default: true, follow the window
  dimensions: new Vec2(800, 450), // CSS pixels, used when autoResize is off
  uniforms: { u_pointer: pointer }, // added to u_time and u_resolution
  rendererProps: { dpr: 2, alpha: true }, // passed to the Renderer
  onInit(renderer) {}, // once, after the renderer is made
  onBeforeRender(time) {}, // each frame, before drawing
  onAfterRender(time) {} // each frame, after drawing
})
```

- `vertex` and `fragment` are the shader sources. The default vertex shader is GLSL 1.00, with `attribute vec3 position`, `attribute vec2 uv` and a `varying vec2 v_uv`. A GLSL 3.00 fragment shader needs a GLSL 3.00 vertex shader to match, like the one in the example above.
- `container` is the element the canvas is appended to. Pass `null` to leave the canvas out of the page, and append `shader.gl.canvas` yourself.
- `autoResize` (default `true`) sizes the canvas to the window and listens for the window's `resize` event. Turn it off to size the canvas to `dimensions` instead, which defaults to the window size when the shader is made.
- `uniforms` are added to the program alongside `u_time` and `u_resolution`. The keys are the names in the shader. A `u_time` or `u_resolution` of your own is replaced by the recipe's.
- `rendererProps` are [RendererOptions](/api/wtc-gl/interfaces/RendererOptions) for the renderer. The recipe sets `clearColour` to opaque white unless you pass one. Pass `canvas` to draw into a canvas you already have.
- `onInit` is called with the renderer once it's made, before the program, the triangle and the first frame. Use it for renderer state the program depends on, such as an extension.
- `onBeforeRender` and `onAfterRender` are called every frame, with the `requestAnimationFrame` timestamp in milliseconds, `time`. It's the timestamp, not the time since the last frame. They're bound to the shader, so a `function` (not an arrow) can use `this`.

See [FragmentShaderOptions](/api/wtc-gl/interfaces/FragmentShaderOptions) for the types.

## u_time and u_resolution

Every frame the recipe adds the time since the last frame, in milliseconds and capped at 50, multiplied by `0.00005`, to `u_time`. At 60 frames a second that's about 0.05 a second, so `u_time` reaches 1 after 20 seconds. Shaders usually scale it up (`u_time * 20.0` is roughly seconds). The cap means a frame after a long pause, such as when the tab was in the background, moves time on by no more than 0.0025.

`u_resolution` is the canvas size in device pixels: the CSS size times the renderer's `dpr`. It's the same space as `gl_FragCoord`, so `gl_FragCoord.xy / u_resolution` runs from 0 to 1 across the canvas.

Both are `Uniform`s on the shader, `shader.u_time` and `shader.u_resolution`, and their values can be set: `shader.u_time.value = 0` starts time again.

```glsl
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time * 40.0), 1.0);
}
```

## Sizing the canvas yourself

With `autoResize` on, `shader.resize()` sizes the canvas to the window and updates `u_resolution`. It always reads the window, so with `autoResize` off, resize the canvas and the uniform yourself, for instance from a `ResizeObserver` on the container:

```js
import { FragmentShader, Vec2 } from 'wtc-gl'

const container = document.querySelector('.hero')
const shader = new FragmentShader({ fragment, container, autoResize: false })

new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect
  shader.dimensions = new Vec2(width, height)
  shader.renderer.dimensions = shader.dimensions
  shader.u_resolution.value = shader.dimensions.scaleNew(
    shader.renderer.dpr
  ).array
}).observe(container)
```

The renderer only sets the canvas's drawing buffer, `width` and `height` in device pixels. Its size on the page is up to your CSS, in either mode. Without any, a canvas with a `dpr` of 2 shows at twice its CSS size:

```css
.hero canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

For a full-window shader, `position: fixed; inset: 0` does the same job.

## Playing and stopping

`playing` starts and stops the loop. Stopping cancels the frame that was already requested and restarts the frame clock, so the frame after `playing = true` adds no time, however long the shader was stopped. `u_time` keeps its value.

```js
shader.playing = false // pause
shader.playing = true // carry on from the same u_time
```

`resetTime()` restarts the frame clock without stopping, so the next frame adds no time. It doesn't set `u_time` back to 0.

To drive the frames yourself, from a scroll position or another loop, stop it and call `render` with a timestamp in milliseconds. The live example above does this, so the page can pause it while it's off screen:

```js
shader.playing = false

function frame(t) {
  shader.render(t)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

Don't call `render` while `playing` is on: it requests the next frame itself, so each call would start another loop.

## Feedback with post

Set `post` to a [Framebuffer](/core/render-targets#feedback-with-framebuffer), and the recipe draws each frame into it instead of the canvas, then swaps its two targets. The shader can read `post.read.texture`, the frame before, which is how you make trails, smears, reaction-diffusion and other effects that build on themselves.

Nothing reaches the canvas until you draw it there. `onAfterRender` is the place: by then `post.read` holds the frame that was just drawn.

<Example src="fragment-shader-post" :height="320" />

<<< @/examples/fragment-shader-post.js

The steps are:

1. Add a texture uniform for the last frame, and set it to `shader.post.read.texture` in `onBeforeRender`. The targets swap on every render, so set it every frame.
2. Make a `Framebuffer` the size of the canvas: the same CSS size and the renderer's `dpr`. Turn `depth` off, since a full-screen pass doesn't need one. Resize it with the canvas.
3. In `onAfterRender`, draw a second mesh that shows `shader.post.read.texture` with `shader.renderer.render`. It can share the recipe's triangle, `shader.mesh.geometry`.

The framebuffer's textures are 8-bit by default. A fade that multiplies the last frame by a number just under 1 gets stuck at faint values, since each step rounds back up; subtracting a little too, as the example does, makes sure it reaches 0. For more precision, pass `texdepth: Framebuffer.TEXTYPE_HALF_FLOAT`. The [ping-pong cookbook](/cookbook/ping-pong) goes further, with a simulation step and a separate display pass.

Set `post` back to `null` to draw to the canvas again.

## Cleaning up

`destroy()` stops the loop, removes the window `resize` listener, and deletes the triangle and the program. If the renderer made the canvas, it's removed from the page and its WebGL context is released. A canvas you passed as `rendererProps.canvas` stays where it is. `destroy()` returns the canvas either way.

```js
shader.post?.remove() // a post framebuffer is yours to remove
shader.destroy()
```

Programs, textures and framebuffers you made yourself, `post` among them, aren't touched. Remove them before calling `destroy()`, while the context is still alive. See [Cleaning up](/core/cleaning-up).

## Related

- [Your first shader](/getting-started/first-shader)
- [Programs and shaders](/core/programs-and-shaders) and [Uniforms](/core/uniforms)
- [Render targets](/core/render-targets), for `Framebuffer`
- [Pointer uniforms](/cookbook/pointer-uniforms), for passing the pointer into a shader
- The [fragment shader demo](https://wethegit.github.io/wtc-gl/demos/fragment-shader/)
- API: [FragmentShader](/api/wtc-gl/classes/FragmentShader), [FragmentShaderOptions](/api/wtc-gl/interfaces/FragmentShaderOptions), [Framebuffer](/api/wtc-gl/classes/Framebuffer)
