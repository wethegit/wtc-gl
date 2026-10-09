---
'wtc-gl': minor
---

Bind texture uniforms by value and check them against the shader:

- A `Texture` (or array of textures) now binds as a texture whatever its `kind`. Without `kind: 'texture'` it used to be passed to `gl.uniform1i` as an object. A mismatched `kind` still binds, with a warning.
- A texture on a uniform the shader doesn't declare as a sampler, a texture whose target doesn't match the sampler (such as a cube map on a `sampler2D`), and a non-texture value on a sampler are now skipped with a warning instead of being sent to WebGL. `null` and texture unit numbers are still accepted on samplers.
- Each of these warnings is shown once per uniform.
- WebGL2 sampler types are now uploaded: `sampler3D`, `sampler2DArray`, the shadow samplers, and the `isampler*`/`usampler*` types. They were silently ignored before.
