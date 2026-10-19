---
'wtc-gl': minor
---

Add `Geometry.computeVertexNormals()`, which computes area-weighted normals from the positions for geometry drawn as triangles. Indexed geometry gets smooth normals across shared vertices, and non-indexed geometry gets one normal per face. It writes into the existing `normal` attribute when it's a plain size-3 `Float32Array` of the right length, and adds one otherwise. 2D and interleaved positions are supported; external positions are skipped with a warning.

`Geometry.addAttribute` now rebuilds the geometry's vertex arrays when it adds or replaces an attribute after the geometry has been drawn. Previously, those vertex arrays kept pointing at the old attributes and ignored the new one.
