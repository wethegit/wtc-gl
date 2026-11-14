# Pointer, time and resolution

Feed the pointer, the time and the canvas size into a fragment shader, in units the shader can use directly. {.lead}

Most full-screen shaders want the same three inputs: where the pointer is, how much time has passed, and how big the canvas is. Each arrives as a [uniform](/core/uniforms). The work is in the units. A fragment shader knows where it is through `gl_FragCoord`, in device pixels from the bottom left, while a pointer event gives CSS pixels from the top left of the page. Convert the pointer once, in JavaScript, to match `gl_FragCoord`, and the shader can compare the two directly.

<Example src="cookbook-pointer" :height="360" demo="fragment-shader" />

<<< @/examples/cookbook-pointer.js

## Resolution

Set the resolution to the canvas's drawing buffer, `gl.canvas.width` and `gl.canvas.height`. These are in device pixels, the CSS size times the renderer's `dpr`, the same units as `gl_FragCoord`:

```js
resize(width, height) {
  renderer.dimensions = new Vec2(width, height)
  u_resolution.value = [gl.canvas.width, gl.canvas.height]
}
```

In the shader, divide by the height to get coordinates that are the same scale both ways, centred on the middle of the canvas:

```glsl
vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
```

`p.y` runs from -0.5 to 0.5, and `p.x` as far as the aspect ratio takes it. A circle drawn with `length(p)` stays round however the canvas is shaped. Dividing by `u_resolution` instead gives 0 to 1 both ways, which suits reading a texture but stretches shapes.

## Pointer

Listen on the canvas, and convert the event to the canvas's device pixels, with y up:

```js
const canvas = gl.canvas
const onMove = (e) => {
  const rect = canvas.getBoundingClientRect()
  target[0] = (e.clientX - rect.left) * (canvas.width / rect.width)
  target[1] = (rect.bottom - e.clientY) * (canvas.height / rect.height)
}
canvas.addEventListener('pointermove', onMove)
```

Scaling by `canvas.width / rect.width` rather than `devicePixelRatio` matters. The renderer caps its `dpr` (at 2, in these examples), so on a 3× phone the two disagree, and the pointer lands in the wrong place. The ratio also stays right if CSS stretches the canvas.

Then convert the pointer in the shader the same way as `gl_FragCoord`, so both are in the same space:

```glsl
vec2 m = (u_pointer - 0.5 * u_resolution) / u_resolution.y;
float d = length(p - m); // distance to the pointer, in canvas heights
```

Pointer events cover the mouse, pens and touch alike. A touch only moves while the finger is down, so listen for `pointerdown` too, so that a tap moves the target. On touch screens, dragging over the canvas scrolls the page and cancels the pointer. Set `touch-action: none` on the canvas if the shader should follow a dragging finger instead, at the cost of the page not scrolling from there.

Remove the listeners when you're done with the canvas:

```js
canvas.removeEventListener('pointermove', onMove)
```

## Smoothing

Moving the uniform straight to the pointer looks twitchy. Ease it towards the target every frame instead. With a fixed fraction per frame, the easing depends on the frame rate, so work out the fraction from the frame's length:

```js
frame(time, delta) {
  const follow = 1 - Math.exp(-delta * 10)
  const p = u_pointer.value
  p[0] += (target[0] - p[0]) * follow
  p[1] += (target[1] - p[1]) * follow
}
```

Larger numbers than 10 follow more tightly. Changing the uniform's array in place is fine: a uniform compares its values, not the array, to decide whether to upload.

The same easing works for anything that should fade in and out. The example eases `u_hover` towards 1 while the pointer is over the canvas, and back to 0 on `pointerleave`, so the effect doesn't snap off when the pointer leaves.

## Time

Give the shader the time in seconds, as a float:

```js
u_time.value = time
```

A float has about seven significant figures, so after a day or so of running, `sin(u_time * 40.0)` starts to step. For a page that might stay open, wrap the time on a period that suits the animation, such as `time % 3600`, or keep the phases in JavaScript.

[`FragmentShader`](/recipes/fragment-shader) makes `u_time` and `u_resolution` for you. Its `u_time` doesn't count seconds: it grows by a fraction of each frame's length, so scale it in the shader to taste. Add a pointer uniform of your own through its `uniforms` option.

## See also

- [Your first shader](/getting-started/first-shader), for the full-screen triangle and the program
- [Uniforms](/core/uniforms), for uniform kinds and how values are compared
- [Feedback with ping-pong buffers](/cookbook/ping-pong), to paint with the pointer
- [Pick and drag](/cookbook/pick-and-drag), for the pointer in a 3D scene
- API: [Uniform](/api/wtc-gl/classes/Uniform), [Renderer](/api/wtc-gl/classes/Renderer), [FragmentShader](/api/wtc-gl/classes/FragmentShader)
