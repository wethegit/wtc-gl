---
'wtc-gl': minor
---

Add `Curve`, a `Path` through or around a list of points, so it samples evenly by distance and has frames like any path. `new Curve({ points, type, closed, alpha })`:

- `catmullrom` (the default) passes smoothly through every point. `alpha` sets the knot spacing: 0 is the uniform Catmull-Rom, 0.5 (the default) is centripetal, which doesn't form cusps or loops within a span, and 1 is chordal. `closed` joins the end back to the start, smoothly. Repeated points are skipped.
- `quadraticbezier` (`p0, c, p1, c, p2, …`) and `cubicbezier` (`p0, c1, c2, p1, …`) chain Bézier spans that share their end points. A point count that doesn't make whole spans throws, rather than dropping points. `closed` adds a straight line back to the start.

`setPoints(points)` rebuilds a curve with the same options. Also adds `Path.clear()`, which empties a path ready for a new `moveTo`.
