---
'wtc-gl': minor
---

Add a `Cylinder` primitive, ported from OGL. It's centred on the origin along the y axis, with separate `radiusTop` and `radiusBottom`, so `radiusTop: 0` gives a cone. It also takes `radialSegments`, `heightSegments`, `thetaStart`/`thetaLength` for a partial sweep, and `openEnded` to leave out the caps. A cap with zero radius is always left out. Side normals lean with the slope between the two radii, and each cap has flat normals and circular uvs.
