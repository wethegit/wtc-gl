---
'wtc-gl': minor
---

Add `Raycast`, for picking meshes under the pointer.

- `castMouse(camera, [x, y])` casts from a camera through a point in normalised device coordinates; `set(origin, direction)` sets the ray directly.
- `intersectMeshes(target)` returns the meshes whose triangles the ray meets, nearest first, each with its distance, world and local point, face index, normal (interpolated, or the face normal), face normal and uv. `intersectBounds(target)` stops at each mesh's bounding box, which is cheaper. The target is a mesh, a list of them, or a scene to walk, skipping hidden objects.
- Hits on an `InstancedMesh` say which instance with `instanceId`. Face culling follows each mesh's program, mirrored meshes included, unless `cullFace` is given. `padding` grows the bounds for small targets, and `maxDistance` limits the search.
- `intersectPlane`, `intersectSphere` and `intersectBox` test the ray against single shapes, for dragging and simple hit tests.

Only `gl.TRIANGLES` meshes whose positions are on the CPU can be hit.
