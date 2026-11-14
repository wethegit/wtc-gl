# Feedback with ping-pong buffers

Draw each frame on top of the last one, for trails, smears and simple simulations that build up over time. {.lead}

A feedback effect reads the frame it drew last time, changes it a little, and draws something new on top. A shader can't read a texture while it's drawing into it, so you need two render targets: read from one, draw into the other, then swap them for the next frame. That's ping-pong, and [`Framebuffer`](/core/render-targets#feedback-with-framebuffer) does the swapping for you.

Here a dot moves across the canvas. Every frame turns the last frame slightly about the centre, fades it, and paints the dot over it, so the dot leaves a curling trail.

<Example src="cookbook-ping-pong" :height="360" demo="framebuffer" />

<<< @/examples/cookbook-ping-pong.js

## The two passes

Each frame has two draws, both full-screen triangles:

1. The step pass draws into the framebuffer. It reads the previous frame, `feedback.read.texture`, and writes the next one.
2. The show pass draws the result onto the canvas. Without it you'd never see the framebuffer's contents.

```js
// Each frame
b_previous.value = feedback.read.texture
feedback.render(renderer, { scene: stepMesh })
b_result.value = feedback.read.texture
renderer.render({ scene: showMesh })
```

`feedback.render` draws into `write`, then swaps, so straight afterwards `read` holds the frame you just drew. That's why the uniforms are set from `read` both times, and set again every frame: the two targets trade places on every render, and a uniform that kept the old texture would read the wrong one.

The step shader is where the effect lives. This one turns, shrinks and fades the last frame, then mixes in the dot:

```glsl
vec2 p = (v_uv - 0.5) * vec2(u_aspect, 1.0);
p = mat2(cos(a), sin(a), -sin(a), cos(a)) * p * 0.997;
vec4 last = texture(b_previous, p / vec2(u_aspect, 1.0) + 0.5) * u_fade;

float spot = 1.0 - smoothstep(0.035, 0.045, length(d));
colour = mix(last, vec4(u_colour, 1.0), spot);
```

The turn is done in square units, scaled by the aspect ratio, so it stays round on a wide canvas. Change how the last frame is read and you change the effect: offset the uvs to make it drift, sample with a noise texture to make it smoke, or blur it to make it spread.

## Sizing the framebuffer

`Framebuffer` takes its `width` and `height` in CSS pixels and multiplies them by `dpr`. Make it once and resize it with the canvas:

```js
import { Framebuffer } from 'wtc-gl'

const feedback = new Framebuffer(gl, {
  width: 1,
  height: 1, // sized in resize()
  dpr: renderer.dpr,
  texdepth: Framebuffer.TEXTYPE_HALF_FLOAT,
  depth: false
})

// When the canvas resizes
feedback.resize(width, height)
```

`resize` makes two new targets, so the trail starts again from nothing, and their textures are new objects. Another reason to read `feedback.read.texture` every frame rather than keeping it.

A full-screen pass doesn't need a depth buffer, so `depth: false` saves the memory. Feedback effects are often soft, so a lower `dpr` than the canvas, such as 1, costs a quarter of the pixels and is hard to tell apart.

## Fading properly

With the default 8-bit textures, a fade that multiplies by 0.97 every frame never quite reaches zero. A value of 10/255 times 0.97 rounds back to 10/255, so faint ghosts of the trail stay on the screen for good.

- `texdepth: Framebuffer.TEXTYPE_HALF_FLOAT` stores 16-bit floats, which fade smoothly to nothing. Drawing into them needs the `EXT_color_buffer_float` extension, which the renderer turns on where it's available.
- With 8-bit textures, subtract a little as well as multiplying: `max(last * u_fade - 1.0 / 255.0, 0.0)`.

A fade per frame also depends on the frame rate: a 120 Hz screen fades twice as fast as a 60 Hz one. Work it out from the frame's length instead, so the fade is the same per second:

```js
u_fade.value = Math.pow(0.15, delta) // keeps 15% after a second
```

## Premultiplied colour

The example's canvas is see-through, with `premultipliedAlpha: true`. The step pass keeps the colour premultiplied: the dot is drawn at full alpha, and the fade multiplies the colour and alpha together. So the show pass can write the texture straight to the canvas. If your step pass writes straight colour with a separate alpha, multiply it in the show pass: `colour = vec4(c.rgb * c.a, c.a)`.

On an opaque canvas, none of this matters, and the show pass can do anything it likes with the result, such as colour grading, before it reaches the screen.

## Where to go from here

- The [framebuffer demo](https://wethegit.github.io/wtc-gl/demos/framebuffer/) paints with the pointer the same way, with 32-bit float textures. [Pointer, time and resolution](/cookbook/pointer-uniforms) covers getting the pointer into the step shader.
- Seed a simulation with `data`, and step it with a shader that reads its neighbours, for reaction-diffusion or the game of life. Use `minFilter: gl.NEAREST` so each texel reads exactly.
- The [particle simulation recipe](/recipes/particle-simulation) keeps particle positions in framebuffers.

## See also

- [Render targets](/core/render-targets), for targets, their options and `Framebuffer` in full
- [Uniforms](/core/uniforms), for texture uniforms
- API: [Framebuffer](/api/wtc-gl/classes/Framebuffer), [FramebufferOptions](/api/wtc-gl/interfaces/FramebufferOptions), [RenderTarget](/api/wtc-gl/classes/RenderTarget)
