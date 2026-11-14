# A glTF model with shadows

Load a model, have it cast shadows onto itself and onto the ground, and free it all when you're done. {.lead}

Three pieces work together. [`Lights`](/lighting/lights) is the light every program shades with. A [`Shadow`](/lighting/shadows) draws a depth map from that light each frame. [`GLTFLoader`](/loading/gltf) makes the model's materials into `LitProgram`s that share the lights and receive the shadow. What the loader doesn't do is say what casts: that's one call to `shadow.add`. The ground below is up to you, and the example uses a shadow catcher, a plane that draws only the shadow, so the floating island hangs over the page itself.

<Example src="cookbook-gltf-shadows" :height="360" demo="gltf" />

<<< @/examples/cookbook-gltf-shadows.js

## Lights and the shadow first

Make the lights and the shadow before loading, so you can hand both to the loader:

```js
import { GLTFLoader, Lights, Shadow } from 'wtc-gl'

const lights = new Lights({ direction: [-0.3, 1, 0.4], ambient: 0.08 })
const shadow = new Shadow(gl, { lights, mapSize: 2048 })

const gltf = await GLTFLoader.load(gl, url, { lights, shadow })
```

Every program the loader makes receives the shadow, so once the model casts too, its parts shadow each other. The ambient light isn't shadowed, so `ambient` sets how dark the shadows get.

## Casting

Add the model's root to the shadow's casters, then fit the shadow map around it:

```js
gltf.scene.setParent(scene)
scene.updateMatrixWorld()
shadow.add(gltf.scene).fit(gltf.scene)
shadow.size *= 1.1 // a little room, as it spins
```

`add` covers every mesh under the node, including ones added later. `fit` sets the shadow's `target` and `size` from the meshes' bounds, which need their world matrices, hence the `updateMatrixWorld` first. A tight fit gives sharp shadows: the map's pixels spread over the whole area, so halving `size` makes the shadows twice as sharp. Raise `mapSize` for a large model. To cast from only some of the model, add those nodes instead of the root, found with `gltf.scene.traverse` by their names.

Then, each frame, draw the shadow map before the scene that reads it:

```js
shadow.render({ scene })
renderer.render({ scene, camera })
```

If nothing moves, the map doesn't change, so a still model only needs it drawn when it loads.

## A ground to catch the shadow

A ground can be a plain lit mesh, made with the same `lights` and `shadow` so it receives:

```js
import { Mesh, Plane, LitProgram } from 'wtc-gl'

const ground = new Mesh(gl, {
  geometry: new Plane(gl, { width: 16, height: 16 }),
  program: new LitProgram(gl, { lights, shadow, colour: [0.86, 0.84, 0.8] })
})
ground.rotation.x = -Math.PI / 2
ground.updateRotation()
```

That draws a floor, though. To have the model sit on the page with nothing around it but its shadow, use a shadow catcher instead, as the example does. Its program uses [`shadowShading`](/lighting/shadows#shadows-in-your-own-shaders), the shadow lookup as GLSL, and draws black, only as opaque as the shadow is dark:

```js
const fragment = /* glsl */ `#version 300 es
precision highp float;
${shadowShading}
in vec4 v_shadowCoord;
out vec4 colour;
void main() {
  float dark = (1.0 - shadowFactor(v_shadowCoord)) * 0.3;
  colour = vec4(0.0, 0.0, 0.0, dark);
}`
```

Its vertex shader works out `v_shadowCoord` from the world position, as in the example.

Spread `shadow.uniforms` into its uniforms, set `transparent: true` and `depthWrite: false`, and make the renderer with `alpha: true` so the page shows through. Don't add the catcher to the casters. It only catches shadows inside the shadow's area, which is measured across the light: seen from the light, a square `size` either side of the `target`, reaching `2 * size` past it. So a ground well below a model fitted with `fit` still catches its shadow, as the example's does.

## Loading in the background

Loading is asynchronous. Draw nothing, or something else, until it's done, and draw a frame as soon as it arrives rather than waiting for the next animation frame:

```js
const abort = new AbortController()

GLTFLoader.load(gl, url, { lights, shadow, signal: abort.signal })
  .then((loaded) => {
    if (disposed) return loaded.remove()
    gltf = loaded
    // … set up, then draw once
  })
  .catch((error) => {
    if (!disposed) console.error(error)
  })
```

`signal` cancels the requests if the page moves on first. A model that finishes loading after you've cleaned up is freed straight away.

## Cleaning up

`gltf.remove()` frees every geometry, program and texture the loader made. It leaves the `Lights` and `Shadow` alone, since you made those, so remove the shadow yourself. Take the model out of your scene first:

```js
shadow.delete(gltf.scene)
gltf.scene.setParent(null)
gltf.remove()
shadow.remove()
```

When the whole renderer is going, as at the end of the example, `delete` and `setParent` don't matter.

## Pitfalls

- Shadow acne, stripes or speckles across lit surfaces, comes from a surface shadowing itself. Raise `shadow.bias` or `shadow.normalBias` until it goes, but not so far that shadows come away from their casters.
- Outside the shadow's area, everything is lit. If shadows are cut off at an edge, `fit` again after moving the model, or raise `size`.
- Leaves and other cut-outs cast solid shadows, since the depth pass doesn't read textures.

## With a Stage

The [`Stage`](/recipes/stage) recipe does the first half of this page for you. `load` passes the stage's lights and shadow to the loader, adds the model casting the shadow, and frames the camera and the shadow on it:

```js
import { Stage } from 'wtc-gl'

const stage = new Stage({ container })
const gltf = await stage.load('/models/island.glb')
// Add a ground or a shadow catcher with castShadow: false
stage.add(catcher, { castShadow: false })
```

`stage.destroy()` frees the model with the rest.

## See also

- [glTF models](/loading/gltf), for what the loader makes and supports
- [Shadows](/lighting/shadows), for every shadow option and the catcher in full
- [Lights and LitProgram](/lighting/lights)
- The [icon swarm](/showcase/icon-swarm), with instanced glTF models over a shadow-catcher backdrop
- API: [GLTFLoader](/api/wtc-gl/classes/GLTFLoader), [GLTFLoaderOptions](/api/wtc-gl/interfaces/GLTFLoaderOptions), [Shadow](/api/wtc-gl/classes/Shadow), [shadowShading](/api/wtc-gl/variables/shadowShading)
