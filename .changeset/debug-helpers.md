---
'wtc-gl': minor
---

Add debug helpers for inspecting geometry.

- `NormalProgram` colours a mesh by its normals, in view space or, with `space: 'world'`, in world space so the colours stay put as the camera moves. `flatShading` and `doubleSided` work as on `LitProgram`. One instance can be shared by any number of meshes.
- `WireMesh` draws each edge of a triangle geometry once. It reads the source geometry's position buffer rather than copying it, so position updates show in the wire, and removing the wire never deletes the source's buffer. `update()` rebuilds the edges after the source's index changes.
- `AxesHelper` draws the x, y and z axes in red, green and blue, from the origin or through it with `symmetric`.
- `GridHelper` draws a square grid on the XZ plane, with its centre lines in `centreColour`.
- `VertexNormalsHelper` and `FaceNormalsHelper` draw a line along each vertex normal, or out of each triangle's centre along its face normal. They parent themselves to the mesh, stay `size` world units long however it's scaled, and re-read its geometry on `update()`.

The helpers draw with `gl.LINES`, so their lines are one device pixel wide. They pull their lines slightly towards the camera, so a grid or wireframe drawn on a surface shows on top of it.
