---
'wtc-gl': minor
---

Add a `Tube` primitive, which sweeps a circle along a `Path` or `Curve`. `new Tube(gl, { path, radius, tubularSegments, radialSegments, closed })`. The rings are spaced evenly by distance and oriented by `path.computeFrames`, so the path's tilt twists the tube. `radius` can be a function of `u` (0 to 1 along the path) for tapers, and the normals lean with the taper so it lights correctly. `closed` defaults to the path's own and joins the last ring onto the first. The ends are open. Based on OGL's `Tube`.
