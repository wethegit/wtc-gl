# Polyline

Draw lines with real width, which can taper, dash, draw themselves on and follow a moving point. {.lead}

WebGL's own `gl.LINES` are one pixel wide on most systems. A `Polyline` is a line built from triangles instead: each point is doubled, one vertex either side of the line, and the vertex shader pushes the pair apart. By default the line is a billboard, extruded in screen space so it always faces the camera, with its width in CSS pixels.

<Example src="polyline" :height="360" demo="lines" />

<<< @/examples/polyline.js

## Points

`points` is the only required option: a list of at least two points, as `[x, y, z]`, `[x, y]` or vectors, or a [Path or Curve](/geometry/paths-and-curves) to sample.

```js
import { Polyline, Curve } from 'wtc-gl'

const zigzag = new Polyline(gl, {
  points: [
    [-1, 0, 0],
    [-0.5, 0.5, 0],
    [0, 0, 0],
    [0.5, 0.5, 0]
  ],
  width: 4
})

const loop = new Polyline(gl, {
  points: new Curve({
    points: [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1]
    ],
    closed: true
  }),
  curveDivisions: 24,
  width: 4
})
```

A `Path` or `Curve` is sampled with its `toPolyline(curveDivisions)`, so a path's sharp corners stay sharp and each curved segment gets `curveDivisions` points (12 by default).

A `Polyline` is a `Mesh`, so you place it in the scene graph and move it like any other. Drawn without a camera, its points are in clip space, from -1 to 1 across the canvas.

## Width

`width` is in CSS pixels for a billboard, so a line stays the same weight however far away it is. The pixels follow the renderer's `dpr`, and work in a render target too.

With `sizeAttenuation: true`, `width` is in world units instead, so the line gets thinner with distance like the rest of the scene:

```js
const rail = new Polyline(gl, { points, width: 0.05, sizeAttenuation: true })
```

`width` and `sizeAttenuation` are uniforms, so changing them later costs nothing.

## Tapers

`taper` multiplies the width along the line. It's a function of `u`, from 0 at the start to 1 at the end by distance, and `i`, the point's index:

```js
// Swelling in the middle
const swell = new Polyline(gl, {
  points,
  width: 12,
  taper: (u) => Math.sin(u * Math.PI)
})

// Thinning to nothing at the start, for a trail
swell.taper = (u) => u * u
```

The taper is worked out for each point when the line is built, so setting `taper` rebuilds the attributes.

## Dashes

Dashes are measured along the distance the line travels, in world units, so they keep their length however the line bends:

- `dashArray` is the length of a dash and its gap together. 0, the default, is a solid line.
- `dashRatio` is the fraction of that length that's gap, 0.5 by default.
- `dashOffset` moves the dashes along the line. Change it each frame to make them flow.

```js
const dashed = new Polyline(gl, {
  points,
  width: 6,
  dashArray: 0.4,
  dashRatio: 0.3
})

// In the render loop
dashed.dashOffset = -time * 0.5
```

## Colour and texture

- `colour` is `[r, g, b]` from 0 to 1, white by default, and `opacity` from 0 to 1.
- `map` is a [texture](/core/textures) drawn along the line: u runs along it and v across it. `repeat` sets how many times it repeats along the line, or `[along, across]`.
- `alphaTest` discards fragments whose alpha is below it, for cut-out shapes from a map.
- `visibility` draws only the start of the line, from 0 to 1 of its length. Animate it to draw a line on.

All of them are uniforms, with setters on the line, so they're free to animate. The line blends (`transparent`) when `opacity` is below 1 or there's a `map`, unless you say otherwise.

## Closed loops and corners

`closed: true` joins the last point back to the first. It defaults to the path's own `closed`, or false for a list of points. A repeated first point at the end is dropped, since a closed line joins up by itself.

Corners are mitred: the edges carry on until they meet, so the line keeps its width through the turn. A very sharp corner would reach a long way, so `miterLimit` caps how far it reaches, in half widths (4 by default). Past the limit the corner is held at that length, so a hairpin turn narrows rather than spiking out.

## Changing the points

`setPoints(points)` replaces the points. When the count is the same it reuses the buffers, so it's cheap enough to call every frame.

`push(point)` adds a point to the end and drops the first, keeping the count the same. Push the head's position each frame and you have a trail:

```js
const trail = new Polyline(gl, {
  // Start collapsed on the head, rather than streaking from the origin
  points: Array.from({ length: 48 }, () => [head.x, head.y, head.z]),
  width: 16,
  taper: (u) => u * u
})

// Each frame
trail.push([head.x, head.y, head.z])
```

`count` is the number of points, not counting the join of a closed line.

