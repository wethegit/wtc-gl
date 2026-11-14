# Primitives

Ready-made geometries for the common shapes: boxes, spheres, cylinders and cones, tori, capsules, lathed profiles, planes, a full-screen triangle and point clouds. {.lead}

Each primitive is a [`Geometry`](/geometry/geometry-and-attributes) whose constructor fills in the attributes. Pass the rendering context and an options object; every option has a default, so `new Box(gl)` is a unit cube centred on the origin.

<Example src="primitives" :height="400" demo="primitives" />

<<< @/examples/primitives.js

## What each one provides

These shapes have the same four attributes, so any of them works with `LitProgram`, a texture `map` or your own shader:

| Attribute  | Type   | What it is                               |
| ---------- | ------ | ---------------------------------------- |
| `position` | `vec3` | The vertex position                      |
| `normal`   | `vec3` | The surface normal, unit long            |
| `uv`       | `vec2` | Texture coordinates, 0 to 1              |
| `index`    |        | The triangles, `Uint32Array` when needed |

That's `Plane`, `Box`, `Sphere`, `Cylinder`, `Torus`, `Capsule` and `Lathe`, and also [`Tube` and `Extrude`](/geometry/tube-extrude-lathe), though `Extrude`'s uvs are in world units. `Triangle` has a 2D `position` and a `uv`, with no index, and `PointCloud` only has `position`.

