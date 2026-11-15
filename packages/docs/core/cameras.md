# Cameras

Look at a scene through a perspective or orthographic camera, map points between the world and the screen, orbit with the mouse, and fly. {.lead}

A `Camera` is an `Obj`, so it has a position and rotation like anything else in the [scene graph](/core/scene-graph). From its world matrix it keeps a `viewMatrix`, which takes the world into the camera's view, and a `projectionMatrix`, which flattens that view onto the screen. Meshes read both when they draw.

<Example src="cameras" :height="360" demo="lighting" />

<<< @/examples/cameras.js

## Perspective

A camera is perspective unless you give it orthographic planes. Things further away look smaller, as they do to the eye.

```js
import { Camera, Vec3 } from 'wtc-gl'

const camera = new Camera({ fov: 35, near: 0.1, far: 100 })
camera.position.reset(0, 2, 6)
camera.lookAt(new Vec3(0, 0, 0))
```

| Option   | Default | What it does                                                           |
| -------- | ------- | ---------------------------------------------------------------------- |
| `fov`    | `45`    | The vertical field of view, in degrees.                                |
| `aspect` | `1`     | The width over the height of what it draws into.                       |
| `near`   | `0.1`   | The distance to the near clipping plane.                               |
| `far`    | `100`   | The distance to the far clipping plane. Anything beyond it is clipped. |

`camera.perspective()` changes any of these, keeps the rest, and rebuilds the projection. Call it whenever the canvas changes shape:

```js
camera.perspective({ aspect: width / height })
```

If you set `fov`, `aspect`, `near` or `far` directly, call `camera.updateProjectionMatrix()` afterwards.

Keep `near` as large and `far` as small as the scene allows. The depth buffer's precision is spread between them, and a tiny `near` makes surfaces that are close together flicker through each other.

## Orthographic

Give a camera `left`, `right`, `top` and `bottom` planes and it's orthographic: parallel lines stay parallel, and things are the same size however far away they are. That suits 2D work, diagrams and isometric views. A camera whose planes match the canvas in CSS pixels draws one unit per pixel, with the origin in the centre:

```js
const camera = new Camera({
  left: -width / 2,
  right: width / 2,
  top: height / 2,
  bottom: -height / 2,
  near: 0.1,
  far: 1000
})
camera.position.z = 100
```

`camera.orthographic()` changes the planes, `near`, `far` and `zoom`, keeping the rest. `zoom` divides the planes, so 2 shows half as much at twice the size:

```js
camera.orthographic({ zoom: 2 })
```

`camera.type` is `'perspective'` or `'orthographic'`. Calling `perspective()` or `orthographic()` switches it.

## Placing the camera

Set `position` and call `lookAt(target)`, as above. A camera can also be a child of something in the scene, to follow it; the renderer updates the scene's matrices before the camera's, so it sees where its parent is that frame. A camera doesn't need to be in the scene being rendered at all.

## Between the world and the screen

`project` takes a point in the world to normalised device coordinates, where the visible area runs from −1 to 1 on x and y, and z runs from −1 on the near plane to 1 on the far plane. `unproject` goes back. Both write into their second argument, and without one they change the point you pass in:

```js
const screen = camera.project(new Vec3(0, 1, 0))

// In CSS pixels from the top left of the canvas
const x = (screen.x * 0.5 + 0.5) * width
const y = (0.5 - screen.y * 0.5) * height
```

