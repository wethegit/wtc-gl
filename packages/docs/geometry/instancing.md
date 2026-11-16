# Instancing

Draw thousands of copies of one geometry in a single draw call with `InstancedMesh`, each with its own matrix and colour. {.lead}

Every `Mesh` is a draw call of its own, with its own matrices and uniforms to set. A few hundred are fine; thousands keep the CPU busy every frame. An `InstancedMesh` draws one geometry many times in one call, reading each copy's transform and colour from a buffer, so a crowd of cubes costs about the same to issue as one.

<Example src="instancing" :height="360" demo="many-meshes" />

<<< @/examples/instancing.js

## Making an instanced mesh

Give it the geometry each instance draws, a program that reads the instance data, and how many instances there's room for:

```js
import { InstancedMesh, LitProgram, Lights, Box } from 'wtc-gl'

const cubes = new InstancedMesh(gl, {
  geometry: new Box(gl, { width: 0.2, height: 0.2, depth: 0.2 }),
  program: new LitProgram(gl, { lights: new Lights(), instanced: true }),
  count: 1000
})
cubes.setParent(scene)
```

| Option          | Default        | What it does                                         |
| --------------- | -------------- | ---------------------------------------------------- |
| `geometry`      | required       | The geometry each instance draws                     |
| `program`       | required       | A program that reads `instanceMatrix`                |
| `count`         | required       | How many instances there's room for; must be above 0 |
| `mode`          | `gl.TRIANGLES` | The draw mode                                        |
| `frustumCulled` | `true`         | Test each instance against the camera                |
| `renderOrder`   | `0`            | An explicit render order, as on a `Mesh`             |

The geometry isn't changed. The instanced mesh draws from its buffers through a geometry of its own (`cubes.geometry`), so the same geometry can be drawn by ordinary meshes too. `cubes.source` is the geometry you passed in, and `cubes.capacity` the count it was made with.

An `InstancedMesh` is a `Mesh` in the scene graph, so its own position, rotation and scale move every instance together.

## Placing instances

Every instance starts with the identity matrix, so they all sit at the mesh's origin until you place them. `setMatrixAt(i, matrix)` copies a `Mat4` into instance `i`. The easiest way to make the matrix is with a spare `Obj`, set up the way you'd set up a mesh:

```js
import { Obj } from 'wtc-gl'

const dummy = new Obj()
for (let i = 0; i < 1000; i++) {
  dummy.position.reset(Math.random() * 10 - 5, 0, Math.random() * 10 - 5)
  dummy.rotation.y = Math.random() * Math.PI * 2
  dummy.updateRotation()
  dummy.updateMatrix()
  cubes.setMatrixAt(i, dummy.matrix)
}
```

`getMatrixAt(i, out)` copies one back into a `Mat4`. An index outside the capacity throws a `RangeError`.

### Animating

Set the matrices again every frame you want them to move, as in the example. Changes upload on the next draw, all at once, and only when something has changed, so instances that hold still aren't uploaded again.

`cubes.matrices` and `cubes.colours` are the arrays behind the instances, 16 and 3 numbers apiece, for reading. Write through `setMatrixAt` and `setColourAt`, which tell the mesh there's something to upload.

## Colours

`setColourAt(i, [r, g, b])` gives an instance its own colour. Colours start white. `LitProgram` multiplies the instance colour with its `colour`, so leave that white to see the instance colours as they are, or tint them all at once with it.

```js
cubes.setColourAt(i, [0.95, 0.42, 0.26])
```

`getColourAt(i, out)` copies one back into an array.

## Drawing fewer

`count` is how many instances are drawn, from the first. It starts at the capacity and can be set anywhere from 0 to the capacity, so you can make room for the most you'll need and show fewer:

```js
cubes.count = 250
```

To go past the capacity, make a new `InstancedMesh`.

## Programs for instances

