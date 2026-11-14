# Stage

A ready-made 3D scene: a renderer sized to its container, an orbiting camera, lights, a shadow and a render loop. {.lead}

Every 3D scene starts the same way: make a renderer and put its canvas on the page, keep it the size of its container, add a camera and controls, set up lights and a shadow, and run a loop that renders the shadow and then the scene. `Stage` does all of that, so you start from the content.

<Example src="stage" :height="360" demo="gltf" />

<<< @/examples/stage.js

## Making a stage

```js
import { Stage } from 'wtc-gl'

const stage = new Stage({ container: document.querySelector('.hero') })
```

The canvas goes in `container` and fills it, following it as it resizes. Without a container, the stage covers the window. The loop starts straight away; pass `autoplay: false` to start it yourself with `stage.playing = true`, or to draw frames with `stage.render()`.

What the stage made is all there to use and change:

| Property   | What it is                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scene`    | The root [`Obj`](/core/scene-graph). Everything drawn is under it.                                                                               |
| `camera`   | The camera: a [`DollyCamera`](/core/cameras#orbiting-with-dollycamera) that orbits with the pointer, or a fixed `Camera` with `controls: false`. |
| `controls` | The `DollyCamera`, or `null` without controls.                                                                                                   |
| `lights`   | The [`Lights`](/lighting/lights) every lit program on the stage shares.                                                                          |
| `shadow`   | The [`Shadow`](/lighting/shadows), or `null` with `shadow: false`.                                                                               |
| `renderer` | The [`Renderer`](/core/renderer), with `gl` and `canvas` alongside it.                                                                           |

The orbit controls don't zoom, so the wheel still scrolls the page. Turn zoom on for a full-screen scene with `controlOptions: { enableZoom: true }`; any other [`DollyCamera` option](/api/wtc-gl/interfaces/DollyCameraOptions) goes there too.

## Adding things

`add` puts a node in the scene and makes it cast the shadow. Give lit programs the stage's lights and shadow so they share them:

```js
import { Mesh, Sphere, LitProgram } from 'wtc-gl'

const ball = stage.add(
  new Mesh(stage.gl, {
    geometry: new Sphere(stage.gl, { radius: 0.5 }),
    program: new LitProgram(stage.gl, {
      lights: stage.lights,
      shadow: stage.shadow,
      colour: [0.95, 0.42, 0.26]
    })
  })
)

// A floor that receives the shadow but doesn't cast it
stage.add(floor, { castShadow: false })
```

## Loading a model

`load` loads a [glTF model](/loading/gltf) with the stage's lights and shadow, adds it to the scene casting the shadow, and frames it. It returns the loaded `GLTF`:

```js
const gltf = await stage.load('/models/island.glb')
gltf.nodes.find((node) => node.name === 'Lantern')
```

Pass `fit: false` to place the camera yourself, and any [`GLTFLoader` option](/api/wtc-gl/interfaces/GLTFLoaderOptions), such as an abort `signal`. The stage frees what it loaded when it's destroyed.

## Framing

`fit(node)` points the camera at the middle of a node and moves it back, along the way it's already looking, until all of it is in view. It fits the shadow around the node too, and sets the camera's near and far planes to suit. `padding` leaves room around it:

```js
stage.fit(stage.scene, { padding: 1.3 })
```

Set `cameraPosition` to choose the side the camera looks from; `fit` keeps that direction and only changes the distance. It frames whichever camera is current; a camera inside the scene, such as one loaded with a model, stays where it is, and only its near and far planes are fitted.

## Another camera

Set `stage.camera` to draw through a different camera, such as one from a glTF file. It's given the canvas's shape straight away and kept in step when the canvas resizes, and the orbit controls switch off while it's in use. Set it back to `stage.controls` to orbit again:

```js
const gltf = await stage.load('/models/island.glb')
const fileCamera = gltf.cameras[0]

toggle.addEventListener('change', () => {
  stage.camera = toggle.checked ? fileCamera : stage.controls
})
```

The [glTF demo](https://wethegit.github.io/wtc-gl/demos/gltf/) switches to the file's camera this way.

## Extra views

To draw the scene a second time in the same frame, such as an overhead map in a corner, call `render` from `onAfterRender` with a camera and a part of the canvas. The shadow map from the main view can be reused:

```js
import { Camera, Vec2, Vec3 } from 'wtc-gl'

const overhead = new Camera({ fov: 40, aspect: 320 / 200 })
overhead.position.reset(0, 12, 0.01)
overhead.lookAt(new Vec3(0, 0, 0))

stage.onAfterRender = () => {
  // In device pixels, from the bottom left
  const dpr = stage.renderer.dpr
  const size = new Vec2(320 * dpr, 200 * dpr)
  const position = new Vec2(16 * dpr, 16 * dpr)
  stage.render({
    camera: overhead,
    viewport: [size, position],
    scissor: true, // clear and draw only inside the viewport
    clear: true,
    shadow: false
  })
}
```

The overhead camera's aspect is yours to keep, since it's not the stage's camera. See [StageRenderOptions](/api/wtc-gl/interfaces/StageRenderOptions) for every option.

## Each frame

`onBeforeRender` and `onAfterRender` are called every frame with the time since the loop started and since the last frame, in seconds:

```js
const stage = new Stage({
  onBeforeRender: (time, delta) => {
    ball.position.y = Math.sin(time * 2) * 0.5 + 0.5
  }
})
```

A frame updates the controls and the world matrices, renders the shadow, then renders the scene through the camera. To change the order, or draw something else first, run the loop yourself: set `autoplay: false` and call `stage.render()` when you need a frame.

## Options

| Option           | Default                            | What it does                                                                                                 |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `container`      | `document.body`                    | The element the canvas fills.                                                                                |
| `controls`       | `true`                             | Orbit the camera with the pointer.                                                                           |
| `controlOptions` | `{}`                               | Options for the `DollyCamera`.                                                                               |
| `camera`         | `{ fov: 35, near: 0.1, far: 100 }` | Options for the camera.                                                                                      |
| `cameraPosition` | `[4, 3, 6]`                        | Where the camera starts.                                                                                     |
| `lights`         | a new `Lights()`                   | A `Lights` to share, or options for a new one.                                                               |
| `shadow`         | `true`                             | `false` for none, or [shadow options](/api/wtc-gl/interfaces/ShadowOptions). The default map is 2048 pixels. |
| `clearColour`    | `[0, 0, 0, 0]`                     | The colour behind the scene. Transparent shows the page.                                                     |
| `rendererProps`  | `{}`                               | Options for the `Renderer`.                                                                                  |
| `autoplay`       | `true`                             | Start the loop straight away.                                                                                |

## Cleaning up

`destroy()` stops the loop and the resize tracking, removes the controls' listeners, frees the shadow and every model `load` made, and disposes of the renderer, releasing its WebGL context. Meshes you made yourself aren't freed; if the context is staying, call their `remove()` too. See [cleaning up](/core/cleaning-up).

## See also

- [Your first 3D scene](/getting-started/first-3d-scene), for what the stage sets up.
- [Stage](/api/wtc-gl/classes/Stage) and [StageOptions](/api/wtc-gl/interfaces/StageOptions) in the API reference.
- The [glTF demo](https://wethegit.github.io/wtc-gl/demos/gltf/), built on a stage.
