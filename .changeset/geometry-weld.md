---
'wtc-gl': minor
---

Add `Geometry.toNonIndexed()` and `Geometry.mergeVertices(tolerance = 1e-4)`, for switching between flat and smooth shading. Both return a new `Geometry` with its own tightly packed copies of the attributes, including instanced ones, and leave the original unchanged.

- `toNonIndexed()` gives every index entry its own vertex, so `computeVertexNormals()` then gives one normal per face.
- `mergeVertices()` welds vertices whose attributes, apart from `normal`, match within the tolerance, so UV seams are kept. It drops vertices the index never uses, keeps the triangle order and winding, and picks a 16- or 32-bit index depending on the vertex count. If the source had normals, they're recomputed, so shared vertices come out smooth.
