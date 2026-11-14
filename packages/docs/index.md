---
title: Introduction
---

# Introduction

wtc-gl is a small WebGL2 library for the shader-driven parts of websites: full-screen effects, scenes synced to DOM elements as the page scrolls, and the occasional 3D model. {.lead}

It's descended from [OGL](https://github.com/oframe/ogl), with names familiar from three.js. You write the GLSL yourself, and wtc-gl handles the WebGL around it: programs and uniforms, geometry and buffers, the scene graph, cameras, render targets, and context loss.

## What's in it

- **The core.** A `Renderer`, `Program`s with checked `Uniform`s, `Geometry`, `Mesh`es in a scene graph of `Obj`s, perspective and orthographic `Camera`s, `Texture`s and `RenderTarget`s.
- **Geometry.** Primitives such as `Box`, `Sphere`, `Torus` and `Capsule`; `Path` and `Curve` for drawing in 3D; `Tube`, `Extrude` and `Lathe` to turn them into solids; CPU tools to merge, weld and transform geometry; and CSG through manifold-3d.
- **Lines.** `Polyline`, lines with real width: tapers, dashes, flat ribbons and trails.
- **Lighting.** `LitProgram`, a Blinn-Phong material lit by a shared `Lights`, with `Shadow` maps, and the same lighting as GLSL chunks for your own shaders.
- **Loading.** `GLTFLoader` for models from Blender and other tools, and `Texture.fromURL`.
- **Interaction.** `Raycast` for picking meshes and instances.
- **Simulation.** `InstancedMesh` for many copies of a mesh, and `TransformFeedback` to simulate on the GPU.
- **Recipes.** Ready-made setups: `FragmentShader` for a full-screen shader, `ParticleSimulation`, and `ScrollRenderer` to draw many scenes, each fitted to an element, on one canvas.
- **React.** `@wethegit/react-wtc-gl` wraps `ScrollRenderer` in a provider and hooks.

It also re-exports [wtc-math](https://wethegit.github.io/wtc-math/), so vectors and matrices come from the same import.

## When to use it

wtc-gl suits sites where the WebGL is mostly yours: custom shaders, effects on images and sections, generative graphics, and a few models. It stays small and close to WebGL, so it's easy to see what each frame draws.

For a full 3D engine, with physically based materials, animation, post-processing stacks and a large ecosystem of loaders, use [three.js](https://threejs.org) instead.

## A first look

Every scene follows the same shape: make a renderer, put meshes in a scene, and render it with a camera each frame.

```js
import {
  Renderer,
  Camera,
  Obj,
  Mesh,
  Box,
  LitProgram,
  Lights,
  Vec2
} from 'wtc-gl'

const renderer = new Renderer({ clearColour: [0.95, 0.96, 0.97, 1] })
const { gl } = renderer
document.body.appendChild(gl.canvas)

const camera = new Camera({ fov: 35 })
camera.position.z = 5

const scene = new Obj()
const lights = new Lights()
const box = new Mesh(gl, {
  geometry: new Box(gl),
  program: new LitProgram(gl, { lights, colour: [0.29, 0.62, 1] })
})
box.setParent(scene)

const resize = () => {
  renderer.dimensions = new Vec2(innerWidth, innerHeight)
  camera.perspective({ aspect: innerWidth / innerHeight })
}
addEventListener('resize', resize)
resize()

requestAnimationFrame(function frame(t) {
  requestAnimationFrame(frame)
  box.rotation.y = t * 0.001
  box.updateRotation()
  renderer.render({ scene, camera })
})
```

Start with [installation](/getting-started/installation), then [your first shader](/getting-started/first-shader).
