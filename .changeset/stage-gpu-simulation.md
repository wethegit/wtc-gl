---
'wtc-gl': minor
---

Add two recipes. `Stage` sets up a 3D scene: a renderer sized to its container, an orbiting camera, shared `Lights`, a `Shadow` and a render loop, with `add`, `fit` to frame a node, and `load` to load, add and frame a glTF model. Set `stage.camera` to draw through another camera (the orbit controls pause until it's set back), and pass `render()` a camera, viewport and scissor to draw extra views such as a minimap. `GPUSimulation` runs a simulation in float textures, with up to four named state textures written in one pass, a step shader, and `points()` to draw the results. `ParticleSimulation` is deprecated in favour of `GPUSimulation`, and is removed in 3.0.
