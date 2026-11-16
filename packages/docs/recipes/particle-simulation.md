# ParticleSimulation

`ParticleSimulation` is deprecated: use [`GPUSimulation`](/recipes/gpu-simulation), which keeps its own state textures and step pass. {.lead}

::: warning Deprecated
`ParticleSimulation` still works in wtc-gl 2, and warns once when it's made. It's removed in 3.0.
:::

`ParticleSimulation` set up a canvas, a render loop and a cloud of points with a `reference` attribute per particle, but left the simulation itself to you: you made a `Framebuffer` for the particles' state, drew a step pass into it each frame, and passed its texture to the points. `GPUSimulation` owns that half too, and isn't tied to its own canvas, so it works with any renderer, `Stage` or `FragmentShader`.

## Moving to GPUSimulation

Before, with a hand-made state framebuffer and step pass:

```js
const particles = new ParticleSimulation({
  vertex: pointsVertex,
  fragment: pointsFragment,
  textureSize: 128,
  uniforms: { b_state: u_state }
})
const state = new Framebuffer(particles.gl, {
  width: 128,
  height: 128,
  dpr: 1,
  texdepth: Framebuffer.TEXTYPE_FLOAT,
  minFilter: particles.gl.NEAREST,
  data
})
const step = new Mesh(particles.gl, {
  geometry: new Triangle(particles.gl),
  program: new Program(particles.gl, {
    vertex: stepVertex,
    fragment: stepFragment,
    uniforms: { b_state: u_state }
  })
})
particles.onBeforeRender = () => {
  u_state.value = state.read.texture
  state.render(particles.renderer, { scene: step })
  u_state.value = state.read.texture
}
```

After:

```js
const sim = new GPUSimulation(gl, {
  size: 128,
  fragment: stepFragment, // reads b_state at v_uv, writes the next state
  initial: { state: data }
})
const particles = sim.points({ vertex: pointsVertex, fragment: pointsFragment })

// each frame
sim.step(delta)
renderer.render({ scene: particles })
```

What maps to what:

| ParticleSimulation                        | GPUSimulation                                          |
| ----------------------------------------- | ------------------------------------------------------ |
| `textureSize`                             | `size`                                                 |
| Your `Framebuffer` and its `data`         | Made for you; `initial` sets the starting values       |
| Your step `Mesh` and `Program`            | `fragment`, the step shader                            |
| `state.render(...)` in `onBeforeRender`   | `sim.step(delta)`                                      |
| `reference` on the built-in `PointCloud`  | `reference` on the mesh `sim.points()` returns         |
| One state texture, packed into 4 channels | Up to 4 named state textures, written in one pass      |
| `u_time` in odd units                     | `u_time` and `u_delta` in seconds                      |
| Its own renderer, canvas and loop         | Your renderer and loop, or a [`Stage`](/recipes/stage) |

Step shaders move to GLSL 3.00 with a named output per state (`layout(location = 0) out vec4 state;`), reading the texel being updated at `v_uv`. See [the GPUSimulation page](/recipes/gpu-simulation) for the whole API, and [ParticleSimulation](/api/wtc-gl/classes/ParticleSimulation) in the API reference for the old one.
