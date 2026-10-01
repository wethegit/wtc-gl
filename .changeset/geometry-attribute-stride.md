---
'wtc-gl': patch
---

Fix `GeometryAttribute` counts and bounds for interleaved attributes:

- An explicit `count` is now used as given. Without a `stride` it used to become `Infinity`, and with a `stride` it was ignored.
- `computeBoundingBox` / `computeBoundingSphere` now treat `stride` and `offset` as bytes, matching what's passed to `vertexAttribPointer`. They used them as array indices, so bounds for interleaved attributes were read from the wrong values.
