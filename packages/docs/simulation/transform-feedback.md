# Transform feedback

`TransformFeedback` runs a vertex shader over a set of per-vertex values and writes the results back, so a simulation runs entirely on the GPU. {.lead}

Each vertex is one thing being simulated: a particle, an agent in a flock, a point on a cloth. A vertex shader reads its last state from attributes, such as a position and a velocity, and writes the next state to its outputs. `TransformFeedback` captures those outputs into a second set of buffers, then swaps the two, so the next step reads what this one wrote. Nothing is copied back to JavaScript, so tens of thousands of particles cost little.

Simulating is separate from drawing. `step()` advances the simulation without drawing anything, and `attribute(name)` gives you its latest values to draw with any geometry and program you like.

<Example src="transform-feedback" :height="360" demo="transform-feedback" />

<<< @/examples/transform-feedback.js

## The simulation program

The simulation is an ordinary `Program`, with `transformFeedbackVaryings` naming the vertex shader outputs to capture:

```js
import { Program } from 'wtc-gl'

const program = new Program(gl, {
  vertex: simulateVertex,
  fragment: simulateFragment,
  uniforms: { u_time, u_dt },
  transformFeedbackVaryings: ['v_position', 'v_velocity']
})
```

```glsl
#version 300 es
in vec2 a_position;
in vec2 a_velocity;
uniform float u_dt;
out vec2 v_position;
out vec2 v_velocity;

void main() {
  v_velocity = a_velocity + vec2(0.0, -9.8) * u_dt;
  v_position = a_position + v_velocity * u_dt;
}
```

Nothing is drawn while it runs, but WebGL still needs a fragment shader to link the program. One that writes nothing useful will do:

```glsl
#version 300 es
precision highp float;
out vec4 colour;
void main() { colour = vec4(0.0); }
```