The instance data arrives as two attributes: `in mat4 instanceMatrix` and `in vec3 instanceColour`.

- `LitProgram` with `instanced: true` reads both, the colour multiplying its own.
- `NormalProgram` with `instanced: true` reads the matrix, for checking an instanced mesh's normals.

Both can be switched later by setting `program.instanced`, which recompiles the shaders.

In your own vertex shader, transform the position by `instanceMatrix` before the model-view matrix:

```glsl
#version 300 es
in vec3 position;
in vec3 normal;
in mat4 instanceMatrix;
in vec3 instanceColour;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

out vec3 v_normal;
out vec3 v_colour;

void main() {
  vec4 local = instanceMatrix * vec4(position, 1.0);
  // Right for rotations and uniform scales. LitProgram also divides by each
  // axis's squared scale, for instances stretched along one axis.
  v_normal = u_normalMatrix * mat3(instanceMatrix) * normal;
  v_colour = instanceColour;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * local;
}
```

For other per-instance values, such as a size or an animation offset, an [instanced attribute](/geometry/geometry-and-attributes#instanced-attributes) on a plain `Geometry` does the job with your own shader.

## Culling

With `frustumCulled` on, the default, each instance is tested against the camera every time it's drawn, using the geometry's bounding sphere scaled by the instance's matrix. Only the instances in view are packed into the buffer and drawn. After a render, `cubes.geometry.instancedCount` is how many that was.

The mesh as a whole is never culled, and transparent instances aren't sorted among themselves.

`cullCamera` culls against another camera than the one drawing. Use it to draw a scene from a second camera, such as an overview, while showing what the first one can see:

```js
cubes.cullCamera = mainCamera
renderer.render({ scene, camera: overviewCamera })
```

Set `frustumCulled: false` when the instances are always in view anyway, or when a vertex shader moves them away from their matrices, which the test can't see. Every instance up to `count` is then drawn. It also helps when the mesh casts a [shadow](/lighting/shadows): the light's camera culls differently from yours, so with culling on, the instances are packed and uploaded twice a frame.

## Changing the geometry

The instanced mesh reads the source geometry's buffers. If you replace an attribute or the index on the source, call `cubes.update()` to follow it. To draw a different geometry, make a new `InstancedMesh`.

## Picking instances

[Raycast](/interaction/raycast) hits each instance separately, and says which with `instanceId`:

```js
import { Raycast } from 'wtc-gl'

const raycast = new Raycast()
const [hit] = raycast.castMouse(camera, pointer).intersectMeshes(cubes)
if (hit) cubes.setColourAt(hit.instanceId, [0.3, 1, 0.9])
```

`pointer` is the pointer's position in normalised device coordinates, -1 to 1 across the canvas.

## From glTF

[GLTFLoader](/loading/gltf) turns nodes that use the `EXT_mesh_gpu_instancing` extension into an `InstancedMesh`, with the matrices composed from the file's translations, rotations and scales.

## Cleaning up

`cubes.geometry` only reads the source's buffers, so removing it leaves them alone. Remove the source geometry too once nothing else draws it:

```js
cubes.setParent(null)
cubes.geometry.remove()
box.remove()
program.remove()
```

## See also

- The [many-meshes demo](https://wethegit.github.io/wtc-gl/demos/many-meshes/), comparing thousands of meshes with one `InstancedMesh`, with an overview camera and hover picking
- The [icon-swarm demo](https://wethegit.github.io/wtc-gl/demos/icon-swarm/), with an `InstancedMesh` for each glTF model, lit and casting shadows
- [Geometry and attributes](/geometry/geometry-and-attributes#instanced-attributes), for instanced attributes of your own
- API: [InstancedMesh](/api/wtc-gl/classes/InstancedMesh), [InstancedMeshOptions](/api/wtc-gl/interfaces/InstancedMeshOptions), [LitProgramOptions](/api/wtc-gl/interfaces/LitProgramOptions)
