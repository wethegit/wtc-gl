# Cleaning up

Free the GPU memory a scene used when it goes away, and release the WebGL context when you're finished with it. {.lead}

Buffers, textures, programs and framebuffers live on the GPU, outside JavaScript's garbage collector. Dropping your last reference to a `Geometry` doesn't promptly free its buffers; they stay until they're deleted or the context goes. On a page that swaps scenes, or a single-page app that changes route, that adds up. So every class that makes GPU objects has a method to delete them.

## What to call

| Class                                                             | Call               | What it frees                                                                                                                      |
| ----------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Geometry`, and every primitive                                   | `remove()`         | Its vertex arrays and attribute buffers. Buffers it shares from another geometry are left to that geometry.                        |
| `Program`, `LitProgram`                                           | `remove()`         | The program, and its uniform values in the renderer's cache.                                                                       |
| `Texture`                                                         | `remove()`         | The WebGL texture.                                                                                                                 |
| `VideoTexture`                                                    | `remove()`         | The texture, and it stops following the video. The video itself keeps playing.                                                     |
| `RenderTarget`                                                    | `remove()`         | The framebuffer, its colour textures, and the depth buffer or depth texture it made. A `depthTexture` you passed in is left alone. |
| `Framebuffer`                                                     | `remove()`         | Both of its render targets.                                                                                                        |
| `TransformFeedback`                                               | `remove()`         | Its buffers, vertex arrays and transform feedback objects. The program is left alone.                                              |
| `Shadow`                                                          | `remove()`         | The shadow map, its render target and its depth programs. Programs you passed to `add()` are left alone.                           |
| A loaded glTF                                                     | `remove()`         | Every geometry, program and texture made for the file.                                                                             |
| `Mesh`, `InstancedMesh`, `Polyline`, the helpers                  | none               | Meshes have no `remove()`. Remove a mesh's `geometry` and `program` instead.                                                       |
| `DollyCamera`                                                     | `removeHandlers()` | Its input listeners.                                                                                                               |
| `FlyCamera`                                                       | `removeHandlers()` | Its input listeners.                                                                                                               |
| `Renderer`                                                        | `dispose()`        | Its listeners and state caches, and the context, if it made its own canvas.                                                        |
| `FragmentShader`, `Stage`, `ParticleSimulation`, `ScrollRenderer` | `destroy()`        | Everything the recipe set up; see [below](#recipes).                                                                               |
| `GPUSimulation`                                                   | `remove()`         | Its state textures, step pass, and the meshes `points()` made.                                                                     |
| `ScrollScene`                                                     | `destroy()`        | Its `IntersectionObserver`.                                                                                                        |
| `ScrollImage`                                                     | `destroy()`        | Its texture and its `IntersectionObserver`, and it stops waiting for the image to load.                                            |
| `ScrollHTML`                                                      | `destroy()`        | Its texture, capture canvas and observers, and it puts the element back where it was.                                              |

Each `remove()` also stops the renderer rebuilding the resource after [context loss](/core/renderer#context-loss). After `remove()`, the object can't be drawn or used again.

## Taking a mesh away

Take the mesh out of the scene graph first, so it isn't drawn, then free its geometry and program:

```js
mesh.setParent(null)
mesh.geometry.remove()
mesh.program.remove()
```

`setParent(null)` alone only stops the mesh being drawn, which is all you want if it's coming back.

An `InstancedMesh` draws its source geometry through a geometry of its own, which holds the per-instance buffers. `mesh.geometry.remove()` frees that, and leaves the source geometry, `mesh.source`, which you can remove separately if nothing else uses it.

## Shared resources

Geometry, programs and textures are often shared: one `Sphere` for many meshes, one texture on several programs. Remove a shared resource once, after the last thing using it has gone. Collecting what's in a scene into a `Set` makes sure each one is removed once:

```js
const geometries = new Set()
const programs = new Set()
scene.traverse((node) => {
  if (node instanceof Mesh) {
    geometries.add(node.geometry)
    programs.add(node.program)
  }
})
geometries.forEach((geometry) => geometry.remove())
programs.forEach((program) => program.remove())
```

Textures aren't reachable from the scene this way, so keep your own list of the ones you made. `Lights` holds only uniforms, so there's nothing to free.

## Loaded models

`GLTFLoader` gives back an object whose `remove()` frees every geometry, program and texture it made. Take its scene out of yours as well:

```js
gltf.scene.setParent(null)
gltf.remove()
```

## In reverse order

Tear down in the reverse of the order you built things: stop the render loop and input first, then free what uses other things before what it uses, and dispose of the renderer last. `remove()` goes through the renderer to update its caches, so the renderer should still be there.

```js
// Built: renderer, camera, textures, programs, geometry, meshes, shadow
cancelAnimationFrame(frameId)
camera.removeHandlers()
shadow.remove()
scene.traverse((node) => {
  if (node instanceof Mesh) {
    node.geometry.remove()
    node.program.remove()
  }
})
texture.remove()
renderer.dispose()
renderer.gl.canvas.remove()
```

That example assumes nothing is shared; collect shared resources first, as above.

## The renderer and the context

Browsers allow only a few WebGL contexts at once, 16 in Chrome, and when a page goes over, the oldest is lost. Every `Renderer` holds one, so dispose of renderers you've finished with rather than waiting for them to be garbage collected.

`renderer.dispose()` releases the context straight away if the renderer made its own canvas. Losing the context frees everything that was made on it, so a renderer you're throwing away takes its resources with it; removing them first matters most when the renderer carries on. If you passed in your own `canvas`, the context is kept, since a canvas only ever has one and a new renderer on the same canvas would need it.

`dispose()` doesn't take the canvas out of the page.

## Recipes

`FragmentShader.destroy()` stops the render loop and the resize listener, removes the mesh's geometry and program, disposes of the renderer, and takes the canvas out of the page if it made it. It returns the canvas. A `post` framebuffer is yours, so call its `remove()` too.

`Stage.destroy()` stops the loop and the resize tracking, removes the controls' listeners, frees the shadow and every model `load()` made, and disposes of the renderer, taking the canvas out of the page if it made it. Meshes you added yourself are yours to `remove()` if the context is staying.

`GPUSimulation.remove()` frees its state textures, its step pass, and the meshes `points()` made. Uniforms you passed in are yours.

`ParticleSimulation.destroy()` does the same as `FragmentShader`'s for a simulation. A `post` framebuffer, and the textures and framebuffers you passed in as uniforms, are yours to `remove()`.

`ScrollRenderer.destroy()` stops the render loop and the resize observer, destroys every scene (which deletes a `ScrollImage`'s or `ScrollHTML`'s texture), and disposes of the renderer. It returns the canvas for you to remove. It doesn't remove the scenes' geometry and programs; if the renderer made its own canvas they go with the context, and otherwise remove them first. `removeScene()` only stops drawing a scene; call the scene's `destroy()` as well when it's gone for good.

```js
scrollRenderer.destroy().remove()
```

## See also

- [Renderer](/core/renderer), for context loss and restore.
- [Scene graph](/core/scene-graph), for `traverse` and `setParent`.
- [Renderer.dispose](/api/wtc-gl/classes/Renderer#dispose), [Geometry.remove](/api/wtc-gl/classes/Geometry#remove) and [Program.remove](/api/wtc-gl/classes/Program#remove) in the API reference.
