---
'wtc-gl': minor
---

Add `mergeGeometries(geometries)`, which combines geometries into one new `Geometry` so they draw in a single call. Use it with `applyMatrix` to build a model from transformed parts. Every input needs the same attributes with the same size, type and normalisation; anything else throws, as do instanced and external attributes. If any input is indexed, the result is indexed: the non-indexed inputs get a sequential index, and indices are rebased onto the merged vertices, 32-bit past 65,536 vertices. The inputs are left unchanged.
