---
'wtc-gl': patch
---

Fix several `Mesh` bugs:

- `Mesh.draw` no longer creates new matrix uniforms on every frame. It was checking for `modelMatrix` instead of `u_modelMatrix`, so the check never passed.
- Drawing a mesh scaled to zero with a camera no longer throws. The previous normal matrix is kept when the model-view matrix can't be inverted.
- `u_objectPosition` is now the mesh's world position, not its local position, so it's correct for child objects.
- `removeBeforeRender` / `removeAfterRender` now remove every copy of the callback, including ones registered back to back.
