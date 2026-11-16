# Paths and curves

Describe lines and curves in 3D with `Path` and `Curve`, sample them evenly along their length, and get frames to orient things along them. {.lead}

A `Path` is drawn like a canvas path: `moveTo`, then straight lines and Bézier curves, optionally closed. A `Curve` is a `Path` built for you through a list of points. Neither draws anything by itself. They're the description that [`Polyline`](/lines/polyline) draws as a line, [`Tube`](/geometry/tube-extrude-lathe#tube) sweeps a solid along and [`Extrude`](/geometry/tube-extrude-lathe#extrude) uses as an outline, and you can sample them to move or place things.

<Example src="paths" :height="320" demo="paths" />

<<< @/examples/paths.js

## Drawing a path

Start with `moveTo`, then add segments. Each one starts where the last ended:

```js
import { Path } from 'wtc-gl'

const path = new Path()
  .moveTo([0, 0, 0])
  .lineTo([1, 0, 0])
  .quadraticCurveTo([2, 0, 0], [2, 1, 0])
  .bezierCurveTo([2, 2, 1], [0, 2, -1], [0, 1, 0])
  .close()
```

- `lineTo(p)` is a straight line to `p`.
- `quadraticCurveTo(cp, p)` is a quadratic Bézier to `p`, pulled towards `cp`.
- `bezierCurveTo(cp1, cp2, p)` is a cubic Bézier to `p`, with two control points.
- `close()` adds a line back to the start, unless the path is already there, and sets `path.closed`.

`moveTo` starts the path, so it has to come before any segments; it throws once one has been added. `clear()` empties the path so it can be drawn again.

A point can be an array, `[x, y]` or `[x, y, z]`, a `Vec2` (with z = 0) or a `Vec3`. A 2D outline is a path whose points have no z.

## Sampling by distance

A Bézier's own parameter, t, bunches up where the curve bends, so sampling it in equal steps gives uneven points. A path samples by distance instead, including inside curved segments. `u` is the fraction of the way along, from 0 to 1:

```js
const length = path.getLength()
const point = path.getPointAt(0.5) // halfway along, by distance
const tangent = path.getTangentAt(0.5) // the unit direction of travel there
const points = path.getPoints(64) // 65 points, evenly spaced
```

`getPointAtLength(distance)` and `getTangentAtLength(distance)` take a distance instead of a fraction. The single-point samplers take an optional `Vec3` to write into, so a loop that runs every frame doesn't allocate:

```js
// Move a mesh along the path at a steady speed
path.getPointAt((time * 0.1) % 1, mesh.position)
```

## Keeping the corners

`getPoints` spaces points evenly, so it can step straight past a sharp corner. `toPolyline(curveDivisions)` keeps every segment's start and end, and adds `curveDivisions - 1` points inside each curved segment (by default 12 divisions per curve). Straight lines get no extra points. A closed path doesn't repeat its start at the end.

```js
const outline = path.toPolyline(16)
```

Use it for outlines. `Polyline` and `Extrude` sample paths this way, with their own `curveDivisions` option.

## Frames along a path

To orient anything along a path, such as a tube's rings, a camera on rails or a row of fence posts, you need more than a tangent: you need which way is "up" at each point. `computeFrames(divisions)` gives `divisions + 1` evenly spaced frames, each a unit `tangent`, `normal` and `binormal` (tangent × normal):

```js
const { tangents, normals, binormals } = path.computeFrames(100)
```

They're rotation-minimising frames: the normal is carried along the path, turning only as much as the tangent does, so it doesn't flip or spin on straight stretches the way Frenet frames do. On a closed path, the twist left over after one lap is spread evenly around the loop, so the last frame matches the first. The second argument, `closed`, defaults to the path's own.

### Tilt

Every drawing command, `moveTo` included, takes an optional tilt in radians at its point, which turns the frames about the tangent. The tilt is interpolated along each segment, so this twists half a turn along the line:

```js
const twisted = new Path().moveTo([0, 0, 0], 0).lineTo([4, 0, 0], Math.PI)
```

