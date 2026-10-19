---
'wtc-gl': minor
---

Add `Path`, a continuous 3D path drawn like a canvas path: `moveTo`, then `lineTo`, `quadraticCurveTo` and `bezierCurveTo`, and optionally `close()`. Points can be `Vec3`s, `Vec2`s (z = 0) or `[x, y]`/`[x, y, z]` arrays, and they're copied, never mutated.

- Sampling is by distance along the path, including inside curved segments, so `getPoints(divisions)` and `getPointAt(u)` give evenly spaced points. There are also `getPointAtLength`, `getTangentAt`/`getTangentAtLength`, `getTiltAt` and `getLength`. The samplers take an optional `out` vector and don't allocate.
- `computeFrames(divisions, closed)` returns rotation-minimising tangents, normals and binormals. Each frame is twisted by the per-point tilt (radians, interpolated along each segment) and by an optional `tiltFunction`. On a closed path, the leftover twist is spread around the loop so the last frame matches the first.
- The segment classes (`LineSegment`, `QuadraticBezierSegment`, `CubicBezierSegment`) are exported for `addSegment`.

Based on OGL's `Path`, with arc-length sampling inside segments and corrected tilt interpolation.