Each vertex only sees its own state, plus the uniforms and any textures the program reads. For simulations where each particle reads its neighbours, keep the state in textures instead (see [particles in textures](#particles-in-textures)).

## Attributes

`attributes` lists the values the simulation updates, keyed by their names in the vertex shader. Each has a `size` (1 to 4 floats per vertex), its starting values as a `Float32Array`, and the `varying` captured back into it:

```js
import { TransformFeedback } from 'wtc-gl'

const COUNT = 10000
const positions = new Float32Array(COUNT * 2)
const velocities = new Float32Array(COUNT * 2)
// ...fill in the starting values

const simulation = new TransformFeedback(gl, {
  program,
  attributes: {
    a_position: { size: 2, data: positions, varying: 'v_position' },
    a_velocity: { size: 2, data: velocities, varying: 'v_velocity' }
  }
})
```

Every varying the program captures needs exactly one attribute, and every attribute's varying has to be captured; the constructor throws, naming what's missing, if they don't match.

The number of vertices, `simulation.count`, is the length of the first captured attribute's data divided by its size. Pass `count` to simulate fewer than the data holds. `usage` is the buffer usage hint, `gl.DYNAMIC_COPY` by default.

### Static attributes

Values the simulation reads but never changes, such as a random seed or a rest position, go in `staticAttributes` as ordinary `GeometryAttribute`s. They're uploaded once, and not captured:

```js
import { GeometryAttribute } from 'wtc-gl'

const seeds = new Float32Array(COUNT).map(() => Math.random())

const simulation = new TransformFeedback(gl, {
  program,
  attributes: {
    a_position: { size: 2, data: positions, varying: 'v_position' },
    a_velocity: { size: 2, data: velocities, varying: 'v_velocity' }
  },
  staticAttributes: {
    a_seed: new GeometryAttribute({ size: 1, data: seeds })
  }
})
```

## Stepping

`simulation.step()` runs the program over every vertex once. Call it from your render loop, before drawing:

```js
u_dt.value = delta
simulation.step()
renderer.render({ scene, camera })
```

Because stepping doesn't draw, it can run more or less often than you draw. Several smaller steps a frame keep a fast simulation stable:

```js
const substeps = 4
u_dt.value = delta / substeps
for (let i = 0; i < substeps; i++) simulation.step()
```

Cap `delta` too, so a tab coming back from the background doesn't take one huge step.

## Drawing the results

`simulation.attribute(name)` returns a `GeometryAttribute` that always holds the latest values: its buffer follows the results after every step. Add it to any geometry, under whatever name the drawing shader uses:

```js
import { Geometry, Mesh, Program } from 'wtc-gl'

const points = new Mesh(gl, {
  mode: gl.POINTS,
  geometry: new Geometry(gl, {
    position: simulation.attribute('a_position'),
    velocity: simulation.attribute('a_velocity')
  }),
  program: new Program(gl, { vertex: pointsVertex, fragment: pointsFragment })
})
```

Calling `attribute` again with the same name and options returns the same object, so the results can be drawn by several meshes with different programs: a glow and a sharp point, say.

The values only exist on the GPU, so a mesh drawn with a camera can't work out its bounds from them, and warns. Give it `frustumCulled: false`, or set `geometry.bounds` yourself if you know where the simulation stays.

### One shape per vertex

To draw a shape, rather than a point, at every simulated vertex, ask for a per-instance attribute with `instanced`. The geometry's own attributes describe the shape, and it's drawn once for each simulated vertex:

```js
import { Geometry, GeometryAttribute, Mesh } from 'wtc-gl'

const arrows = new Mesh(gl, {
  geometry: new Geometry(gl, {
    // A small triangle, pointing along +x
    position: new GeometryAttribute({
      size: 2,
      data: new Float32Array([1, 0, -0.6, 0.5, -0.6, -0.5])
    }),
    a_position: simulation.attribute('a_position', { instanced: 1 }),
    a_velocity: simulation.attribute('a_velocity', { instanced: 1 })
  }),
  program: arrowProgram
})
```

The vertex shader places and turns the shape from `a_position` and `a_velocity`. `instanced` is the divisor: 1 advances to the next simulated vertex for every instance. This uses a plain `Mesh`; [`InstancedMesh`](/geometry/instancing) is for instances whose matrices you set from JavaScript. The [swarm demo](https://wethegit.github.io/wtc-gl/demos/swarm/) draws its agents this way.

## Interleaved buffers

By default each attribute gets its own buffer. Set `transformFeedbackBufferMode: 'interleaved'` on the program to capture every varying into one buffer instead, one vertex's values after another:

```js
const program = new Program(gl, {
  vertex: simulateVertex,
  fragment: simulateFragment,
  transformFeedbackVaryings: [
    'v_position',
    'v_velocity',
    'v_colour',
    'v_age',
    'v_seed'
  ],
  transformFeedbackBufferMode: 'interleaved'
})
```

WebGL only promises four separately captured varyings, so a simulation with more needs interleaving. Nothing else changes: the attributes and `attribute(name)` work the same either way.

## Starting again

`simulation.reset()` uploads each attribute's `data` again and starts from there. Change `data` first to start from somewhere new:

```js
for (let i = 0; i < positions.length; i++) positions[i] = Math.random() * 2 - 1
simulation.reset()
```

The same happens if the WebGL context is lost and restored: the simulation starts again from `data`.

## Particles in textures

The [`ParticleSimulation`](/recipes/particle-simulation) recipe takes the other approach: each particle's state is a texel in a texture, which you update by drawing into a [`Framebuffer`](/core/render-targets#feedback-with-framebuffer), and its vertex shader reads that texture to place each point. Simulating in a fragment shader is less direct, but each particle can read any other texel, which suits simulations where particles interact with their neighbours. See [ParticleSimulation](/api/wtc-gl/classes/ParticleSimulation).

## Cleaning up

`simulation.remove()` deletes the buffers, including the static attributes', and the transform feedback objects. The program is left alone, as other things may use it; remove it yourself:

```js
simulation.remove()
simulation.program.remove()
```

See [cleaning up](/core/cleaning-up).

## Related

- [Geometry and attributes](/geometry/geometry-and-attributes)
- [Programs and shaders](/core/programs-and-shaders)
- API: [TransformFeedback](/api/wtc-gl/classes/TransformFeedback), [TransformFeedbackOptions](/api/wtc-gl/interfaces/TransformFeedbackOptions), [TransformFeedbackAttribute](/api/wtc-gl/interfaces/TransformFeedbackAttribute), [TransformFeedbackBufferMode](/api/wtc-gl/type-aliases/TransformFeedbackBufferMode)
