---
'wtc-gl': minor
---

Add `GLTFLoader`, `Texture.fromURL` and emissive light on `LitProgram`.

- `Texture.fromURL(gl, url, options)` fetches an image and resolves with a texture, decoded with `createImageBitmap`, which also flips and premultiplies it. It takes an abort `signal`. `Texture.fromBlob` does the same for an image already in hand.
- `GLTFLoader.load(gl, url, options)` and `GLTFLoader.parse(gl, data, options)` read glTF 2.0 files, `.glb` or `.gltf`, with embedded, `data:` or external buffers and images. Nodes become named `Obj`s, meshes become `Mesh`es (a group of them for several primitives), and cameras become `Camera`s. Meshes shared between nodes share their geometry and program. `EXT_mesh_gpu_instancing` nodes become `InstancedMesh`es. The result lists the nodes, meshes, cameras, programs and textures, and `remove()` frees them.
- Attributes are read into floats, dequantised and with sparse values applied, as `position`, `normal`, `uv` and `colour`, so bounds, `Raycast` and the geometry tools work on loaded models.
- Materials are approximated with `LitProgram` (also exported as `materialProgram`): base colour factor and texture, alpha modes, double-sided, vertex colours, emissive (with `KHR_materials_emissive_strength`) and a highlight from roughness. A primitive without normals is shaded flat. Normal, occlusion and metallic-roughness textures are ignored, and colours aren't colour-managed.
- Skinning, morph targets, animation and compression aren't supported. A file that requires an unsupported extension is rejected, naming it.
- `LitProgram` gains `emissive` and `emissiveMap`: light the surface gives off, added after lighting.
- `Obj` gains a `name`.
