---
'wtc-gl': patch
---

Fix `Program` and `Uniform` bugs:

- `Program.setBlendEquation()` no longer throws. `blendEquation` now defaults to `FUNC_ADD`.
- A program that fails to link no longer throws on every frame. It logs the link error once, has the new `linked` flag set to `false`, and meshes using it draw nothing. Its shaders are now deleted when linking fails too.
- `Program.remove()` clears the renderer's current-program cache when it deletes the active program.
- `Float32Array` uniform values are now cached by copy, so changes made in place are uploaded on the next draw. `Float32Array` values for `float[]` uniforms are now set at all.
