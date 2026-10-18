---
'wtc-gl': minor
---

Add an `Extrude` primitive, which turns a 2D outline, with optional `holes`, into a solid along z. It keeps the outline's x and y and centres the solid on z. Outlines can be a `Path` or `Curve`, or a list of points, wound either way. Caps are triangulated with `earcut`, which is now a dependency of wtc-gl.

- `depth` sets the thickness, and `curveDivisions` how finely curves in a `Path` are sampled.
- `bevel` rounds the edges between the caps and the sides: `bevelThickness` adds to each end, `bevelSize` insets the caps, and `bevelSegments` sets the roundness (1 is a chamfer).
- The sides are smooth where they turn by less than `creaseAngle` (default 30°) and hard-edged at sharper corners, both around the outline and across the bevel.
- UVs are in world units. Caps are projected flat as (x, y), and the straight sides run around the outline and from the back. By default (`uvs: 'projected'`) the bevel is projected like the caps, so a texture runs on from the face over the bevel without a seam. `uvs: 'separate'` maps the bevel like the sides instead.

Also adds `Path.toPolyline(curveDivisions)`, which samples a path as a polyline that keeps its corners.
