---
'wtc-gl': patch
---

Fix `Geometry` bugs and export `Sphere`:

- `setDrawRange` now works with 32-bit (`Uint32Array`) indices. The draw offset assumed 2-byte indices, which gave an invalid offset and drew nothing.
- `computeBoundingBox` / `computeBoundingSphere` no longer throw on a geometry with no `position` attribute. The bounds are left unset instead.
- Transform-feedback draws no longer write a `feedbk` global to `window`.
- `Sphere` geometry is now exported from the package.
