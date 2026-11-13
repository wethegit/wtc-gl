---
'wtc-gl': minor
---

Add camera projection helpers and per-instance frustum culling.

- `Camera.project(v, out?)` takes a world-space point to normalised device coordinates, and `Camera.unproject(v, out?)` takes it back. Both work in place by default, or write to `out` and return it, and neither allocates. Unprojecting z = -1 and z = 1 gives the near and far points of the ray under a screen position.
- `Camera.updateProjectionMatrix()` rebuilds the projection after `fov`, `aspect`, `near`, `far`, the orthographic bounds or `zoom` are changed directly. `perspective()` and `orthographic()` now use it.
- `Camera.frustumIntersects(node, worldMatrix?)` takes an optional matrix to place the node's bounds with, such as one instance's matrix. Its scale grows the bounds too.

`projectionMatrix` is now updated in place, so it keeps its reference. `projectionViewMatrix` is also refreshed whenever the projection changes, rather than at the next `updateMatrixWorld()`, so it's no longer out of date between a resize and the next render. Frustum culling no longer allocates per mesh, which roughly halves per-frame allocations in a scene of many meshes.
