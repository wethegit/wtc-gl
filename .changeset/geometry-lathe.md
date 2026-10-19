---
'wtc-gl': minor
---

Add a `Lathe` primitive, which spins a 2D profile around the y axis. `points` takes `[r, y]` pairs or `Vec2`s, listed bottom to top for outward-facing triangles. It also takes `segments`, plus `phiStart`/`phiLength` for a partial sweep starting from +z, like `Cylinder`. v is spaced by distance along the profile, so textures don't stretch where points are unevenly spaced. Normals are smooth, including at corners in the profile. `Lathe.build()` returns the raw arrays, with optional per-point profile normals, for primitives built from a profile.
