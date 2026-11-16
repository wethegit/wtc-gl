# Carve a model with CSG

Cut windows through a wall with manifold-3d, colour the cut faces, and free the WebAssembly memory once the mesh is made. {.lead}

A boolean subtraction takes one solid away from another. To cut holes, make a cutter for each hole, combine them into one solid, and subtract it from the base once. wtc-gl hands the geometry to [manifold-3d](https://github.com/elalish/manifold) with `toManifold`, and brings the result back as a `Geometry` with `fromManifold`. The [CSG guide](/geometry/csg) covers installing and loading manifold-3d; this page is about making a cut that looks right and doesn't leak.

Here a wall gets three arched windows and a round porthole, cut once when manifold-3d has loaded. The window reveals, the faces the cut leaves behind, take the cutters' orange.

<Example src="cookbook-csg" :height="360" demo="csg" />

<<< @/examples/cookbook-csg.js

## Making the solids

Start from primitives. Every geometry you give `toManifold` has to be a closed solid, which `Box` and `Cylinder` (with its caps) are, and `Plane` isn't. Once a geometry is a manifold, the wtc-gl geometry isn't needed, so remove it:

```js
import { Box, Cylinder, toManifold } from 'wtc-gl'

const properties = { normal: 3, colour: 3 }

const make = (geometry, colour) => {
  const manifold = toManifold(wasm, geometry, { properties, fill: { colour } })
  geometry.remove()
  return manifold
}

const slab = make(new Box(gl, { width: 4, height: 2.4, depth: 0.3 }), cream)
const pane = make(new Box(gl, { width: 0.6, height: 0.8, depth: 1 }), orange)
const round = make(
  new Cylinder(gl, { radiusTop: 0.3, radiusBottom: 0.3 }),
  orange
)
```

Make the cutters deeper than the wall, here 1 against 0.3. A cutter whose faces line up exactly with the wall's leaves a paper-thin skin, or none, depending on rounding.

## Placing the cutters

Move manifolds with their own transforms. Rotations are in degrees about x, y and z, and each call returns a new manifold, leaving the original as it was, so one shape can be placed many times:

```js
// A cylinder stands on its end; turn it to face through the wall
const disc = round.rotate([90, 0, 0])

// An arch is a pane with a disc on top
const cutters = [-1.2, 0, 1.2].flatMap((x) => [
  pane.translate([x, -0.35, 0]),
  disc.translate([x, 0.05, 0])
])
```

A mesh's `position`, `rotation` and `scale` aren't part of its geometry, so they don't carry into a manifold. Place the solids with these transforms, then place the finished mesh in the scene as usual.

## Cutting once

Union the cutters, then subtract the lot:

```js
import { Mesh, LitProgram, fromManifold } from 'wtc-gl'

const holes = wasm.Manifold.union(cutters)
const carved = slab.subtract(holes)

const wall = new Mesh(gl, {
  geometry: fromManifold(gl, carved, { properties }),
  program: new LitProgram(gl, { lights, vertexColours: true })
})
```

`Manifold.difference([slab, ...cutters])`, the first minus the rest, does the same in one call. Either way there's one result to convert and one to free, rather than a chain of half-cut walls.

## Colouring the cut

Every shape was given a `colour` with `fill`, and `properties` lists `colour`, so manifold-3d carries it through the cut. Each face keeps the colour of the shape it came from: the wall's faces are cream, and the faces the cutters leave behind are the cutters' orange. `vertexColours: true` on `LitProgram` draws them. Give `toManifold` and `fromManifold` the same `properties` every time, or the attributes come back wrong.

Fill the cutters with the wall's own colour for a plain cut. Normals come through too, and the cut edges stay sharp, since `fromManifold` splits the vertices along them.

## Freeing the memory

Every manifold lives in WebAssembly memory, which the garbage collector can't see, so call `delete()` on each one when you're done: the starting shapes, every transformed copy, the union and the result. `fromManifold` copies what it needs, so they can all go straight after it:

```js
for (const m of [slab, pane, round, disc, ...cutters, holes, carved]) {
  m.delete()
}
```

Intermediate results are hard to keep track of, such as the scaled disc in `disc.scale(0.6).translate(…)`, which is never stored. Keep each one in a variable, or a list, as the example does, so it can be deleted.

## Once, or every frame

A cut that doesn't change belongs at load time: do it once, keep the geometry, and free the manifolds. The wall then costs no more to draw than any other mesh, and it can still move, turn and scale in the scene for free.

A cut that animates has to be redone each time it changes, as in the [CSG guide's example](/geometry/csg), where a sphere moves through a box. Keep the manifolds you start from, rather than calling `toManifold` every frame, and free only what each frame makes:

```js
const moved = cutter.translate([x, 0, 0])
const result = base.subtract(moved)
mesh.geometry.remove()
mesh.geometry = fromManifold(gl, result, { properties })
moved.delete()
result.delete()
```

That works at modest triangle counts. For large models, or a cut driven by the pointer, redo it only when the pointer moves, or no more than a few times a second.

## Pitfalls

- `toManifold` throws `The geometry isn't a closed solid` for open shapes such as a `Plane`, or an open-ended `Cylinder`. Use closed ones.
- Smooth shapes need enough segments: the cut follows the triangles, so a 12-sided cylinder cuts a 12-sided hole.
- manifold-3d loads asynchronously. Draw something else, or nothing, until it's ready, and check you haven't been disposed of in the meantime.

## See also

- [CSG](/geometry/csg), for loading manifold-3d and the rest of the options
- [Primitives](/geometry/primitives) and [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe), for shapes to cut with
- The [csg demo](https://wethegit.github.io/wtc-gl/demos/csg/), with several bases, cutters and operations
- API: [toManifold](/api/wtc-gl/functions/toManifold), [fromManifold](/api/wtc-gl/functions/fromManifold), [ToManifoldOptions](/api/wtc-gl/interfaces/ToManifoldOptions)
