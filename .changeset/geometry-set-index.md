---
'wtc-gl': minor
---

Add `Geometry.setIndex(index)` to replace a geometry's index after construction. It takes a `GeometryAttribute` or a `Uint16Array`/`Uint32Array`, resets the draw range to the whole new index, and also turns a non-indexed geometry into an indexed one. The old index buffer isn't deleted, because attributes can be shared between geometries.
