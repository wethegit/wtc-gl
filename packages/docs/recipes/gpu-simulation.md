# GPUSimulation

Run a simulation on the GPU, with its state in float textures: particles, cellular automata, fluids and anything else where every item updates each frame. {.lead}

A `GPUSimulation` keeps one texel per item, with up to four values in each state texture and up to four state textures. Each `step()` draws your shader over every texel: it reads the current state and writes the next, then the two swap. Because each item can read any texel, items can see their neighbours, which [transform feedback](/simulation/transform-feedback) can't do.

<Example src="gpu-particles" :height="360" />

<<< @/examples/gpu-particles.js

## Making a simulation

```js
import { GPUSimulation } from 'wtc-gl'

const sim = new GPUSimulation(gl, {
  size: 128, // 128 × 128 texels: 16,384 particles
  state: ['position', 'velocity'],
  fragment: step,
  initial: () => ({
    position: [Math.random() * 2 - 1, Math.random() * 2 - 1, 0, 1]
  })
})
```

- `size` is the width and height of the state textures, in texels. A number is square. `sim.count` is the number of items.
- `state` names the state textures, in the order the step shader writes them. One state, called `state`, is the default.
- `initial` sets the starting values: a function of each item's index and texel `(index, x, y)` that returns a `vec4` per state (a plain array when there's one state, or an object by name), or a `Float32Array` per state name. Anything left out starts at 0.

## The step shader

The step shader is GLSL 3.00. It reads each state as a `sampler2D` called `b_<name>`, at `v_uv`, the texel being updated, and writes each state to its own output, in the order of `state`:

```glsl
#version 300 es
precision highp float;
uniform sampler2D b_position;
uniform sampler2D b_velocity;
uniform float u_delta;
in vec2 v_uv;
layout(location = 0) out vec4 position;
layout(location = 1) out vec4 velocity;

void main() {
  vec4 p = texture(b_position, v_uv);
  vec4 v = texture(b_velocity, v_uv);
  v.y -= 9.8 * u_delta;
  position = p + v * u_delta;
  velocity = v;
}
```

Besides your own uniforms, it gets:

| Uniform        | Type        | What it is                              |
| -------------- | ----------- | --------------------------------------- |
| `b_<name>`     | `sampler2D` | Each state, as it was before this step. |
| `u_resolution` | `vec2`      | The state's size in texels.             |
| `u_time`       | `float`     | The simulated time, in seconds.         |
| `u_delta`      | `float`     | This step's time, in seconds.           |

To read a neighbour, step by one texel: `texture(b_state, v_uv + vec2(1.0, 0.0) / u_resolution)`. Set `wrap: gl.REPEAT` and reads past one edge come in from the other, for a world that wraps around.

## Stepping

Call `step` once a frame, with the frame's time in seconds:

```js
sim.step(delta)
```

Larger steps make simple integrations unstable. Several small steps a frame keep it steady at any frame rate, as the example does. `u_time` adds up the steps, so `reset()` starts it again from 0 along with the state.

## Drawing the results

`points()` makes a mesh with one point per item. Its program gets the simulation's uniforms plus any of yours, and a `reference` attribute: the item's texel, to read its state in the vertex shader:

```js
const particles = sim.points({
  vertex, // texture(b_position, reference).xy
  fragment,
  transparent: true
})
renderer.render({ scene: particles })
```

`sim.uniforms` is updated in place after every step, so any program you give those uniforms reads the latest state. Spread them into a full-screen pass to draw a field, as the [webcam automaton demo](https://wethegit.github.io/wtc-gl/demos/webcam-ca/) does, or into an [`InstancedMesh`](/geometry/instancing)'s program to place a shape per item. `sim.textures` holds the latest state textures by name.

## Precision

The state is 32-bit floats by default. `type: gl.HALF_FLOAT` halves the memory and is plenty for colours, flags and small values; positions that need precision over a large area want full floats. Rendering into float textures needs `EXT_color_buffer_float`, which the renderer turns on where it's available, as it is in every current desktop and mobile browser.

The state isn't filtered (`filter: gl.NEAREST`), so each read is exactly one item's values.

## Resizing and cleaning up

`resize(size)` makes new state textures for a new number of items, and starts again from `initial`. `remove()` frees the state textures, the step pass, and the meshes `points` made.

## From ParticleSimulation

`GPUSimulation` replaces the deprecated [`ParticleSimulation`](/recipes/particle-simulation): it keeps its own state textures and step pass, so there's no `Framebuffer` to wire up by hand.

## See also

- [GPUSimulation](/api/wtc-gl/classes/GPUSimulation) and [GPUSimulationOptions](/api/wtc-gl/interfaces/GPUSimulationOptions) in the API reference.
- [Transform feedback](/simulation/transform-feedback), for simulations where each item only needs its own values.
- [Render targets](/core/render-targets), which the state lives in.