For a twist worked out along the whole path, set `tiltFunction`. It's given each frame's tilt, `u` and the path, and returns the tilt to use:

```js
path.tiltFunction = (tilt, u) => tilt + Math.sin(u * Math.PI * 2) * 0.5
```

`getTiltAt(u)` reads the tilt at a point. A `Tube` along a tilted path twists with it.

### Frames for your own points

`rotationMinimisingFrames(tangents, options)` makes the same frames from a list of unit tangents, for points that don't come from a path:

```js
import { rotationMinimisingFrames, Vec3 } from 'wtc-gl'

const frames = rotationMinimisingFrames(tangents, {
  normal: new Vec3(0, 1, 0)
})
```

`normal` is the direction the first normal starts in (made perpendicular to the first tangent); without it, the axis least like the first tangent is used. `tilts` twists each frame, and `closed` spreads the leftover twist around a loop, where the last tangent should repeat the first.

## Curve

A `Curve` is a path through, or around, a list of points. It's a `Path`, so everything above works on it.

```js
import { Curve } from 'wtc-gl'

const curve = new Curve({
  points: [
    [-2, 0, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [2, 0, 0]
  ]
})
```

| Option    | Default        | What it does                                                          |
| --------- | -------------- | --------------------------------------------------------------------- |
| `points`  | `[]`           | The points to build the curve from                                    |
| `type`    | `'catmullrom'` | `'catmullrom'`, `'bspline'`, `'quadraticbezier'` or `'cubicbezier'`   |
| `closed`  | `false`        | Join the end back to the start                                        |
| `alpha`   | `0.5`          | For `catmullrom`: how the spacing of the points shapes the curve      |
| `tension` | `0`            | For `catmullrom`: tighten towards straight lines at 1, loosen below 0 |

The types are also on the class as `Curve.CATMULLROM`, `Curve.BSPLINE`, `Curve.QUADRATICBEZIER` and `Curve.CUBICBEZIER`. To move the points, call `setPoints(points)`, which rebuilds the curve with the same type and options; `curve.points` is a copy of the current ones.

### Catmull-Rom

The default passes smoothly through every point. `alpha` decides how the gaps between points shape it: 0 is the uniform Catmull-Rom, which can overshoot and loop where points are unevenly spaced; 0.5, the default, is centripetal, which never forms cusps or loops within a span; and 1 is chordal. `tension` shortens the tangents: at 1 the curve is straight lines between the points. With `closed`, the end joins the start smoothly.

### B-spline

`'bspline'` is a uniform cubic B-spline. It's smoother than a Catmull-Rom, with no change in curvature where spans meet, so a tube along it has no creases in its shading. In exchange, it only passes near the points between the ends, as if they pull on it. An open one starts and ends on the end points, and `closed` makes a smooth loop.

### Bézier chains

`'quadraticbezier'` takes the points as `p0, c, p1, c, p2, …`, and `'cubicbezier'` as `p0, c1, c2, p1, c1, c2, p2, …`: chains of Bézier spans that share their end points. Use them for points exported from a drawing tool. `closed` adds a straight line back to the start.

A curve throws if it can't be built: fewer than two distinct points, a closed curve with fewer than three, or a Bézier chain whose points don't make whole spans.

## Segments

A path's pieces are `path.segments`: `LineSegment`, `QuadraticBezierSegment` and `CubicBezierSegment`, each parameterised by t from 0 to 1. To build a path from segments you've made yourself, use `addSegment(segment)`; each should start where the path currently ends.

## See also

- [Polyline](/lines/polyline), to draw a path as a line
- [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe), to make solids from paths
- The [paths demo](https://wethegit.github.io/wtc-gl/demos/paths/), with handles to drag
- API: [Path](/api/wtc-gl/classes/Path), [Curve](/api/wtc-gl/classes/Curve), [CurveOptions](/api/wtc-gl/interfaces/CurveOptions), [PathFrames](/api/wtc-gl/interfaces/PathFrames), [rotationMinimisingFrames](/api/wtc-gl/functions/rotationMinimisingFrames), [PathPoint](/api/wtc-gl/type-aliases/PathPoint)
