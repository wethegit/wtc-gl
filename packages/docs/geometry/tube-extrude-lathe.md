# Tube, Extrude and Lathe

Turn paths and outlines into solids: sweep a tube along a path, extrude a 2D outline into a slab, or spin a profile around an axis. {.lead}

All three are [geometries](/geometry/geometry-and-attributes) with `position`, `normal`, `uv` and `index`, so they light with `LitProgram`, take textures, and work with the CPU tools and [CSG](/geometry/csg) like any other shape. They're built from the [paths and curves](/geometry/paths-and-curves) on the previous page, or from plain lists of points.

<Example src="tube-extrude-lathe" :height="340" demo="paths" />

<<< @/examples/tube-extrude-lathe.js

## Tube

A `Tube` sweeps a circle along a `Path` or `Curve`. The rings are spaced evenly by distance along the path and oriented by its [rotation-minimising frames](/geometry/paths-and-curves#frames-along-a-path), so the tube doesn't twist unless the path has a tilt.

```js
import { Curve, Tube } from 'wtc-gl'

const path = new Curve({
  points: [
    [-2, 0, 0],
    [-1, 1, 0.5],
    [1, -1, -0.5],
    [2, 0, 0]
  ]
})
const tube = new Tube(gl, { path, radius: 0.15, tubularSegments: 128 })
```

| Option            | Default       | What it does                                                    |
| ----------------- | ------------- | --------------------------------------------------------------- |
| `path`            | required      | The `Path` or `Curve` to sweep along                            |
| `radius`          | `0.1`         | The radius, or a function of `u`, the fraction of the way along |
| `tubularSegments` | `64`          | Rings along the path                                            |
| `radialSegments`  | `8`           | Divisions around the tube                                       |
| `closed`          | `path.closed` | Join the last ring onto the first                               |

### Tapers

Pass a function as `radius` to vary it along the path. It's given `u`, from 0 at the start to 1 at the end, and the normals lean to match the slope:

```js
// Thick in the middle, to a point at each end
const spindle = new Tube(gl, {
  path,
  radius: (u) => 0.2 * Math.sin(u * Math.PI)
})
```

The ends of an open tube aren't capped. If they'll be seen, taper them to nothing as above, draw the tube two-sided (`doubleSided: true` on `LitProgram`), or cap them with another shape. u runs along the tube and v around it, so a texture wraps it like a label.

A tube is built once. To follow a path that moves, make a new tube and swap it onto the mesh, or for a line that only needs to look round, use a [`Polyline`](/lines/polyline), which can update its points every frame.

## Extrude

An `Extrude` takes a 2D outline, with optional holes, and extrudes it along z into a solid: letters, logos, cookie-cutter shapes.

```js
import { Extrude } from 'wtc-gl'

const square = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1]
]
const hole = [
  [-0.4, -0.4],
  [0.4, -0.4],
  [0.4, 0.4],
  [-0.4, 0.4]
]
const frame = new Extrude(gl, { shape: square, holes: [hole], depth: 0.3 })
```

An outline is a list of points, or a `Path` or `Curve`, which is sampled with [`toPolyline(curveDivisions)`](/geometry/paths-and-curves#keeping-the-corners) so its corners stay sharp. Only x and y are used. Outlines can be wound either way, and don't need to repeat their first point. The solid keeps the outline's x and y and is centred on z, from `-depth / 2` to `depth / 2`.

| Option           | Default       | What it does                                                      |
| ---------------- | ------------- | ----------------------------------------------------------------- |
| `shape`          | required      | The outline                                                       |
| `holes`          | `[]`          | Outlines to cut out of the shape                                  |
| `depth`          | `0.2`         | Length along z, not counting the bevel                            |
| `curveDivisions` | `12`          | Points in each curved segment of a `Path` outline                 |
| `bevel`          | `false`       | Round the edges between the faces and the sides                   |
| `bevelThickness` | `0.05`        | How far the bevel adds to each end along z                        |
| `bevelSize`      | `0.04`        | How far the bevel insets the faces                                |
| `bevelSegments`  | `3`           | Steps in the bevel; 1 is a chamfer                                |
| `creaseAngle`    | `Math.PI / 6` | Sides turning more sharply than this, in radians, get a hard edge |
| `uvs`            | `'projected'` | How the bevel is mapped: `'projected'` or `'separate'`            |

An outline needs at least three points and some area, or `Extrude` throws.

### Curved outlines

Draw the outline as a `Path` to mix straight edges and curves. This is a rounded rectangle:

```js
import { Path, Extrude } from 'wtc-gl'

const w = 1
const h = 0.6
const r = 0.2
const rounded = new Path()
  .moveTo([-w + r, -h])
  .lineTo([w - r, -h])
  .quadraticCurveTo([w, -h], [w, -h + r])
  .lineTo([w, h - r])
  .quadraticCurveTo([w, h], [w - r, h])
  .lineTo([-w + r, h])
  .quadraticCurveTo([-w, h], [-w, h - r])
  .lineTo([-w, -h + r])
  .quadraticCurveTo([-w, -h], [-w + r, -h])
  .close()

const tile = new Extrude(gl, { shape: rounded, depth: 0.1, bevel: true })
```

A `Curve` with `closed: true` is the easy way to get a smooth outline through a few points.

### Bevels and creases

With `bevel`, each end grows by `bevelThickness` along z and the faces are inset by `bevelSize`, joined to the sides by a rounded edge of `bevelSegments` steps. A large `bevelSize` on a tight shape can make the inset outline cross itself, so keep it smaller than the narrowest part.

`creaseAngle` decides where the shading is smooth. Where the outline turns by less than the angle, as around a sampled curve, the normals are shared and the side looks round; at sharper corners, as on a star's points, they're split and the edge is hard. The same applies across the bevel.

### Uvs

Uvs are in world units, so a texture keeps its scale whatever the shape's size; set the texture to repeat. The faces are mapped flat, as (x, y). On the sides, u is the distance around the outline and v the distance from the back. With `uvs: 'projected'`, the default, the bevel is mapped like the faces, so a texture runs on from the face over the bevel without a seam. With `uvs: 'separate'` the bevel is mapped like the sides.

## Lathe

A `Lathe` spins a 2D profile around the y axis. Each point is `[r, y]`, its distance from the axis and its height, or a `Vec2` with the same meaning. List the points from bottom to top so the faces point outwards.

```js
import { Lathe, Vec2 } from 'wtc-gl'

// A bottle: closed on the axis at the bottom, open at the neck
const bottle = new Lathe(gl, {
  points: [
    new Vec2(0, 0),
    new Vec2(0.4, 0),
    new Vec2(0.4, 0.8),
    new Vec2(0.15, 1.1),
    new Vec2(0.15, 1.3)
  ],
  segments: 32
})
```

| Option      | Default       | What it does                                    |
| ----------- | ------------- | ----------------------------------------------- |
| `points`    | required      | The profile, bottom to top; at least two points |
| `segments`  | `12`          | Divisions around the axis                       |
| `phiStart`  | `0`           | Where to start, in radians, from +z towards +x  |
| `phiLength` | `Math.PI * 2` | How far to sweep                                |

A point at `r = 0` closes the shape on the axis. A profile that doesn't end on the axis leaves an opening, like the bottle's neck, so draw it two-sided if you can see in. A `phiLength` under a full turn leaves a slice out, open along both cut edges.

v runs along the profile by distance, so a texture doesn't stretch where the points are unevenly spaced, and u runs around the axis.

### Hard edges

The lathe's normals are smooth all along the profile, even at its corners, so the bottle's shoulder looks rounded however sharp the points make it. For hard edges, make a flat-shaded copy:

```js
const faceted = bottle.toNonIndexed()
faceted.computeVertexNormals()
```

That makes every face flat, the curved parts included. To keep some corners round and others sharp, repeat a point in the profile at each hard corner, or build the profile in parts.

### Lathe.build

`Lathe.build(points, segments, phiStart, phiLength, profileNormals)` makes the arrays without making a geometry: `position`, `normal`, `uv` and `index`. `profileNormals`, one `[r, y]` per point, replaces the normals worked out from the profile, for shapes whose exact normals you know. `Capsule` is built this way.

```js
const { position, normal, uv, index } = Lathe.build(points, 32, 0, Math.PI * 2)
```

## See also

- [Paths and curves](/geometry/paths-and-curves)
- [CSG](/geometry/csg), to cut and combine these shapes
- The [paths demo](https://wethegit.github.io/wtc-gl/demos/paths/), with a tube and an extruded outline you can reshape
- API: [Tube](/api/wtc-gl/classes/Tube), [TubeOptions](/api/wtc-gl/interfaces/TubeOptions), [Extrude](/api/wtc-gl/classes/Extrude), [ExtrudeOptions](/api/wtc-gl/interfaces/ExtrudeOptions), [Lathe](/api/wtc-gl/classes/Lathe), [LatheOptions](/api/wtc-gl/interfaces/LatheOptions)
