# Scene graph

Arrange objects in a tree, where each child moves, turns and scales with its parent. {.lead}

Every node in a scene is an `Obj`: it has a position, rotation and scale, a parent, and children. Cameras are `Obj`s, and so are meshes, through `Drawable`, the kind of `Obj` the renderer draws. A scene is the root `Obj` you pass to `render()`, usually an empty one, and everything under it is drawn.

In the example, the planet is a child of an empty `Obj` at the centre, so turning that `Obj` carries the planet round the sun. The moon is a child of the planet, so as the planet spins, the moon goes round with it.

<Example src="scene-graph" :height="360" />

<<< @/examples/scene-graph.js

## Parents and children

`setParent` puts an object under another, and `setParent(null)` takes it out of the tree. An object has one parent, so setting a new one moves it. `addChild` and `removeChild` do the same from the parent's side:

```js
import { Obj } from 'wtc-gl'

const scene = new Obj()
const group = new Obj()
group.setParent(scene)

mesh.setParent(group) // or group.addChild(mesh)
mesh.setParent(null) // or group.removeChild(mesh)
```

Taking a mesh out of the tree stops it being drawn, but doesn't free its geometry or program; see [Cleaning up](/core/cleaning-up).

`parent` and `children` hold the links. Change them through these methods, which keep both sides in step, rather than directly.

## Position, rotation and scale

`position` and `scale` are `Vec3`s, relative to the parent. Change them in place and they take effect on the next render:

```js
mesh.position.y = 1.5
mesh.position.reset(0, 1.5, -2)
mesh.scale.reset(2, 2, 2)
```

The object's matrix is built from its `quaternion`. `rotation` is a friendlier way to set it: Euler angles in radians, applied in YXZ order. After changing `rotation`, call `updateRotation()` to turn it into the quaternion:

```js
mesh.rotation.x = Math.PI / 4
mesh.rotation.y += 0.01
mesh.updateRotation()
```

To work with quaternions instead, set `quaternion` and call `updateQuaternion()` if you also want `rotation` to match:

```js
import { Quat, Vec3 } from 'wtc-gl'

mesh.quaternion = Quat.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 4)
mesh.updateQuaternion()
```

::: tip
`updateQuaternion()` and `lookAt()` replace `rotation` and `quaternion` with new objects, so don't keep references to them across those calls.
:::

## Looking at a point

`lookAt(target)` turns an object to face a `Vec3`. A mesh turns its +z axis towards the target, and a camera its view direction, −z, so a camera looks straight at it. It uses the object's own `position`, so the target should be in the parent's space; for objects directly under an unmoved scene root, that's world space.

```js
camera.position.reset(0, 4, 8)
camera.lookAt(new Vec3(0, 0, 0))
```

## Matrices

Each object has two matrices:

- `matrix`, its transform relative to its parent, built from `position`, `quaternion` and `scale`.
- `worldMatrix`, its transform in the world: the parent's `worldMatrix` times its own `matrix`.

`updateMatrixWorld()` rebuilds both for an object and everything under it. The renderer calls it on the scene every render, and then on the camera, so normally you don't. Call it yourself when you need world positions before drawing, such as for a [raycast](/interaction/raycast), and render with `update: false` to avoid doing it twice:

```js
scene.updateMatrixWorld()
const worldPosition = moon.worldMatrix.translation // a Vec3
renderer.render({ scene, camera, update: false })
```

To set `matrix` yourself, turn off `matrixAutoUpdate` so it isn't rebuilt from the position, quaternion and scale. `decompose()` goes the other way, and sets `position`, `quaternion`, `scale` and `rotation` from `matrix`.

## Finding things

`name` is an optional label; models loaded with [GLTFLoader](/loading/gltf) get their node names. `traverse` calls a function for an object and everything under it. Returning `true` skips that object's children:

```js
let wheel
scene.traverse((node) => {
  if (node.name === 'Wheel') wheel = node
  return !!wheel
})
```

## Visibility

Set `visible` to `false` to stop drawing an object and everything under it. Its children's own `visible` is left alone, so they reappear with it.

## Drawables and meshes

`Drawable` is an `Obj` the renderer collects and draws. `Mesh` is the drawable you'll use most: it binds a geometry to a program. Before drawing, it sets uniforms on the program from its world matrix and the camera: `u_modelMatrix`, `u_viewMatrix`, `u_modelViewMatrix`, `u_projectionMatrix`, `u_normalMatrix`, `u_cameraPosition` and `u_objectPosition`. [Programs and shaders](/core/programs-and-shaders) shows them in use.

Two options on every drawable change how the renderer treats it:

- `frustumCulled` (default `true`) skips the mesh when its bounds are outside the camera's view. A drawable that isn't a `Mesh` has no bounds, so it's always drawn. See [frustum culling](/core/cameras#frustum-culling).
- `renderOrder` (default `0`) sets its place in the draw order.

```js
const sky = new Mesh(gl, { geometry, program, renderOrder: -1 })
```

## Draw order

With `sort` on, which it is by default, the renderer draws in three groups:

1. **Opaque** meshes, whose program isn't `transparent`. They're grouped by program, so the GPU switches programs as rarely as possible, then drawn nearest first, so hidden pixels fail the depth test early.
2. **Transparent** meshes, whose program is `transparent` and tests depth. They're drawn furthest first, so each blends over what's behind it.
3. Transparent meshes whose program has `depthTest: false`, such as overlays, drawn last.

Within each group, `renderOrder` comes first: lower numbers draw earlier. A mesh with a `renderOrder` other than 0 isn't sorted by depth.

With `sort: false`, meshes draw in tree order: each object, then its children.

## See also

- [Your first 3D scene](/getting-started/first-3d-scene) and [Cameras](/core/cameras).
- [Instancing](/geometry/instancing), for many copies of one mesh in a single draw.
- [Obj](/api/wtc-gl/classes/Obj), [Drawable](/api/wtc-gl/classes/Drawable) and [Mesh](/api/wtc-gl/classes/Mesh) in the API reference.
