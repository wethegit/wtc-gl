---
'wtc-gl': major
---

Redesign `TransformFeedback` as a standalone GPU simulation. It now owns its ping-pong state, and simulating is separate from drawing. `step()` runs the simulation program once with rasterisation turned off, and `attribute(name)` gives you an attribute that always holds the latest results, ready to draw with any geometry and program. Simulations can now run without being drawn, be drawn by a different program (and more than one mesh), and be stepped more or less often than they're drawn.

New:

- **`staticAttributes`** for per-vertex inputs the simulation reads but doesn't change, such as a rest position or a random seed. They're uploaded once and restored with the context.
- **Interleaved capture.** Pass `transformFeedbackBufferMode: 'interleaved'` to `Program` to capture every varying into one buffer.
- **`reset()`** starts the simulation again from the attributes' `data`.
- **Instanced outputs.** `attribute(name, { instanced: 1 })` returns a per-instance version of an output, for example to draw one instanced shape per simulated vertex. Each option set gets its own attribute, and they all follow the latest results.
- **Attribute locations come from the linked program**, so simulation shaders no longer need `layout(location = …)`.
- **`GeometryAttribute` takes `buffer` and `external` options.** An external attribute's buffer is managed elsewhere: `Geometry` never uploads, recreates or deletes it, and re-points its vertex arrays when the buffer is swapped. Bounds aren't computed from an external `position`, since its values live on the GPU, so a mesh using one isn't frustum culled unless you set `geometry.bounds` yourself.
- **`Program.transformFeedbackVaryings` and `Program.transformFeedbackBufferMode`** are now public and read-only.

**Migrating**

Split the vertex shader in two: a simulation shader that writes the captured varyings (with a fragment shader that outputs nothing), and a render shader that reads the simulated attributes. Then:

```js
// Before
const program = new Program(gl, {
  vertex,
  fragment,
  transformFeedbackVaryings: ['v_position', 'v_velocity']
})
const tf = new TransformFeedback(gl, {
  program: program.program,
  transformFeedbacks: {
    a_position: { data: positions, size: 2, varying: 'v_position' },
    a_velocity: { data: velocities, size: 2, varying: 'v_velocity' }
  }
})
const mesh = new Mesh(gl, {
  mode: gl.POINTS,
  geometry: new PointCloud(gl, { particles: N, transformFeedbacks: tf }),
  program
})

// After
const simulation = new TransformFeedback(gl, {
  program: new Program(gl, {
    vertex: simulateVertex,
    fragment: simulateFragment,
    transformFeedbackVaryings: ['v_position', 'v_velocity']
  }),
  attributes: {
    a_position: { data: positions, size: 2, varying: 'v_position' },
    a_velocity: { data: velocities, size: 2, varying: 'v_velocity' }
  }
})
const mesh = new Mesh(gl, {
  mode: gl.POINTS,
  geometry: new Geometry(gl, {
    a_position: simulation.attribute('a_position')
  }),
  program: new Program(gl, { vertex: renderVertex, fragment })
})

// Each frame, before rendering
simulation.step()
```

- **`program`** must be a `Program`. A raw `WebGLProgram` is no longer accepted.
- **`transformFeedbacks` is renamed `attributes`.** Its per-attribute `type`, `normalize`, `stride`, `offset`, `buffer`, `usage` and `buffertype` options are gone. Attributes are `Float32Array` data, and a single `usage` option (default `gl.DYNAMIC_COPY`) covers all of them.
- **The attributes must match the program's `transformFeedbackVaryings` exactly.** The constructor throws if a varying has no attribute, more than one attribute, or an attribute's varying isn't captured.
- **Values that never change**, like a seed that was fed straight back each frame, should move to `staticAttributes`.
- **`VAOs`, `TFBs` and `BufferRefs` are gone.** Use `attribute(name)` to read the results.
- **`Geometry`** no longer takes a transform feedback as its third argument, and loses `transformFeedbacks`, `transformFeedbackIndex` and `bindTransformFeedbacks()`.
- **`PointCloud`** loses its `transformFeedbacks` option.
- **`remove()`** also deletes the static attributes' buffers. It leaves the program alone, so call `simulation.program.remove()` if nothing else uses it.