The [lighting demo](https://wethegit.github.io/wtc-gl/demos/lighting/) places HTML labels under its shapes this way. A z outside −1 to 1 means the point is in front of the near plane, past the far plane or behind the camera.

Unprojecting a screen position at z = −1 and z = 1 gives the near and far ends of the ray under it:

```js
const nx = (x / width) * 2 - 1
const ny = 1 - (y / height) * 2
const near = camera.unproject(new Vec3(nx, ny, -1))
const far = camera.unproject(new Vec3(nx, ny, 1))
```

[Raycast](/interaction/raycast) does this for you and finds the meshes the ray hits.

Both use `projectionViewMatrix`, which the renderer brings up to date as it renders. If you've moved the camera since the last render, call `camera.updateMatrixWorld()` first.

## Frustum culling

The frustum is the part of the world a camera can see. With `frustumCull` on, as it is by default, `render()` skips meshes whose bounding sphere is entirely outside it, which saves drawing what can't be seen. A drawable that isn't a `Mesh` has no bounds, so it's never culled.

The bounding sphere is measured from the geometry's `position` data the first time it's needed. A vertex shader that moves vertices, or position data you change later, can take a mesh outside its measured bounds, and it'll be culled while still on screen. Either measure again, box first, as the sphere is centred on the box, or turn culling off for that mesh:

```js
geometry.computeBoundingBox()
geometry.computeBoundingSphere()
// or
const mesh = new Mesh(gl, { geometry, program, frustumCulled: false })
```

You can test against the frustum yourself. `updateFrustum()` updates its planes from the camera's matrices, which `render()` does for you:

```js
camera.updateFrustum()
camera.frustumIntersects(mesh) // the mesh's bounds against the frustum; true for other drawables
camera.frustumIntersectsSphere(centre, radius)
```

`InstancedMesh` culls each instance rather than the whole mesh; see [Instancing](/geometry/instancing).

## Orbiting with DollyCamera

`DollyCamera` is a camera that orbits a target in response to input on an element:

- Drag with the left button or one finger to orbit.
- Scroll the wheel, drag with the middle button or pinch to zoom.
- Drag with the right button or two fingers to pan.

It takes its own options first and the usual [camera options](#perspective) second. Both are optional, and as with `Camera` you only pass the camera options you want to change, so `new DollyCamera({ element })` works. Place it with `setPosition`, and call `update()` every frame: input sets where the camera is heading, and `update()` eases it there, applies the limits and points it at the target.

```js
import { DollyCamera, Vec3 } from 'wtc-gl'

const camera = new DollyCamera(
  {
    element: renderer.gl.canvas,
    target: new Vec3(0, 0.5, 0),
    minDistance: 3,
    maxDistance: 20,
    maxPolarAngle: Math.PI / 2
  },
  { fov: 35 }
)
camera.setPosition(0, 3, 8)

function frame() {
  requestAnimationFrame(frame)
  camera.update()
  renderer.render({ scene, camera })
}
```

| Option                               | Default                 | What it does                                                                                                                |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `element`                            | `document.body`         | The element that listens for input.                                                                                         |
| `target`                             | `(0, 0, 0)`             | The point it orbits and looks at. Panning moves it.                                                                         |
| `enabled`                            | `true`                  | Whether input moves the camera.                                                                                             |
| `ease`                               | `0.25`                  | How much of the remaining distance it moves each update, from 0 to 1. Lower is smoother.                                    |
| `inertia`                            | `0.5`                   | How much of each rotation and pan carries on into the next update, from 0 to 1.                                             |
| `enableRotate`, `rotateSpeed`        | `true`, `0.5`           | Orbiting, and how fast.                                                                                                     |
| `enableZoom`, `zoomSpeed`            | `true`, `1`             | Zooming, and how fast.                                                                                                      |
| `zoomStyle`                          | `'dolly'`               | `'dolly'` moves the camera towards the target; anything else changes the field of view instead.                             |
| `enablePan`, `panSpeed`              | `true`, `0.5`           | Panning, and how fast.                                                                                                      |
| `autoRotate`, `autoRotateSpeed`      | `false`, `1`            | Turn around the target on its own. At speed 1, a full turn takes 3600 updates: a minute at 60fps.                           |
| `minDistance`, `maxDistance`         | `0`, `Infinity`         | How close to and far from the target it can go.                                                                             |
| `minPolarAngle`, `maxPolarAngle`     | `0`, `Math.PI`          | Limits on the angle down from straight above the target, in radians. `Math.PI / 2` keeps it level with the target or above. |
| `minAzimuthAngle`, `maxAzimuthAngle` | `-Infinity`, `Infinity` | Limits on the angle around the target's y axis, in radians.                                                                 |

Setting `camera.position` directly has no lasting effect, as the next `update()` puts the camera back on its orbit. Use `setPosition(x, y, z)`, or set `position` and call `forcePosition()`.

When you're done with it, `removeHandlers()` stops it listening for input.

::: tip
The camera stops the page scrolling while the wheel or a touch is over its element, so it can zoom and orbit. On a canvas that's part of a longer page, set `enableZoom: false`, as the example above does, so the wheel still scrolls the page. Touches over the element don't scroll the page while the camera is `enabled`.
:::

## Flying with FlyCamera

`FlyCamera` flies forward on its own and is steered like a plane. It turns about its own axes, so it can loop, roll and fly upside down, and it looks down its local −Z like any camera.

<Example src="fly-camera" :height="360" demo="fly" />

<<< @/examples/fly-camera.js

| Input                                                  | What it does                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Hold and drag                                          | Steer like a joystick: the further from where you pressed, the faster it turns. A quick click doesn't steer. |
| <kbd>W</kbd> <kbd>S</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> | Pitch the nose up and down, or with `accelerationMode`, boost and brake into reverse while held.             |
| <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> | Turn left and right.                                                                                         |
| <kbd>Q</kbd> <kbd>E</kbd>                              | Roll.                                                                                                        |
| <kbd>R</kbd> <kbd>F</kbd>                              | Speed up and slow down, as far as stopping.                                                                  |
| <kbd>Space</kbd>                                       | Stop, and start again at the same speed.                                                                     |

Held keys build up to their full rate over `rampTime`, and turning dies away once they're let go, the same at any frame rate. Call `update(delta)` every frame with the frame's time in seconds:

```js
import { FlyCamera, Stage } from 'wtc-gl'

const stage = new Stage({ controls: false })
const fly = new FlyCamera(
  { element: stage.canvas, speed: 4, accelerationMode: true },
  { fov: 60, far: 200 }
)
stage.camera = fly
stage.onBeforeRender = (time, delta) => fly.update(delta)
```

| Option                   | Default              | What it does                                                                                                     |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `element`                | `document.body`      | The element that listens for pointer input.                                                                      |
| `keyTarget`              | `window`             | What listens for key input.                                                                                      |
| `enabled`                | `true`               | Whether input steers it. It keeps flying either way.                                                             |
| `speed`, `maxSpeed`      | `1`, `speed * 10`    | The cruising speed in units a second, and the fastest speeding up can take it.                                   |
| `maxReverseSpeed`        | `maxSpeed / 2`       | The fastest it can reverse, holding S in `accelerationMode`. 0 stops it reversing.                               |
| `acceleration`           | the starting `speed` | How quickly the speed changes while a speed key is held, in units a second².                                     |
| `turnSpeed`, `rollSpeed` | `1`, `1`             | The turn and roll rates at full input, in radians a second.                                                      |
| `rampTime`               | `0.9`                | The seconds a held key takes to reach its full rate.                                                             |
| `damping`                | `6`                  | How quickly turning dies away once let go. Higher stops sooner.                                                  |
| `stickRadius`            | `200`                | The drag distance, in CSS pixels, for the full turn rate.                                                        |
| `holdDelay`              | `0.1`                | The seconds a press is held before dragging steers.                                                              |
| `accelerationMode`       | `false`              | W, S and the up and down arrows boost and brake while held instead of pitching. Dragging still pitches.          |
| `accelerationDecay`      | `4`                  | How quickly a boost or brake returns to `speed` once let go. Higher is sooner.                                   |
| `keys`                   | see above            | Keys to replace the defaults, by action, such as `{ up: ['i'], down: ['k'] }`. Single letters match either case. |

Everything but `element` and `keyTarget` can be changed after it's made, and `setKeys` remaps keys later. `paused` is the space key's stop, and `speed` is kept while paused.

In `accelerationMode`, holding W or ↑ speeds up from the cruising `speed`, as far as `maxSpeed`, and holding S or ↓ slows to a stop and then reverses, as far as `maxReverseSpeed`. Letting go returns quickly to the cruising speed, while R and F still change it. `currentSpeed` is the speed it's flying at, boost included, and below 0 while reversing. For a camera that only moves while a key is held, set `speed` to 0, as the fly demo does in its boost mode.

Keys are ignored while someone is typing in a field, and the arrows and space don't scroll the page while the camera is `enabled`. On a page with more on it than the scene, pass the scene's container as `keyTarget` and give it a `tabIndex`, as the example above does, so the keys only fly the camera once the scene has been clicked. Set `touch-action: none` on the element so touch drags steer rather than scroll.

When you're done with it, `removeHandlers()` stops it listening for input. The [fly demo](https://wethegit.github.io/wtc-gl/demos/fly/) flies through endless space with one.

## See also

- [Your first 3D scene](/getting-started/first-3d-scene) and [Scene graph](/core/scene-graph).
- [Raycast](/interaction/raycast), for picking what's under the pointer.
- [Camera](/api/wtc-gl/classes/Camera), [CameraOptions](/api/wtc-gl/interfaces/CameraOptions), [DollyCamera](/api/wtc-gl/classes/DollyCamera) and [DollyCameraOptions](/api/wtc-gl/interfaces/DollyCameraOptions) in the API reference.
