# Cameras

Look at a scene through a perspective or orthographic camera, map points between the world and the screen, and orbit with the mouse. {.lead}

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

## See also

- [Your first 3D scene](/getting-started/first-3d-scene) and [Scene graph](/core/scene-graph).
- [Raycast](/interaction/raycast), for picking what's under the pointer.
- [Camera](/api/wtc-gl/classes/Camera), [CameraOptions](/api/wtc-gl/interfaces/CameraOptions), [DollyCamera](/api/wtc-gl/classes/DollyCamera) and [DollyCameraOptions](/api/wtc-gl/interfaces/DollyCameraOptions) in the API reference.
