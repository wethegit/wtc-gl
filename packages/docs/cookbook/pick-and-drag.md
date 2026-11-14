# Pick and drag

Pick up a mesh with the pointer and move it across the floor, with an orbiting camera that stays out of the way. {.lead}

Dragging takes two kinds of ray test. On the press, a [`Raycast`](/interaction/raycast) from the pointer into the scene finds the mesh under it, and the exact point it was grabbed by. While the pointer moves, the same ray is tested against a flat plane through that point instead, which gives the point to move the mesh to. The plane is level, so the mesh slides across the floor at its own height, whatever the camera's angle.

Drag a shape to move it. Drag the floor to turn the camera.

<Example src="cookbook-drag" :height="360" demo="paths" />

<<< @/examples/cookbook-drag.js

## Casting from the pointer

Both tests start the same way: work out the pointer in normalised device coordinates, -1 to 1 across the canvas with y up, and cast from the camera through it:

```js
const cast = (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const y = 1 - ((e.clientY - rect.top) / rect.height) * 2
  return raycast.castMouse(camera, [x, y])
}
```

`castMouse` returns the raycast, so a test can follow it straight away.

## Picking up

On `pointerdown`, test the meshes that can be dragged. `intersectMeshes` returns the hits nearest first, so the first is the one on top:

```js
const onDown = (e) => {
  const [picked] = cast(e).intersectMeshes(pieces)
  if (!picked) return
  dragging = picked.mesh
  planePoint.resetToVector(picked.point)
  offset.resetToVector(dragging.position).subtract(picked.point)
  camera.enabled = false
  canvas.setPointerCapture(e.pointerId)
}
```

Two things are kept from the hit:

- `planePoint`, where the mesh was grabbed. The drag plane passes through it, so the pointer stays on the same spot of the mesh as it moves, rather than on the floor beneath it.
- `offset`, from the grabbed point to the mesh's position. Without it, the mesh's centre would jump to the pointer on the first move.

Pass only the meshes that can be dragged, not the whole scene, so the floor and anything else can't be picked up. For simple shapes, `intersectBounds` is cheaper and, with `padding`, easier to hit when they're small.

## Dragging across a plane

On `pointermove`, cast again and meet the plane through `planePoint`, facing up:

```js
const up = new Vec3(0, 1, 0)
const hit = new Vec3()

const onMove = (e) => {
  if (!dragging) return
  if (!cast(e).intersectPlane(up, planePoint, hit)) return
  dragging.position.x = hit.x + offset.x
  dragging.position.z = hit.z + offset.z
}
```

`intersectPlane` writes into `hit` instead of making a new vector, and returns null when the ray runs parallel to the plane or points away from it, as it can when the pointer goes above the horizon. Keep the mesh where it was then. Clamp the position, as the example does, to keep the mesh on the floor.

Other planes give other drags:

- A plane facing the camera moves a mesh up and down the screen as well as across it. The camera's backward axis is the third column of its world matrix: `new Vec3(m.a31, m.a32, m.a33)` with `m = camera.worldMatrix`. The [paths demo](https://wethegit.github.io/wtc-gl/demos/paths/) drags its handles this way.
- A vertical plane through the grabbed point, facing the camera horizontally, lifts a mesh without moving it across the floor.

## Pointer capture

`setPointerCapture` sends the pointer's later events to the canvas even after it leaves, so a fast drag that overshoots the canvas edge keeps going, and the release is still seen. The capture ends by itself on `pointerup`. Listen for `pointercancel` too, which the browser sends if it takes the pointer back, and end the drag on either:

```js
const onUp = () => {
  dragging = null
  camera.enabled = true
}
canvas.addEventListener('pointerup', onUp)
canvas.addEventListener('pointercancel', onUp)
```

## Keeping the camera still

A [`DollyCamera`](/core/cameras#orbiting-with-dollycamera) listening on the same canvas would turn as the mesh is dragged. Set `camera.enabled = false` when a drag starts and back to `true` when it ends. The camera listens for `mousedown` and `touchstart`, which arrive after `pointerdown`, so it's already off by the time it sees the press. A press that misses every mesh leaves it on, so dragging the empty floor still orbits.

The camera's own touch handling is what stops the page scrolling under a finger, and that's off during a drag, so set `touch-action: none` on the canvas. In a page that scrolls, also turn off `enableZoom`, since the camera takes the wheel for zooming and the page won't scroll under the pointer.

## Picking, between frames

Pointer events arrive between frames, and a ray test uses the world matrices from the last render, which is what's on screen. That's what you want here. If you move meshes and test again before the next render, call `scene.updateMatrixWorld()` first.

## See also

- [Raycast](/interaction/raycast), for every test and the hits they return
- [Cameras](/core/cameras), for `DollyCamera` and its options
- [A field of instances](/cookbook/instance-field), which casts onto a plane without picking anything
- The [paths demo](https://wethegit.github.io/wtc-gl/demos/paths/), whose handles you drag to reshape a path
- API: [Raycast](/api/wtc-gl/classes/Raycast), [RaycastHit](/api/wtc-gl/interfaces/RaycastHit), [DollyCamera](/api/wtc-gl/classes/DollyCamera)
