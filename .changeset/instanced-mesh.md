---
'wtc-gl': minor
---

Add `InstancedMesh`: many copies of one geometry in a single draw call, each with its own matrix and colour.

- `setMatrixAt(i, matrix)` and `setColourAt(i, colour)` set an instance, and `getMatrixAt` and `getColourAt` read one back. Matrices start as the identity and colours as white. `count` draws only the first instances, up to the `capacity` the mesh was made with.
- Programs read the instances from `in mat4 instanceMatrix` and `in vec3 instanceColour`. `LitProgram` and `NormalProgram` take a new `instanced` option, which transforms positions and normals by the instance matrix (correct for non-uniform scale) and, for `LitProgram`, multiplies the colour by the instance colour.
- The geometry is shared rather than changed: the instanced mesh draws from its buffers through a geometry of its own, so the same geometry can also be drawn by an ordinary mesh, and removing the instanced mesh never deletes its buffers. `update()` follows changes to the geometry.
- With `frustumCulled`, each instance is culled against the camera every draw, without allocating per instance, and only the visible ones are drawn. Nothing is uploaded when neither the instances nor the visible set changed. `cullCamera` culls against a different camera than the one drawing, and `cull(camera)` can be called directly.