## Ribbons

With `billboard: false` the line is a flat ribbon in world space instead, `width` world units wide. It doesn't turn to face the camera, so it can lie flat, twist and bank like a strip of paper. This can't be changed after the line is made.

- `facing` is the direction the ribbon's face starts out pointing. By default it's the normal of the plane the points lie in, so a flat shape lies flat.
- `tilt` rolls the ribbon about the line, in radians: a number, or a function of `u`. It defaults to the path's own tilt, or 0.
- `bank` rolls it into turns, in proportion to how tightly the line curves, like a car on a banked track. 0, the default, keeps it level.

```js
const ribbon = new Polyline(gl, {
  points,
  billboard: false,
  width: 0.2,
  facing: [0, 0, 1],
  // One full twist along its length
  tilt: (u) => u * Math.PI * 2,
  bank: 0.6
})
```

The face follows rotation-minimising frames, so it doesn't spin unexpectedly as the line winds. Each setter rebuilds the attributes. The ribbon is drawn from both sides, with flat colour; its face normal reaches the fragment shader as `v_normal`, for a custom fragment shader that lights it.

## Custom shaders

`vertex` and `fragment` replace the line's shaders. They're used as they are, so each needs its own `#version 300 es` line. `uniforms` adds to the line's own, and one with the same key replaces it. `attributes` adds geometry attributes, such as instanced ones to draw many lines at once.

The line gives a custom vertex shader these attributes:

| Attribute      | Type    | What it is                                        |
| -------------- | ------- | ------------------------------------------------- |
| `position`     | `vec3`  | The point                                         |
| `prev`, `next` | `vec3`  | Its neighbours; an end repeats its own point      |
| `side`         | `float` | 1 or -1, which edge of the line this vertex is on |
| `width`        | `float` | The taper at this point                           |
| `lineDistance` | `float` | The distance along the line, in world units       |
| `lineU`        | `float` | The same, from 0 to 1                             |
| `across`       | `vec3`  | Ribbons only: the width direction, mitred         |
| `normal`       | `vec3`  | Ribbons only: the face normal                     |

[`polylineExtrude`](/api/wtc-gl/variables/polylineExtrude) is the billboard extrusion as GLSL, so a custom vertex shader can move the points and still extrude them the same way. It returns the clip-space position:

```js
import { Polyline, Uniform, polylineExtrude } from 'wtc-gl'

const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec3 prev;
in vec3 next;
in float side;
in float width;
in float lineDistance;
in float lineU;

uniform mat4 u_projectionMatrix;
uniform mat4 u_modelViewMatrix;
uniform vec2 u_resolution;
uniform float u_width;
uniform float u_time;

// What the default fragment shader reads
out float v_distance;
out float v_u;
out float v_side;

${polylineExtrude}

vec3 wave(vec3 p) {
  return p + vec3(0.0, sin(p.x * 3.0 + u_time) * 0.2, 0.0);
}

void main() {
  v_distance = lineDistance;
  v_u = lineU;
  v_side = side;
  gl_Position = polylineExtrude(
    u_projectionMatrix, u_modelViewMatrix,
    wave(position), wave(prev), wave(next),
    side, width * u_width, u_resolution,
    false, 4.0 // sizeAttenuation, miterLimit
  );
}`

const time = new Uniform({ name: 'time', value: 0, kind: 'float' })
const wavy = new Polyline(gl, {
  points,
  width: 6,
  vertex,
  uniforms: { u_time: time }
})
```

The [polyline trails demo](https://wethegit.github.io/wtc-gl/demos/polyline-trails/) goes further: one `Polyline` instanced once per particle, with a vertex shader that reads each trail's points from a texture.

## Limits

- Joins are mitred and the ends are square. There are no round joins or caps.
- Overlaps within one transparent line don't blend as you'd hope. With depth writes on (the default), a part drawn later is hidden where an earlier part is in front or level with it; with `depthWrite: false`, the overlap blends twice and shows darker. For cut-outs, keep `opacity` at 1 and use `alphaTest`.
- A billboard line's width in pixels can't be measured in world space, so its culling bounds only cover its points. A wide line whose points are all a little off screen can be culled while its edge would still show; set `frustumCulled: false` if that matters.

## See also

- [Paths and curves](/geometry/paths-and-curves), to describe the shape of a line.
- [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe), for solid lines with depth.
- The [lines demo](https://wethegit.github.io/wtc-gl/demos/lines/), with every option on a panel.
- API: [Polyline](/api/wtc-gl/classes/Polyline), [PolylineOptions](/api/wtc-gl/interfaces/PolylineOptions), [polylineExtrude](/api/wtc-gl/variables/polylineExtrude).
