# Debug helpers

See a mesh's normals, edges and axes, and the world's floor, while you work out why something looks wrong. {.lead}

When lighting looks wrong, the cause is usually the geometry: normals pointing the wrong way, faces wound backwards, or a mesh that isn't where you think it is. The helpers make each of these visible. `NormalProgram` colours a surface by its normals, and the others are meshes of lines you add to the scene.

<Example src="debug-helpers" :height="360" demo="lighting" />

<<< @/examples/debug-helpers.js

The line helpers all draw `gl.LINES`, which WebGL draws one pixel wide. They're for checking your work, not for the finished page; for lines with real width, use a [Polyline](/lines/polyline). Each needs a camera to draw.

## NormalProgram

`NormalProgram` colours a mesh by its normals. Each axis, from -1 to 1, becomes a colour channel from 0 to 1, so a normal pointing along +x is pink-red, +y light green and +z lilac-blue. A smooth surface should change colour smoothly; a hard seam or a patch of the wrong colour points to a broken normal.

```js
import { Mesh, NormalProgram } from 'wtc-gl'

const normals = new NormalProgram(gl, { space: 'world' })

// Swap it onto a mesh to check it, and back again
const own = model.program
model.program = normals
// ...
model.program = own
```

One `NormalProgram` can be shared by any number of meshes. Its options:

- `space` is `'view'` (the default) or `'world'`. In view space the colours follow the camera, so a face turned towards you is always lilac-blue. In world space they stay put as the camera moves, so up is always green.
- `flatShading: true` shows each triangle's face normal rather than the geometry's normals, to check the shape apart from its normals.
- `doubleSided: true` draws the back faces too, with their normals flipped.
- `instanced: true` reads each instance's matrix from an `InstancedMesh`.

Each has a setter. Changing an option recompiles the program with `setShaders`.

## WireMesh

`WireMesh` draws each edge of a triangle geometry once, to show how a surface is divided up.

```js
import { WireMesh } from 'wtc-gl'

const wire = new WireMesh(gl, {
  geometry: mesh.geometry,
  colour: [0.1, 0.1, 0.12],
  opacity: 0.4
})
wire.setParent(mesh)
```

It isn't attached to anything, so make it a child of the mesh, as here, or give it the same transform. It's pulled a little towards the camera so it shows on the surface rather than being hidden by it.

- `geometry` is required: the geometry whose edges to draw.
- `colour` is black by default, and `opacity` is 1. Below 1, the lines blend.
- `frustumCulled` and `renderOrder` work as for any [mesh](/core/scene-graph).

It draws straight from the source geometry's position buffer rather than copying it, so positions the source updates show in the wireframe too. Call `wire.update()` after the source's index or vertex count changes.

## AxesHelper

`AxesHelper` draws the x, y and z axes as red, green and blue lines from the origin. Add it to the scene to show the world's axes, or as a child of an object to show which way its own axes point.

```js
import { AxesHelper } from 'wtc-gl'

const axes = new AxesHelper(gl, { size: 0.5 })
axes.setParent(model)
```

- `size` is the length of each axis, 1 by default.
- `symmetric: true` extends each axis through the origin to `-size` as well.
- `xColour`, `yColour` and `zColour` change the colours.

## GridHelper

`GridHelper` is a square grid of lines on the XZ plane, centred on the origin, like a floor. It gives a sense of scale and of which way is up.

```js
import { GridHelper } from 'wtc-gl'

const grid = new GridHelper(gl, { size: 12, divisions: 24 })
grid.setParent(scene)
```

- `size` is the width and depth of the grid, 10 by default.
- `divisions` is the number of squares along each side, 10 by default.
- `colour` is the colour of the lines, and `centreColour` the colour of the two lines through the centre.

Like `WireMesh`, it's pulled a little towards the camera, so it can lie on a ground plane without flickering. Raise it a fraction to put an `AxesHelper` on top of it, since the grid's centre lines run along the x and z axes.

## VertexNormalsHelper

`VertexNormalsHelper` draws a line out of each vertex of a mesh, along its normal. Each line should point out of the surface, away from its inside.

```js
import { VertexNormalsHelper } from 'wtc-gl'

const vertexNormals = new VertexNormalsHelper(mesh, { size: 0.15 })
```

It takes the mesh rather than the context, and makes itself a child of it, so it moves with the mesh. `size` is the length of each line in world units, 0.1 by default, however the mesh is scaled, and `colour` is blue by default.

It reads the mesh's positions and normals once, so they must be on the CPU. Call `update()` after they change, or after the mesh's geometry is replaced.

## FaceNormalsHelper

`FaceNormalsHelper` draws a line out of the centre of each triangle, out of its front face. Use it to check winding: a face whose line points inwards is wound backwards, and will be culled from the outside and lit from the wrong side.

```js
import { FaceNormalsHelper } from 'wtc-gl'

const faceNormals = new FaceNormalsHelper(mesh, { size: 0.15 })
```

It takes the same options as `VertexNormalsHelper`, with orange as its default `colour`, and works the same way: it becomes a child of the mesh, reads the positions (and index) once, and has an `update()`. The mesh should draw `gl.TRIANGLES`.

## Removing them

The helpers are meshes. Hide one with `visible = false`, or take it out with `setParent(null)`. To free it, remove its geometry and program:

```js
faceNormals.setParent(null)
faceNormals.geometry.remove()
faceNormals.program.remove()
```

Removing a `WireMesh`'s geometry never deletes the source's position buffer, which it only reads.

## See also

- [Lights and LitProgram](/lighting/lights), whose lighting depends on good normals.
- [Geometry and attributes](/geometry/geometry-and-attributes), for where normals come from.
- [Raycast](/interaction/raycast), whose hits carry the normal and face normal under the pointer.
- API: [NormalProgram](/api/wtc-gl/classes/NormalProgram), [WireMesh](/api/wtc-gl/classes/WireMesh), [AxesHelper](/api/wtc-gl/classes/AxesHelper), [GridHelper](/api/wtc-gl/classes/GridHelper), [VertexNormalsHelper](/api/wtc-gl/classes/VertexNormalsHelper), [FaceNormalsHelper](/api/wtc-gl/classes/FaceNormalsHelper).
