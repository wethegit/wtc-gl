# CSG

Cut, combine and intersect solids with constructive solid geometry, using the manifold-3d library. {.lead}

Constructive solid geometry builds shapes from booleans: a box with a sphere subtracted from it, two cylinders added together, the overlap of two shapes. wtc-gl doesn't do the booleans itself. [manifold-3d](https://github.com/elalish/manifold), a fast and robust geometry library compiled to WebAssembly, does, and two functions move geometry across: `toManifold` turns a `Geometry` into a manifold, and `fromManifold` turns the result back.

<Example src="csg" :height="360" demo="csg" />

<<< @/examples/csg.js

## Installing and loading manifold-3d

wtc-gl doesn't depend on manifold-3d, so it costs nothing unless you use it. Install it alongside:

::: code-group

```sh [npm]
npm install manifold-3d
```

```sh [pnpm]
pnpm add manifold-3d
```

```sh [yarn]
yarn add manifold-3d
```

:::

The package is a JavaScript loader and a `.wasm` file. Load it once, call `setup()`, and pass the loaded module to `toManifold`. With [Vite](https://vite.dev), import the `.wasm` file's URL so it's copied into the build, and tell the loader where it is:

```js
import Module from 'manifold-3d'
import wasmUrl from 'manifold-3d/manifold.wasm?url'

const wasm = await Module({ locateFile: () => wasmUrl })
wasm.setup()
```

Loading is asynchronous, so start it early and draw something else, or nothing, until it's ready, as the example does. Other bundlers have their own ways to give a `.wasm` file a URL; `locateFile` is how manifold-3d asks for it.

## Booleans

`toManifold(wasm, geometry)` returns a manifold-3d `Manifold`, and from then on it's manifold-3d's own API. Every operation returns a new manifold:

```js
import { Box, Sphere, Mesh, toManifold, fromManifold } from 'wtc-gl'

const box = toManifold(wasm, new Box(gl))
const ball = toManifold(
  wasm,
  new Sphere(gl, { radius: 0.65, widthSegments: 48 })
)

const carved = box.subtract(ball) // the box with the sphere taken out
const overlap = box.intersect(ball) // only where they overlap
const both = box.add(ball) // the two together

const mesh = new Mesh(gl, { geometry: fromManifold(gl, carved), program })
```

To combine many at once, use the static forms on `wasm.Manifold`: `Manifold.union([a, b, c])`, `Manifold.difference([a, b, c])` (the first minus the rest) and `Manifold.intersection([a, b, c])`.

`fromManifold(gl, manifold)` makes a new indexed `Geometry` from the result. Where a cut leaves a hard edge, its vertices are split, so the edge stays sharp.

## Closed solids only

A manifold has to be a closed solid: a surface with no holes, where every edge is shared by exactly two triangles. `Box`, `Sphere`, `Cylinder` (with its caps), `Torus`, `Capsule` and `Extrude` all qualify, and so does a closed `Lathe` that starts and ends on the axis. A `Plane`, an open-ended `Cylinder` or a `Tube` with open ends doesn't.

Seams in uvs and normals don't matter, nor does an unindexed geometry: `toManifold` welds vertices at the same position first. For anything else, it throws:

```
Error: The geometry isn't a closed solid (…)
```

The reason in brackets is manifold-3d's. Check the geometry has no gaps, and no triangles left over or doubled up.

## Moving the pieces

A mesh's position, rotation and scale aren't part of its geometry, so they don't carry into a manifold. Move manifolds with their own transforms, which are cheap: they're stored and applied when the next boolean needs them.

```js
const moved = ball.translate([0.5, 0, 0])
const turned = ball.rotate([0, 45, 0]) // degrees about x, y and z
const bigger = ball.scale(1.5)
const placed = ball.transform(matrix.array) // a Mat4, as 16 numbers
```

`transform` takes a column-major 4×4 matrix, which is how a wtc-gl `Mat4` stores its numbers. Normals follow the transforms: `fromManifold` rotates them to match and flips them on faces a subtraction turned inside out.

## Carrying attributes through

Besides the position, a manifold carries the attributes named in `properties`, interpolated across any new faces. Each face keeps the attributes of the shape it came from. The default is `{ normal: 3, uv: 2 }`: names, and the number of components each.

Give `toManifold`, for every geometry you combine, and `fromManifold` the same `properties`. If they don't match, `fromManifold` warns, and the attributes it reads back are wrong.

```js
const properties = { normal: 3, colour: 3 }

const a = toManifold(wasm, geometryA, { properties })
const b = toManifold(wasm, geometryB, { properties })
const result = fromManifold(gl, a.subtract(b), { properties })
```

### Colouring the cut

`fill` gives values for attributes a geometry doesn't have. None of the primitives has a `colour`, so filling it gives each shape a colour of its own, and the faces a cutter leaves behind take the cutter's. Draw the result with `vertexColours: true` on `LitProgram`, which reads the `colour` attribute:

```js
const properties = { normal: 3, colour: 3 }

const base = toManifold(wasm, new Box(gl), {
  properties,
  fill: { colour: [0.93, 0.91, 0.87] }
})
const cutter = toManifold(wasm, new Sphere(gl, { radius: 0.65 }), {
  properties,
  fill: { colour: [0.95, 0.42, 0.26] }
})

const geometry = fromManifold(gl, base.subtract(cutter), { properties })
const program = new LitProgram(gl, { lights, vertexColours: true })
```

Without a fill, a missing attribute is 0s, or 1s for `colour`, so white.

### Missing normals

When `normal` is listed but a geometry has none, manifold-3d works them out. Edges sharper than `sharpAngle` degrees (60 by default) stay hard; gentler ones are smoothed.

```js
const m = toManifold(wasm, geometry, { sharpAngle: 30 })
```

## Freeing memory

A manifold lives in WebAssembly memory, which JavaScript's garbage collector can't see. Call `delete()` on every manifold when you're done with it, including the ones operations return along the way. `fromManifold` copies what it needs, so the manifold can be deleted straight after:

```js
const moved = cutter.translate([x, 0, 0])
const result = base.subtract(moved)
mesh.geometry.remove()
mesh.geometry = fromManifold(gl, result, { properties })
moved.delete()
result.delete()
```

Convert a geometry once and keep its manifold, rather than calling `toManifold` every frame; then the wtc-gl geometry can be removed. Booleans are fast enough for an animated cut at modest triangle counts, as in the example, which redoes the subtraction every frame.

## See also

- The [csg demo](https://wethegit.github.io/wtc-gl/demos/csg/), with several bases, cutters and operations
- [manifold-3d's documentation](https://manifoldcad.org/docs/jsapi/), for the rest of its API
- [Primitives](/geometry/primitives) and [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe), for shapes to start from
- API: [toManifold](/api/wtc-gl/functions/toManifold), [fromManifold](/api/wtc-gl/functions/fromManifold), [ToManifoldOptions](/api/wtc-gl/interfaces/ToManifoldOptions), [ManifoldOptions](/api/wtc-gl/interfaces/ManifoldOptions)
