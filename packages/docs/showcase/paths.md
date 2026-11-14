# Paths walkthrough

How the paths demo sweeps a tube along a curve through draggable points, shows how the curve is sampled and framed, and extrudes an outline into a solid. {.lead}

![A translucent trefoil-knot tube with small red, green and blue axes along its centre line](/screenshots/paths.jpg){.showcase-shot}

[Open the demo →](https://wethegit.github.io/wtc-gl/demos/paths/) · [Source on GitHub](https://github.com/wethegit/wtc-gl/tree/master/packages/site/demos/paths) {.showcase-links}

The demo draws a translucent tube along a [`Curve`](/geometry/paths-and-curves) through a handful of white handles. Drag a handle and the curve, the tube and the markers along it are rebuilt to follow. Presets switch between an open wave, a closed trefoil knot, a hairpin that shows why the default Catmull-Rom is centripetal, and an outline with a hole that becomes an [`Extrude`](/geometry/tube-extrude-lathe). The code is in `paths/index.js`, with the tube's shaders in `tube.vert` and `tube.frag`, and the markers' in `marker.vert` and `marker.frag`.

## The points and the curve

Each preset is a list of points and a few settings. The trefoil is computed, twelve points around the knot's equation; the others are written out. Loading a preset copies its points into one array, which the handles and the drag code share. The extrude preset appends its hole's points after the outline's and remembers where the hole starts.

Everything is rebuilt from those points with one function:

```js
const makeCurve = (from, closed) =>
  new Curve({
    points: from,
    type: params.type,
    closed,
    alpha: params.alpha,
    tension: params.tension
  })
```

`type` is `'catmullrom'`, which passes through every point, or `'bspline'`, which is smoother but only passes near them. For the Catmull-Rom, `alpha` sets how the spacing of the points shapes the curve: 0 is uniform, 0.5 centripetal and 1 chordal. The hairpin preset has a short span between two long ones, and with `alpha` at 0 the curve overshoots and loops past it; at 0.5 it doesn't. `tension` pulls the curve towards straight lines between the points. [Curve](/geometry/paths-and-curves#curve) goes through the types in detail.

A curve is cheap to make, so the demo makes a new one on every change rather than editing the old one.

## Sweeping the tube

The tube is a [`Tube`](/api/wtc-gl/classes/Tube) along the curve. Its radius can be a number or a function of `u`, the fraction of the way along, which is how the taper works:

```js
curve.tiltFunction = params.twist
  ? (tilt, u) => tilt + u * params.twist * TAU
  : null

const tube = new Tube(gl, {
  path: curve,
  radius: taper ? (u) => radius * (1 - taper * u) : radius,
  tubularSegments: params.tubularSegments,
  radialSegments: params.radialSegments
})
```

The rings are oriented by the curve's rotation-minimising frames, which turn only as much as the curve does. `tiltFunction` adds a twist on top: here, a whole number of turns spread evenly along the length. The tube's shader draws four stripes around it so the twist shows. See [Tube](/geometry/tube-extrude-lathe#tube) and [Tilt](/geometry/paths-and-curves#tilt).

A geometry is fixed once built, so a change means a new one. The demo swaps it onto the existing mesh and frees the old one's buffers:

```js
if (geometry) {
  mesh.geometry.remove()
  mesh.geometry = geometry
}
```

[Cleaning up](/core/cleaning-up) explains what `remove` frees.

## Lit with your own shader

The tube isn't a `LitProgram`: it needs stripes, a rim and a uv checker, and it's see-through. It's a [`Program`](/core/programs-and-shaders) whose fragment shader includes wtc-gl's lighting as GLSL, so it's lit by the same [`Lights`](/lighting/lights) a `LitProgram` would be:

```js
const tubeFragment = `#version 300 es\nprecision highp float;\n${litShading}\n${tubeFrag}`

const tubeProgram = new Program(gl, {
  vertex: tubeVert,
  fragment: tubeFragment,
  uniforms: {
    ...lights.uniforms,
    u_colour,
    u_opacity,
    u_stripes: new Uniform({ name: 'stripes', value: 1, kind: 'float' }),
    u_checker: new Uniform({ name: 'checker', value: 0, kind: 'float' })
  },
  transparent: true,
  depthWrite: false
})
```

`litShading` declares the light uniforms and `litShade`, which the shader calls with a view-space normal and view direction (from `tube.frag`):

```glsl
vec3 shade(vec3 base, vec3 n) {
  vec3 view = normalize(-v_position);
  float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
  return litShade(base, n, view, mat3(u_viewMatrix), 0.0, 1.0) + rim * 0.1;
}
```

`transparent: true` blends the tube and draws it after the opaque meshes, and `depthWrite: false` stops one part of it hiding another where it passes behind itself, as on the trefoil. The extruded solid reuses the same shaders in a second, opaque program with the stripes off. [Lighting in your own shaders](/lighting/lights#lighting-in-your-own-shaders) covers `litShading`.

## Markers and frames

The small dark spheres show where the curve is sampled. With **even** spacing they come from `curve.getPoints(count)`, which spaces points by distance along the curve. With **parametric** spacing, the demo steps `t` evenly through each span instead, and the samples bunch up wherever a span is short or bends:

```js
spans.forEach((segment, i) => {
  for (let k = i ? 1 : 0; k <= per; k++) {
    out.push(segment.getPoint(k / per, new Vec3()))
  }
})
```

The **frames** toggle draws the frames at each sample, from `computeFrames`: the tangent in red, the normal in green and the binormal in blue. On the closed trefoil, the twist left over after one lap is spread around the loop, so the last frame matches the first.

There can be hundreds of markers and arrows, and they're all rebuilt on every drag. Rather than a mesh each, they're built as geometry, each moved into place with `applyMatrix` and given a constant `color` attribute, then merged into one geometry and drawn as one mesh:

```js
const merge = (parts) => {
  if (!parts.length) return null
  const merged = mergeGeometries(parts)
  for (const part of parts) part.remove()
  return merged
}
```

An arrow is a thin [`Box`](/api/wtc-gl/classes/Box) moved so it starts at the origin, then put through a matrix whose axes are the frame's three vectors. See [mergeGeometries](/api/wtc-gl/functions/mergeGeometries) and [Geometry and attributes](/geometry/geometry-and-attributes).

## The extrude preset

When the points include a hole, the demo builds two closed curves and extrudes them instead of drawing the tube:

```js
curve = makeCurve(points.slice(0, holeStart), true)
const hole = makeCurve(points.slice(holeStart), true)

const solid = new Extrude(gl, {
  shape: curve,
  holes: [hole],
  depth: params.depth,
  curveDivisions: params.curveDivisions,
  bevel: params.bevel,
  // bevelSize, bevelThickness, bevelSegments
  creaseAngle: (params.creaseAngle * Math.PI) / 180,
  uvs: params.uvs
})
```

With `tension` at 0 the outline is a smooth Catmull-Rom through the star's ten points; at 1 it's straight lines with sharp points. `creaseAngle` decides which turns get a hard edge: the sharp points turn by more than the default 30°, so they're creased, while a sampled curve stays smooth. The uv checker shows how `uvs: 'projected'` carries the face's mapping over the bevel. [Extrude](/geometry/tube-extrude-lathe#extrude) has the options.

## Dragging the handles

The handles are meshes in a second scene, drawn after the first with a program that has `depthTest: false`, so they're always on top and can always be grabbed. They're picked with a [`Raycast`](/interaction/raycast) against their bounds, padded so a near miss still counts:

```js
const handleUnder = (clientX, clientY) => {
  castPointer(clientX, clientY)
  const visible = handles.slice(0, points.length)
  const [hit] = raycast.intersectBounds(visible, { padding: GRAB_PADDING })
  return hit ? handles.indexOf(hit.mesh) : -1
}
```

A grab picks a plane to drag in: the plane through the handle facing the camera, or z = 0 for the extrude outline, so it stays flat. The plane's normal is the camera's backward axis, the z axis of its world matrix (`a31`, `a32`, `a33`). Each move casts onto that plane and keeps the offset from the grab, so the handle doesn't jump to the pointer:

```js
castPointer(e.clientX, e.clientY)
const hit = raycast.intersectPlane(dragNormal, dragPoint, planeHit)
if (!hit) return
const p = points[dragging]
p[0] = hit.x - grabOffset.x
p[1] = hit.y - grabOffset.y
if (!extruding()) p[2] = hit.z - grabOffset.z
dirty = true
```

The `pointerdown` listener is on `window` in the capture phase, so it runs before the [`DollyCamera`](/core/cameras) sees the press and can turn the camera off with `camera.enabled = false` for the drag. [Pick and drag](/cookbook/pick-and-drag) shows the pattern on its own.

## The loop

Pointer events can arrive several times a frame, so a move only sets `dirty`. The loop rebuilds at most once a frame, then draws the scene and, without clearing, the handles over it:

```js
if (dirty) {
  dirty = false
  rebuild()
  pane.refresh()
}

camera.update()
renderer.render({ scene, camera })
renderer.render({ scene: handleScene, camera, clear: false })
```

## See also

- [Paths and curves](/geometry/paths-and-curves), for `Path`, `Curve`, sampling and frames
- [Tube, Extrude and Lathe](/geometry/tube-extrude-lathe), for the geometry built from them
- [Raycast](/interaction/raycast), for bounds, planes and padding
- API: [`Curve`](/api/wtc-gl/classes/Curve), [`Path`](/api/wtc-gl/classes/Path), [`Tube`](/api/wtc-gl/classes/Tube), [`Extrude`](/api/wtc-gl/classes/Extrude), [`litShading`](/api/wtc-gl/variables/litShading), [`Raycast`](/api/wtc-gl/classes/Raycast)
