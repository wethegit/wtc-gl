---
'wtc-gl': minor
---

Add `toManifold` and `fromManifold`, a thin adapter for CSG with manifold-3d. wtc-gl doesn't depend on manifold-3d: load it yourself and pass the module in. Booleans and transforms use manifold's own API, vertex attributes listed in `properties` carry through, and normals are oriented correctly after transforms and subtractions.
