---
'wtc-gl': minor
---

Add `Polyline`, a MeshLine for wtc-gl: a line drawn as a strip of triangles that can be any width, taper, dash, carry a texture and draw itself on.

- By default it's a billboard, extruded in screen space with mitred corners so it always faces the camera. `width` is in CSS pixels, or in world units with `sizeAttenuation`, and `taper: (u, i) => number` scales it along the line. Pixels are measured from the viewport being drawn to, so widths are right in a render target too. Drawn without a camera, the points are in clip space.
- With `billboard: false` it's a flat ribbon in world space that follows rotation-minimising frames. It starts out facing `facing` (by default the plane its points lie in), `tilt` rolls it about the line, and `bank` leans it into turns in proportion to how tightly it curves.
- Dashes (`dashArray`, `dashRatio`, `dashOffset`) are measured by the distance travelled. `visibility` draws the line on, and it also supports `map` (settable at any time), `repeat`, `alphaTest` and `opacity`. It turns `transparent` on by default for a map or an opacity below 1, and premultiplies its output when the renderer uses premultiplied alpha.
- `points` can be a point list, or a `Path` or `Curve` sampled with `toPolyline`. `setPoints` reuses the buffers when the count is unchanged, and `push` adds a point and drops the oldest, for trails. `closed` loops it, and `miterLimit` caps sharp corners.
- `vertex` and `fragment` take custom shaders, and `uniforms` and `attributes` add to the line's own, including instanced attributes, to draw many lines at once. `polylineExtrude` exports the billboard extrusion as GLSL for custom vertex shaders.

`Path.computeFrames` now uses the new `rotationMinimisingFrames(tangents, { closed, tilts, normal })`, which works on any list of tangents. Its results are unchanged.
