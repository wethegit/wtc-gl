---
'wtc-gl': minor
---

Add two ways to smooth a `Curve`:

- `tension` for `catmullrom` curves (default 0). Higher values shorten the tangents, tightening the curve towards straight lines at 1; values below 0 loosen it. It still passes through every point.
- A `bspline` type (`Curve.BSPLINE`): a uniform cubic B-spline. Its curvature doesn't change where spans join, so it's smoother than a Catmull-Rom, but it only passes near the points between the ends. An open one starts and ends on the end points, and `closed` makes a smooth loop.
