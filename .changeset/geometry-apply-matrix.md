---
'wtc-gl': minor
---

Add `Geometry.applyMatrix(mat4)`, which bakes a transform into the geometry's data. Positions are transformed by the matrix, and normals by its normal matrix and then re-normalised. 2D and interleaved attributes are supported. A mirroring matrix (negative determinant) also reverses each triangle's winding, so mirrored faces aren't back-face culled. Existing bounds are recomputed. External positions are skipped with a warning.
