---
'wtc-gl': minor
---

Add a `Torus` primitive, ported from OGL. It lies in the xy plane, centred on the origin. `radius` goes from the centre to the middle of the tube and `tube` is the tube's radius. `radialSegments` go around the tube and `tubularSegments` around the ring. An `arc` below 2π leaves the ring open, sweeping from +x towards +y.
