---
'wtc-gl': minor
---

Add `Line`, for thick lines: a `Mesh` that extrudes its points in screen space in the vertex shader (the technique from OGL's Polyline and three.js's MeshLine).

- Width in pixels, or in world units with `sizeAttenuation`, with a per-point `width` callback for tapers.
- Mitred joins with a `miterLimit`, and `closed` loops.
- Dashes (`dashArray`, `dashOffset`, `dashRatio`) measured along the distance travelled, so they keep their size as a line grows.
- A texture `map` with `repeat`, plus `opacity`, `alphaTest` and `visibility` for drawing a line on.
- `setPoints()` reuses the buffers when the point count is unchanged, and `push()` adds a head point and drops the tail, for trails.
- Without a camera, points are in clip space.

The buffers are built by `LineGeometry`, which can be used with custom shaders, and the extrusion is exported as `lineExtrudeGLSL` so those shaders can reuse it (for example lines whose points come from a texture).
