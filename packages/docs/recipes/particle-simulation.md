# ParticleSimulation

A canvas, a render loop and a cloud of points, each tied to one texel of a simulation texture. {.lead}

`ParticleSimulation` sets up the drawing half of a GPU particle system. It makes a [Renderer](/core/renderer), a `PointCloud` with a particle for every texel of a `textureSize` × `textureSize` texture, a program from your shaders and a mesh drawn with `gl.POINTS`, then runs a `requestAnimationFrame` loop. Each particle has a `reference` attribute: the coordinates of its texel, so the vertex shader can look up where the particle is.

The simulation itself is yours. The recipe doesn't make any textures: you keep the particles' state in a [Framebuffer](/core/render-targets#feedback-with-framebuffer), step it each frame in `onBeforeRender`, and hand its texture to the points. For particles whose state lives in buffers rather than textures, [transform feedback](/simulation/transform-feedback) is often simpler.

There's no demo that uses it at the moment, so the code below is the whole of a working example.

## A flow field

The state texture holds one particle per texel: its position in `xy` and its velocity in `zw`. A step pass, drawn into the framebuffer each frame, reads the last state and writes the next. The points read the latest state to find their position.

```js
import {
  ParticleSimulation,
  Framebuffer,
  Mesh,
  Program,
  Triangle,
  Uniform
} from 'wtc-gl'

const size = 128 // 128 × 128 = 16,384 particles

// Start the particles anywhere on screen, at rest
const data = new Float32Array(size * size * 4)
for (let i = 0; i < data.length; i += 4) {
  data[i] = Math.random() * 2 - 1
  data[i + 1] = Math.random() * 2 - 1
}

// Shared by the step pass and the points
const u_state = new Uniform({ name: 'state', value: null, kind: 'texture' })

const particles = new ParticleSimulation({
  vertex: pointsVertex,
  fragment: pointsFragment,
  textureSize: size,
  uniforms: { b_state: u_state }
})

const { gl } = particles

const state = new Framebuffer(gl, {
  width: size,
  height: size,
  dpr: 1, // one texel per particle, whatever the screen
  texdepth: Framebuffer.TEXTYPE_FLOAT,
  minFilter: gl.NEAREST,
  depth: false,
  data
})

const step = new Mesh(gl, {
  geometry: new Triangle(gl),
  program: new Program(gl, {
    vertex: stepVertex,
    fragment: stepFragment,
    uniforms: { b_state: u_state, u_time: particles.u_time }
  })
})

particles.onBeforeRender = () => {
  // Step: read the last state, write the next, then swap
  u_state.value = state.read.texture
  state.render(particles.renderer, { scene: step })
  // Draw the points from the state that was just written
  u_state.value = state.read.texture
}
```

The canvas is appended to the body and sized to the window, but its CSS size is up to you: give it `position: fixed; inset: 0` or similar, since the renderer only sets the drawing buffer.

`Framebuffer.TEXTYPE_FLOAT` keeps the state as 32-bit floats, which drawing into needs the `EXT_color_buffer_float` extension for. The renderer turns it on where it's available, which is nearly everywhere WebGL2 is. Filtering is `gl.NEAREST`, since a particle's state shouldn't blend with its neighbours'.

## The shaders

The step pass covers the framebuffer with a triangle, so its fragment shader runs once per particle. `texelFetch` with `gl_FragCoord` reads that particle's own texel:

```glsl
// stepVertex
#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
```

```glsl
// stepFragment
#version 300 es
precision highp float;

uniform sampler2D b_state;
uniform float u_time;
out vec4 state;

void main() {
  vec4 particle = texelFetch(b_state, ivec2(gl_FragCoord.xy), 0);
  vec2 p = particle.xy;
  vec2 v = particle.zw;

  // Steer towards a flow field that changes over time
  float t = u_time * 5.0;
  vec2 flow = vec2(sin(p.y * 4.0 + t), cos(p.x * 4.0 - t)) * 0.006;
  v = mix(v, flow, 0.1);

  // Move, wrapping round the edges of the screen
  p = mod(p + v + 1.0, 2.0) - 1.0;
  state = vec4(p, v);
}
```

The points' vertex shader reads the particle's texel at `reference` and places the point there. Each reference points at the centre of its texel, `(x + 0.5) / textureSize`, so it reads that texel exactly:

```glsl
// pointsVertex
#version 300 es
in vec2 reference;
uniform sampler2D b_state;
out float v_speed;

void main() {
  vec4 particle = texture(b_state, reference);
  v_speed = length(particle.zw);
  gl_PointSize = 2.0;
  gl_Position = vec4(particle.xy, 0.0, 1.0);
}
```

```glsl
// pointsFragment
#version 300 es
precision highp float;
in float v_speed;
out vec4 colour;

void main() {
  vec3 slow = vec3(0.29, 0.62, 1.0);
  vec3 fast = vec3(0.95, 0.42, 0.26);
  colour = vec4(mix(slow, fast, smoothstep(0.0, 0.005, v_speed)), 1.0);
}
```

The positions here are in clip space, from -1 to 1 on both axes, so the field stretches with the window. Multiply `x` by the aspect ratio from `u_resolution` to keep it square.

The recipe's default shaders are placeholders, so that a new simulation shows something. They draw each particle where the point cloud started it, as a 2 pixel round point coloured by its `reference`, and need no uniforms or attributes beyond the recipe's own. They don't move: your own vertex shader reads each particle's position from your simulation texture at `reference`, as above.

## Options

```js
const particles = new ParticleSimulation({
  vertex, // default: a placeholder, 2 pixel points where the cloud started
  fragment, // default: round points coloured by reference
  textureSize: 128, // particles = textureSize²
  simDimensions: 3, // components of the default geometry's position
  createGeometry() {}, // replaces the default geometry
  container: document.body, // where the canvas goes
  autoResize: true, // follow the window
  dimensions, // CSS size when autoResize is off: default the window's
  uniforms: {}, // added to u_time and u_resolution
  rendererProps: {}, // passed to the Renderer
  onBeforeRender(time) {}, // each frame, before drawing
  onAfterRender(time) {} // each frame, after drawing
})
```

- `textureSize` (default `128`) is the width and height of the state textures, and sets the number of particles, `textureSize²`. It's on the instance as `textureSize`, with `particles` (the count) and `textureArraySize` (`particles * 4`, the length of an RGBA `Float32Array` for seeding a framebuffer).
- `simDimensions` (default `3`) is the size of the default geometry's `position` attribute, filled with random numbers from -200 to 200. Most shaders ignore it and read the texture instead.
- `rendererProps` are [RendererOptions](/api/wtc-gl/interfaces/RendererOptions). The clear colour defaults to opaque black; pass `alpha: true` and `clearColour: [0, 0, 0, 0]` to see the page behind.
- `onBeforeRender` and `onAfterRender` are bound to the instance and called with the `requestAnimationFrame` timestamp in milliseconds, not the time since the last frame.
- `container` is appended to after the loop has started. Pass `null` to place `particles.gl.canvas` yourself.

Unlike `FragmentShader`, there's no `onInit`. See [ParticleSimulationOptions](/api/wtc-gl/interfaces/ParticleSimulationOptions) for the types.

## Your own geometry

`createGeometry` replaces the default point cloud, to add attributes of your own or fill `reference` differently. It's called bound to the simulation, after the renderer is made and before the program, and must set `this.cloud` to a `PointCloud`. Use a `function`, not an arrow function, so `this` is the simulation:

```js
import { ParticleSimulation, PointCloud, GeometryAttribute } from 'wtc-gl'

const particles = new ParticleSimulation({
  vertex,
  fragment,
  textureSize: 64,
  createGeometry() {
    const { textureSize, particles: count } = this
    const seeds = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      // Texel centres, as the default geometry has them
      this.references[i * 2] = ((i % textureSize) + 0.5) / textureSize
      this.references[i * 2 + 1] =
        (Math.floor(i / textureSize) + 0.5) / textureSize
      seeds[i] = Math.random()
    }

    this.cloud = new PointCloud(this.gl, {
      particles: count,
      dimensions: 1,
      attributes: {
        reference: new GeometryAttribute({ size: 2, data: this.references }),
        seed: new GeometryAttribute({ size: 1, data: seeds })
      }
    })
  }
})
```

`this.references` is a zeroed `Float32Array` with two numbers per particle, ready to fill. The default geometry fills it with the centre of each particle's texel, whatever `simDimensions` is.

## The uniforms

The program gets `u_time` and `u_resolution` alongside your own, as `particles.u_time` and `particles.u_resolution`.

`u_time` grows by the time since the last frame, in milliseconds and capped at 50, times `0.00005`: about 0.05 a second at 60 frames a second. As with `FragmentShader`, the first frame starts the clock and adds nothing, and stopping the loop restarts the clock, so a frame after a pause adds no time. A frame after the tab was in the background adds at most 50 milliseconds.

`onBeforeRender` gets the timestamp rather than the time since the last frame. For a simulation step in seconds, work it out from the timestamp and pass it as a uniform:

```js
const u_delta = new Uniform({ name: 'delta', value: 0, kind: 'float' })
let last = 0

particles.onBeforeRender = (t) => {
  u_delta.value = last ? Math.min(t - last, 50) / 1000 : 0 // seconds
  last = t
  // ...then step the state as before
}
```

`u_resolution` is the canvas size in device pixels: `dimensions` times the renderer's `dpr`. With `autoResize` off, it isn't updated when you resize; see below.

## Drawing settings

These properties are passed to the renderer on every frame:

- `camera`: a [Camera](/core/cameras) to draw the points in 3D. The vertex shader then gets `u_projectionMatrix`, `u_viewMatrix` and `u_modelViewMatrix`, as any mesh does. Set it to `null` to go back to clip space.
- `frustumCull` (default `true`): with a camera, the points are culled by the bounds of their `position` attribute, which has nothing to do with where the shader puts them. Turn it off when you set a camera.
- `clear`: leave it unset to clear every frame (the renderer's `autoClear`). Set `false` to draw over the last frame, for trails, given a renderer made with `preserveDrawingBuffer: true`.
- `viewport`: `[size, position]` as two `Vec2`s in device pixels, to draw into part of the canvas.
- `update` and `sort` (default `true`): whether the renderer updates world matrices and sorts the render list.

```js
import { Camera } from 'wtc-gl'

const camera = new Camera({ fov: 45, aspect: innerWidth / innerHeight })
camera.position.z = 3
particles.camera = camera
particles.frustumCull = false
```

Like `FragmentShader`, it has a `post` property: set it to a `Framebuffer`, and frames are drawn into that and swapped, rather than drawn to the canvas. Only `camera`, `update`, `clear` and `viewport` are passed on then. See [FragmentShader](/recipes/fragment-shader#feedback-with-post) for drawing the result to the canvas.

## Playing and stopping

`playing` starts and stops the loop, and it starts as soon as the simulation is made.

Stopping cancels the frame that was already requested and restarts the frame clock, so the frame after `playing = true` adds no time, however long the simulation was stopped.

To drive frames yourself, stop the loop and call `particles.render(t)` with a timestamp in milliseconds.

## Resizing

With `autoResize` on (the default), the recipe listens for the window's `resize` event and sizes the drawing buffer to the window, with `u_resolution` in device pixels.

With `autoResize` off, the drawing buffer is sized to `dimensions` once, and `u_resolution` is set to match, in device pixels. To resize, set all three yourself:

```js
import { Vec2 } from 'wtc-gl'

function resize(width, height) {
  particles.dimensions = new Vec2(width, height)
  particles.renderer.dimensions = particles.dimensions
  particles.u_resolution.value = particles.dimensions.scaleNew(
    particles.renderer.dpr
  ).array
}
```

`particles.resize()` always reads the window size, so don't use it for a canvas sized to an element.

## Cleaning up

`destroy()` stops the loop, removes the resize listener, removes the point cloud and the program, and disposes of the renderer. It takes the canvas out of the page if the renderer made it, and returns the canvas either way.

What you made yourself is yours to free: a `post` framebuffer, the textures and framebuffers you passed in as uniforms, and here the step pass. Remove those first, while the renderer is still there:

```js
step.program.remove()
step.geometry.remove()
state.remove()
particles.destroy()
```

`renderer.dispose()` releases the WebGL context when the renderer made the canvas. See [Cleaning up](/core/cleaning-up).

## Related

- [Render targets](/core/render-targets), for `Framebuffer`
- [Ping-pong](/cookbook/ping-pong), for the step-and-swap pattern on its own
- [Transform feedback](/simulation/transform-feedback), the other way to simulate particles on the GPU
- [FragmentShader](/recipes/fragment-shader), the same loop for a full-screen shader
- API: [ParticleSimulation](/api/wtc-gl/classes/ParticleSimulation), [ParticleSimulationOptions](/api/wtc-gl/interfaces/ParticleSimulationOptions), [PointCloud](/api/wtc-gl/classes/PointCloud), [Framebuffer](/api/wtc-gl/classes/Framebuffer)
