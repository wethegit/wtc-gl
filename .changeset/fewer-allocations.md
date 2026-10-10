---
'wtc-gl': minor
---

The render loop makes almost no garbage. With 1,000 animated meshes it used to allocate about 7.8 KB per mesh per frame; now it's about 70 bytes. In Chrome, a 6,000-mesh scene went from ~45 ms to ~10 ms of CPU per frame.

- `Obj` updates `matrix`, `worldMatrix` and `quaternion` in place, and `Camera` does the same for `viewMatrix`, `projectionViewMatrix`, `worldPosition` and the frustum planes. The wtc-math methods used before allocate even in their "in place" forms, so these use allocation-free versions of the same formulas.
- `Mesh.draw` keeps a typed array per matrix and vector uniform, updates `modelViewMatrix` and `normalMatrix` in place, and reuses its option objects.
- `Renderer.render` reuses its render lists, viewport vectors and draw options, and culls and sorts without temporary objects. `getRenderList()` still returns a new array.
- `ScrollRenderer` updates its viewport and each scene's `u_resolution`, `u_origin` and `u_elementSize` values in place.

Behaviour change: those matrices and vectors are now the same objects from frame to frame. Code that kept a reference expecting a snapshot (e.g. `const before = mesh.worldMatrix`) should `clone()` it. Matrix uniform values set by `Mesh` are now `Float32Array`s rather than plain arrays.
