# Raycast

Find which meshes are under the pointer, and exactly where, with `Raycast`. {.lead}

A ray starts at the camera and passes through the pointer into the scene. `Raycast` finds the meshes it meets, nearest first, with the point, the face, the normal and the uv of each hit. It runs on the CPU, against the geometry's positions, so it needs nothing from the GPU and works the same whatever the shaders do.

<Example src="raycast" :height="360" demo="lighting" />

<<< @/examples/raycast.js

## Casting from the pointer

`castMouse(camera, ndc)` points the ray from the camera through a point on the screen, in normalised device coordinates: x and y from -1 to 1 across the canvas, with y up. Work them out from a pointer event and the canvas's position on the page:

```js
import { Raycast } from 'wtc-gl'

const raycast = new Raycast()

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const y = 1 - ((e.clientY - rect.top) / rect.height) * 2

  const [hit] = raycast.castMouse(camera, [x, y]).intersectMeshes(scene)
  if (hit) console.log(hit.mesh.name, hit.point)
})
```

A perspective camera's ray starts at the camera; an orthographic camera's starts on its near plane and runs straight into the scene.

`set(origin, direction)` points the ray anywhere else, in world space, for a ray that doesn't come from the camera. `raycast.origin` and `raycast.direction` hold the ray, with the direction normalised.

## Meshes and bounds

There are two tests, and both take a mesh, a list of them, or the root of a scene to search. Hidden objects, and everything under them, are skipped. Both return a new array of hits, nearest first, with one hit per mesh.

`intersectBounds(target)` tests each mesh's bounding box. It's cheap, and good enough for picking whole objects that fill their boxes. Each hit has:

- `mesh`, the mesh hit.
- `distance` from the ray's origin, in world units.
- `point`, where the ray met the box, in world space, and `localPoint`, in the mesh's own space.
- `instanceId`, for an `InstancedMesh`.

`intersectMeshes(target)` goes on to the mesh's triangles, for the exact point on the surface. Its hits add:

- `faceIndex`, the triangle's number, in draw order.
- `normal`, the surface normal at the point in world space, interpolated from the `normal` attribute, or the face normal when there isn't one.
- `faceNormal`, the triangle's own normal in world space, out of its front face.
- `uv`, interpolated from the `uv` attribute, when there is one.

```js
const [hit] = raycast.castMouse(camera, ndc).intersectMeshes(scene)
if (hit) {
  // A dot on the surface, and a line out along its normal
  dot.position.resetToVector(hit.point)
  normalLine.setPoints([hit.point, hit.point.addNew(hit.normal.scaleNew(0.3))])
}
```

## Instances

An [`InstancedMesh`](/geometry/instancing) is tested once per instance, against the source geometry moved by each instance's matrix. Each instance hit is its own entry in the results, with its `instanceId`:

```js
const [hit] = raycast.castMouse(camera, ndc).intersectMeshes(swarm)
if (hit?.instanceId !== undefined) {
  swarm.setColourAt(hit.instanceId, [1, 0.4, 0.2])
}
```

## Options

Both tests take options as a second argument:

- `maxDistance` ignores anything further away than this, in world units. Infinity by default.
- `cullFace` says which faces can't be hit: `gl.BACK`, `gl.FRONT`, or 0 for none. By default it's whatever the mesh's program culls when it draws, so the ray hits what you can see: the outside of a closed mesh, and both sides of a double-sided one. A mesh mirrored by a negative scale swaps its front and back, as it does when drawn.
- `padding` grows each mesh's bounding box by this many world units, which makes small or thin targets easier to hit. It only affects `intersectBounds`: `intersectMeshes` tests the triangles themselves, which padding doesn't change.

```js
const hits = raycast.intersectBounds(buttons, { padding: 0.1, maxDistance: 20 })
```

## Planes, spheres and boxes

The ray can also be tested against shapes that aren't meshes:

- `intersectPlane(normal, point)` returns where the ray meets a plane through `point` facing along `normal`, as a `Vec3`, or null when it's parallel or behind the ray. Pass a third `Vec3` to write into instead of allocating.
- `intersectSphere(centre, radius)` returns the distance to a sphere along the ray, 0 from inside it, or Infinity on a miss.
- `intersectBox(min, max)` does the same for an axis-aligned box.

`intersectPlane` is the one for dragging: the pointer's ray against the ground plane gives the point to move an object to.

```js
import { Vec3 } from 'wtc-gl'

const up = new Vec3(0, 1, 0)
const origin = new Vec3(0, 0, 0)
// The pointer in normalised device coordinates, as above
const toNDC = (e) => {
  const rect = canvas.getBoundingClientRect()
  return [
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    1 - ((e.clientY - rect.top) / rect.height) * 2
  ]
}

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return
  const point = raycast.castMouse(camera, toNDC(e)).intersectPlane(up, origin)
  if (point) dragging.position.reset(point.x, dragging.position.y, point.z)
})
```

## What can be hit

- Only meshes that draw `gl.TRIANGLES`. Lines, points and triangle strips are skipped. A [Polyline](/lines/polyline) can't be hit either: its triangles only get their width on the GPU, so on the CPU they have none.
- Only geometry whose positions are on the CPU. Positions written by a [`TransformFeedback`](/simulation/transform-feedback), or moved in a vertex shader, are where the shader puts them, which the ray can't see: it tests the positions in the geometry.
- A geometry's `drawRange` is respected.

World matrices should be up to date, as they are after a render. Casting from a pointer event between frames uses the matrices from the last one, which is what was on screen.

Each test allocates its results, so it's meant for pointer events rather than every frame. If objects move under a still pointer and the hover needs to follow, casting once a frame is fine for a handful of meshes.

## See also

- [Cameras](/core/cameras), for the camera the ray is cast from.
- [Instancing](/geometry/instancing), for picking instances.
- [glTF models](/loading/gltf), whose geometry stays on the CPU so it can be picked.
- API: [Raycast](/api/wtc-gl/classes/Raycast), [RaycastHit](/api/wtc-gl/interfaces/RaycastHit), [RaycastBoundsHit](/api/wtc-gl/interfaces/RaycastBoundsHit), [RaycastOptions](/api/wtc-gl/interfaces/RaycastOptions).
