# Geometry and attributes

A `Geometry` is a set of named vertex attributes, and optionally an index, uploaded to the GPU for a mesh to draw. {.lead}

Each attribute is a `GeometryAttribute`: a typed array, and how many numbers make up one vertex's value. A vertex shader reads them by name, so a `position` attribute feeds `in vec3 position`. The built-in shapes in [primitives](/geometry/primitives) are geometries with `position`, `normal`, `uv` and `index` already filled in; this page is about making and changing your own.

## Making a geometry

Pass the attributes by name. This is a square in the xy plane, made of two triangles that share two of their corners through the index:

```js
import { Geometry, GeometryAttribute } from 'wtc-gl'

const geometry = new Geometry(gl, {
  position: new GeometryAttribute({
    size: 3,
    data: new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0
    ])
  }),
  uv: new GeometryAttribute({
    size: 2,
    data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1])
  }),
  index: new GeometryAttribute({
    data: new Uint16Array([0, 1, 2, 0, 2, 3])
  })
})
```

The data is uploaded when the geometry is made. Triangles are front-facing when their corners run anticlockwise as you look at them, and programs cull back faces by default, so a triangle wound the other way is invisible from the front.

## Attribute options

| Option       | Default     | What it does                                                                                         |
| ------------ | ----------- | ---------------------------------------------------------------------------------------------------- |
| `data`       | required    | A `Float32Array`, `Uint16Array` or `Uint32Array` of values                                           |
| `size`       | `1`         | Numbers per vertex: 2 for a `vec2`, 3 for a `vec3`, 16 for a `mat4`                                  |
| `type`       | from `data` | The GL type: `FLOAT` for a `Float32Array`, `UNSIGNED_SHORT` for a `Uint16Array`, else `UNSIGNED_INT` |
| `normalized` | `false`     | Read integers as 0 to 1 in the shader                                                                |
| `instanced`  | `0`         | The divisor: how many instances share each value. 0 means one value per vertex                       |
| `stride`     | `0`         | Bytes from one vertex's value to the next, for interleaved data. 0 means tightly packed              |
| `offset`     | `0`         | Bytes from the start of `data` to the first value                                                    |
| `count`      | from `data` | The number of values, worked out from `data`, `size` and `stride` when left out                      |
| `buffer`     | `null`      | An existing WebGL buffer to use instead of making one                                                |
| `external`   | `false`     | Whether something else, such as a `TransformFeedback`, owns `buffer`                                 |

WebGL has no 64-bit float attributes, so keep float data in a `Float32Array`.

### Normalised integers

Colours stored as integers take less memory. With `normalized`, a `Uint16Array` of 0 to 65535 reads as 0 to 1 in the shader:

```js
const colour = new GeometryAttribute({
  size: 3,
  data: new Uint16Array([65535, 0, 0, 0, 65535, 0, 0, 0, 65535]),
  normalized: true
})
```

### Interleaved data

When several attributes come in one array, one vertex after another, give each the same `data` with a `stride` and `offset` in bytes. Here each vertex is five floats, x y z u v, so 20 bytes:

```js
const data = new Float32Array([/* x, y, z, u, v for each vertex */])
const geometry = new Geometry(gl, {
  position: new GeometryAttribute({ size: 3, data, stride: 20, offset: 0 }),
  uv: new GeometryAttribute({ size: 2, data, stride: 20, offset: 12 })
})
```

Each attribute uploads the array to a buffer of its own, so this is for reading data that arrives interleaved rather than for saving GPU memory. The CPU tools below read interleaved attributes correctly.

### Instanced attributes

An attribute with `instanced: 1` has one value per instance rather than per vertex, and makes the geometry draw that many instances in one call. `geometry.instancedCount` is set from it: the attribute's count times its divisor.

```js
import { Box, GeometryAttribute } from 'wtc-gl'

const offsets = new Float32Array(100 * 3).map(() => Math.random() * 10 - 5)

const geometry = new Box(gl, {
  attributes: {
    offset: new GeometryAttribute({ size: 3, instanced: 1, data: offsets })
  }
})
```

The vertex shader reads `in vec3 offset` and adds it to the position. If two instanced attributes give different instance counts, the geometry warns and draws the smaller. A mesh is frustum culled from its geometry's bounds, which don't know where the instances are, so give the mesh `frustumCulled: false` when they spread out.

