---
'wtc-gl': minor
---

Fix bugs found while writing the docs:

- Struct uniforms work: give a `Uniform` an object of member values (or an array of them for an array of structs), and each member is uploaded to its own location. Adds the `WTCGLUniformStruct` type.
- `Texture` applies changed filter, wrap, anisotropy and comparison settings on its next use, without `needsUpdate` or a re-upload.
- `ParticleSimulation` gives every particle a reference, at its texel's centre; starts its clock on the first frame and caps long gaps at 50 ms; cancels the requested frame when stopped; gives `u_resolution` in device pixels without `autoResize`; and gains `destroy()`. Its default shaders draw the point cloud without unsupplied inputs.
- `ScrollRenderer.playing = false` cancels the requested frame, so restarting can't run two loops.
- `ScrollImage` gains `destroy()`, which deletes its texture, and `ScrollHTML.destroy()` deletes its texture too, so `useScrollImage` no longer leaks on unmount.
- `ScrollHTML` tracks its placeholder when it captures the element itself, and `destroy()` puts the element back where it was.
- `Camera.frustumIntersects` no longer culls drawables that aren't meshes.
- `DollyCamera`'s camera options are optional.
- `Sphere`'s index has no trailing degenerate triangles.
- The render callbacks of `FragmentShader` and `ParticleSimulation` name their argument `time`, as it's the frame's timestamp.