Every primitive also takes `attributes`, extra attributes to add, such as an [instanced attribute](/geometry/geometry-and-attributes#instanced-attributes). The generated ones replace any with the same name.

## Plane

A flat rectangle in the xy plane, facing +z.

```js
import { Plane } from 'wtc-gl'

const plane = new Plane(gl, {
  width: 2,
  height: 1,
  widthSegments: 20,
  heightSegments: 10
})
```

| Option           | Default | What it does      |
| ---------------- | ------- | ----------------- |
| `width`          | `1`     | Size along x      |
| `height`         | `1`     | Size along y      |
| `widthSegments`  | `1`     | Divisions along x |
| `heightSegments` | `1`     | Divisions along y |

More segments give a vertex shader more vertices to move, for waves or cloth. A plane is one-sided: give a `LitProgram` `doubleSided: true`, or your own `Program` `cullFace: null`, to see it from behind.

## Box

A box with `width`, `height` and `depth` (each `1` by default) along x, y and z, and `widthSegments`, `heightSegments` and `depthSegments` (each `1`). Each face is a separate grid with its own uvs from 0 to 1, so the edges are hard and a texture appears once on every face.

```js
import { Box } from 'wtc-gl'

const slab = new Box(gl, { width: 2, height: 0.5, depth: 1 })
```

## Sphere

A UV sphere with its poles on the y axis.

| Option           | Default                          | What it does                                 |
| ---------------- | -------------------------------- | -------------------------------------------- |
| `radius`         | `0.5`                            | The radius                                   |
| `widthSegments`  | `16`                             | Divisions around the y axis                  |
| `heightSegments` | `Math.ceil(widthSegments * 0.5)` | Divisions from pole to pole                  |
| `phiStart`       | `0`                              | Where to start around the y axis, in radians |
| `phiLength`      | `Math.PI * 2`                    | How far to sweep around the y axis           |
| `thetaStart`     | `0`                              | Where to start down from the top pole        |
| `thetaLength`    | `Math.PI`                        | How far to sweep down                        |

Sweeping less than the whole way leaves the sphere open: a `phiLength` of `Math.PI` is half a sphere cut down the middle, and a `thetaLength` of `Math.PI / 2` a dome.

```js
import { Sphere } from 'wtc-gl'

const dome = new Sphere(gl, {
  radius: 1,
  widthSegments: 48,
  thetaLength: Math.PI / 2
})
```

## Cylinder and cone

A cylinder along the y axis.

| Option           | Default       | What it does                                   |
| ---------------- | ------------- | ---------------------------------------------- |
| `radiusTop`      | `0.5`         | Radius at the top (+y). 0 makes a cone         |
| `radiusBottom`   | `0.5`         | Radius at the bottom (-y)                      |
| `height`         | `1`           | Length along y                                 |
| `radialSegments` | `8`           | Divisions around the axis                      |
| `heightSegments` | `1`           | Divisions along the axis                       |
| `openEnded`      | `false`       | Leave out both caps                            |
| `thetaStart`     | `0`           | Where to start, in radians, from +z towards +x |
| `thetaLength`    | `Math.PI * 2` | How far to sweep                               |

Set `radiusTop: 0` for a cone. A cap with no radius is left out, so the cone has only its base.

```js
import { Cylinder } from 'wtc-gl'

const cone = new Cylinder(gl, {
  radiusTop: 0,
  radiusBottom: 0.5,
  radialSegments: 32
})
```

The default eight segments make an octagonal prism; use 32 or more for a round one.

## Torus

A ring lying in the xy plane, so it faces the camera by default.

| Option            | Default       | What it does                                     |
| ----------------- | ------------- | ------------------------------------------------ |
| `radius`          | `0.5`         | From the centre to the middle of the tube        |
| `tube`            | `0.2`         | The tube's radius                                |
| `radialSegments`  | `8`           | Divisions around the tube                        |
| `tubularSegments` | `24`          | Divisions around the ring                        |
| `arc`             | `Math.PI * 2` | How far round the ring to go, from +x towards +y |

An `arc` under a full turn leaves the ring open, with the tube's ends uncapped.

## Capsule

A cylinder with a hemisphere on each end, along the y axis.

| Option           | Default | What it does                                   |
| ---------------- | ------- | ---------------------------------------------- |
| `radius`         | `0.25`  | The radius of the cylinder and the hemispheres |
| `height`         | `1`     | The whole length, tip to tip                   |
| `capSegments`    | `4`     | Divisions in each quarter circle of the caps   |
| `radialSegments` | `8`     | Divisions around the axis                      |
| `heightSegments` | `1`     | Divisions along the straight part              |

`height` includes the caps, like a `Cylinder`'s, so a capsule fits the same space. A height under twice the radius gives a sphere.

## Lathe

A 2D profile spun around the y axis, for vases, bowls, bottles and anything else that's round. Each point is `[r, y]`, its distance from the axis and its height, or a `Vec2`. List them from bottom to top so the faces point outwards.

```js
import { Lathe } from 'wtc-gl'

const bowl = new Lathe(gl, {
  points: [
    [0, 0],
    [0.4, 0],
    [0.6, 0.3],
    [0.65, 0.6]
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

A point at `r = 0` closes the shape on the axis. [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe#lathe) has more on profiles, smooth and hard edges, and `Lathe.build`.

## Triangle

A single triangle that covers clip space, -1 to 1 on x and y, for full-screen fragment shaders. Its `position` is 2D and its `uv` runs from 0 to 1 across the screen. Draw it without a camera, and output the position as it is:

```glsl
#version 300 es
in vec2 position;
in vec2 uv;
out vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
```

One triangle rather than a two-triangle quad avoids shading the pixels along the diagonal twice. `FragmentShader` uses it; see [your first shader](/getting-started/first-shader).

## PointCloud

A set of points with only a `position` attribute, for drawing with `gl.POINTS`.

| Option         | Default        | What it does                                           |
| -------------- | -------------- | ------------------------------------------------------ |
| `particles`    | `128`          | The number of points                                   |
| `dimensions`   | `3`            | Numbers per point: the `position` attribute's size     |
| `fillFunction` | random, 0 to 1 | `(positions, dimensions) => void`, fills the positions |

```js
import { PointCloud, Mesh } from 'wtc-gl'

const cloud = new PointCloud(gl, {
  particles: 5000,
  fillFunction: (positions) => {
    for (let i = 0; i < positions.length; i++) {
      positions[i] = Math.random() * 2 - 1
    }
  }
})
const points = new Mesh(gl, { geometry: cloud, program, mode: gl.POINTS })
```

The vertex shader sets each point's size with `gl_PointSize`. For points that move every frame on the GPU, see [TransformFeedback](/simulation/transform-feedback).

## Changing a primitive

A primitive's options are read once, when it's made. To change the size or the number of segments, make a new one, swap it onto the mesh and remove the old one:

```js
const old = mesh.geometry
mesh.geometry = new Sphere(gl, { widthSegments: segments })
old.remove()
```

To bend or move the shape itself, use the [CPU tools](/geometry/geometry-and-attributes#cpu-tools), such as `applyMatrix` and `toNonIndexed`, which work on primitives like any other geometry.

## See also

- [Geometry and attributes](/geometry/geometry-and-attributes)
- [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe), for shapes from paths and outlines
- [Lights and LitProgram](/lighting/lights)
- API: [Plane](/api/wtc-gl/classes/Plane), [Box](/api/wtc-gl/classes/Box), [Sphere](/api/wtc-gl/classes/Sphere), [Cylinder](/api/wtc-gl/classes/Cylinder), [Torus](/api/wtc-gl/classes/Torus), [Capsule](/api/wtc-gl/classes/Capsule), [Lathe](/api/wtc-gl/classes/Lathe), [Triangle](/api/wtc-gl/classes/Triangle), [PointCloud](/api/wtc-gl/classes/PointCloud)