For the usual case, many copies each with a matrix and colour, use [`InstancedMesh`](/geometry/instancing), which sets this up and culls each instance. The [camera-and-instancing demo](https://wethegit.github.io/wtc-gl/demos/camera-and-instancing/) draws with an instanced `mat4` attribute of its own.

### External attributes

`external: true` marks an attribute whose `buffer` is owned by something else, such as a [`TransformFeedback`](/simulation/transform-feedback) writing positions on the GPU. The geometry never uploads, recreates or deletes an external buffer, and follows it when it's swapped. Its `data` is only the starting values, so bounds aren't measured from it and the CPU tools leave it out: set `geometry.bounds` yourself, or give the mesh `frustumCulled: false`.

## The index

The `index` attribute lists the vertices of each triangle, so vertices can be shared. Use a `Uint16Array` for up to 65,536 vertices and a `Uint32Array` beyond that; the built-in shapes switch for you.

To replace the index after the geometry is made, use `setIndex`, with an attribute or a typed array. It resets `drawRange.start` to 0. The old index buffer isn't deleted, because attributes can be shared between geometries.

```js
geometry.setIndex(new Uint16Array([0, 2, 1, 0, 3, 2]))
```

To change indices in place at the same length, edit `geometry.attributes.index.data` and set its `needsUpdate`.

## Draw range and instance count

`drawRange` is which part of the geometry is drawn: `start` and `count` in index entries for an indexed geometry, or in vertices for one without. It starts as the whole geometry. Drawing fewer triangles is a cheap way to build a shape up over time:

```js
const total = geometry.attributes.index.count
geometry.setDrawRange(0, Math.floor((total * progress) / 3) * 3)
```

`instancedCount` is how many instances an instanced geometry draws. `setInstancedCount(n)` draws fewer than the instanced attributes hold.

## Updating data

Edit an attribute's `data` in place, then set `needsUpdate`. It's uploaded the next time a program that reads it draws the geometry:

```js
const position = geometry.attributes.position
for (let i = 0; i < position.data.length; i += 3) {
  position.data[i + 1] = Math.sin(position.data[i] * 4 + time)
}
position.needsUpdate = true
```

For a different number of vertices, add a new attribute with `addAttribute(name, attribute)`, which replaces one of the same name, then set the draw range to match. `addAttribute` also adds attributes the geometry doesn't have yet. The replaced attribute's buffer isn't deleted, as with `setIndex`.

Moving positions doesn't move the bounds. If the mesh is frustum culled or raycast, measure them again afterwards.

## Bounds

`geometry.bounds` holds `min`, `max`, `center` and `scale` (the box's size), and `radius`, a sphere around the centre. The renderer uses it to skip meshes outside the camera, and [Raycast](/interaction/raycast) to find what a ray might hit. It's measured from `position` the first time it's needed.

`computeBoundingBox()` measures the box and `computeBoundingSphere()` the sphere. Call both after changing positions on the CPU:

```js
geometry.computeBoundingBox()
geometry.computeBoundingSphere()
```

When positions move in a shader, the bounds can't see it. Set `geometry.bounds` to something big enough, or give the mesh `frustumCulled: false`.

## CPU tools

These work on the attribute data on the CPU, and assume the geometry is drawn as triangles. They skip external attributes, since their data can't be read back.

### Normals

`computeVertexNormals()` works out normals from the positions, each face weighted by its area. On an indexed geometry, faces that share a vertex share its normal, so the surface looks smooth; on a non-indexed one, every triangle has its own vertices, so it looks faceted. It writes into the existing `normal` attribute when it can, and adds one when there isn't one.

### Transforming

`applyMatrix(matrix)` moves the data itself: positions by the matrix, and normals by its normal matrix. Use it to place a shape once, rather than through a mesh's transform every frame, for example before merging:

```js
import { Cylinder, Mat4, Vec3 } from 'wtc-gl'

// A cone standing on the origin rather than centred on it
const cone = new Cylinder(gl, { radiusTop: 0, radialSegments: 32 })
cone.applyMatrix(Mat4.fromTranslatingVec3(new Vec3(0, 0.5, 0)))
```

A mirroring matrix, with a negative scale, also reverses each triangle's winding, so the faces still face outwards. Attributes shared with other geometries change for them too. If the bounds have been measured, they're measured again.

### Flat and smooth shading

`toNonIndexed()` returns a copy where every index entry is a vertex of its own. Computing normals on it gives each face its own normal: flat shading. `mergeVertices(tolerance)` goes the other way, welding vertices that match into an indexed copy. If the geometry had normals, they're recomputed, so they're smooth across the welds; the example works its normals out after moving the vertices.

<Example src="flat-and-smooth" :height="320" demo="building-geometry" />

<<< @/examples/flat-and-smooth.js

`mergeVertices` compares every attribute except `normal`, so vertices only weld when their uvs (and any other attributes) match too, within `tolerance` (by default `1e-4`). That's why a `Box` keeps hard edges when welded: each face has its own uvs. It's also why the example copies only the sphere's positions first: the sphere's uvs differ across its seam and at the poles, which would leave creases there. Vertices the index never uses are dropped. Both methods leave the original alone; call `remove()` on it if it's no longer needed.

::: tip
For flat shading without extra vertices, `LitProgram` and `NormalProgram` take `flatShading: true`, which shades each triangle from its face normal in the fragment shader.
:::

### Merging

`mergeGeometries(geometries)` combines geometries into one new geometry, so they draw in a single call. Every geometry needs the same attributes, with the same size, type and normalisation. If any is indexed, the result is indexed. Instanced and external attributes can't be merged, and draw ranges are ignored.

```js
import { Box, Sphere, Mat4, Vec3, mergeGeometries } from 'wtc-gl'

const base = new Box(gl, { width: 1, height: 0.2, depth: 1 })
const ball = new Sphere(gl, { radius: 0.3 })
ball.applyMatrix(Mat4.fromTranslatingVec3(new Vec3(0, 0.4, 0)))

const merged = mergeGeometries([base, ball])
base.remove()
ball.remove()
```

There's no `clone()`; `mergeGeometries([geometry])` makes a copy.

## Cleaning up

`geometry.remove()` deletes its buffers and vertex arrays, except external ones. Attributes can be shared between geometries, so only remove a geometry once nothing else draws from its buffers. See [cleaning up](/core/cleaning-up).

## See also

- [Primitives](/geometry/primitives), the built-in shapes
- [Instancing](/geometry/instancing) with `InstancedMesh`
- [Programs and shaders](/core/programs-and-shaders), for reading attributes in GLSL
- API: [Geometry](/api/wtc-gl/classes/Geometry), [GeometryAttribute](/api/wtc-gl/classes/GeometryAttribute), [GeometryAttributeOptions](/api/wtc-gl/interfaces/GeometryAttributeOptions), [mergeGeometries](/api/wtc-gl/functions/mergeGeometries)
