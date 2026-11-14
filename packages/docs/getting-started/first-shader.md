# Your first shader

Draw a full-screen fragment shader with the `FragmentShader` recipe. {.lead}

`FragmentShader` sets up everything a single shader needs: a renderer and canvas, a triangle that covers it, a render loop, and two uniforms kept up to date, `u_time` and `u_resolution`. You supply the fragment shader.

<Example src="first-shader" :height="320" demo="fragment-shader" />

<<< @/examples/first-shader.js

On a page of its own, the shader can fill the window. Leave out `container` and `autoResize`, and `FragmentShader` appends its canvas to the body and resizes with the window:

```js
import { FragmentShader } from 'wtc-gl'
import fragment from './effect.frag'

new FragmentShader({ fragment })
```

## The shaders

The fragment shader runs once for every pixel of the canvas.

- `u_resolution` is the canvas size in device pixels, so `gl_FragCoord.xy / u_resolution` runs from 0 to 1 across it.
- `u_time` grows steadily while the shader plays.

The default vertex shader is GLSL 1.00. To write the fragment shader in GLSL 3.00 (`#version 300 es`, with `in`, `out` and a named output), pass a matching vertex shader too, as the example does.

## Your own uniforms

Pass more uniforms with `uniforms`, and change their values in `onBeforeRender`:

```js
import { FragmentShader, Uniform } from 'wtc-gl'

const pointer = new Uniform({
  name: 'pointer',
  value: [0, 0],
  kind: 'float_vec2'
})

const shader = new FragmentShader({
  fragment,
  uniforms: { u_pointer: pointer }
})

addEventListener('pointermove', (e) => {
  pointer.value = [e.clientX / innerWidth, 1 - e.clientY / innerHeight]
})
```

## Playing and stopping

`shader.playing` starts and stops the render loop. `shader.destroy()` stops it for good, and frees the canvas and its WebGL context.
