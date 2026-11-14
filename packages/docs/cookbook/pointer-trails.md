# Pointer trails

Draw a line that follows the pointer, thins out behind it, and shrinks away when the pointer leaves. {.lead}

A [`Polyline`](/lines/polyline) keeps a fixed number of points. `push(point)` adds one at the end and drops the first, so pushing the pointer's position every frame gives a line whose newest point is the pointer and whose oldest is where it was a moment ago. A taper thins it towards the old end, and resetting all its points to one place makes it start afresh.

Move the pointer over the example. Without it, the line wanders on its own.

<Example src="cookbook-trail" :height="360" demo="polyline-trails" />

<<< @/examples/cookbook-trail.js

## A line in clip space

Drawn without a camera, a polyline's points are in clip space: -1 to 1 across the canvas, with y up. That's the same as the pointer's normalised position, so the pointer goes straight in:

```js
const rect = canvas.getBoundingClientRect()
const p = [
  ((e.clientX - rect.left) / rect.width) * 2 - 1,
  1 - ((e.clientY - rect.top) / rect.height) * 2
]
```

```js
renderer.render({ scene }) // no camera
```

The width is still in CSS pixels, and the line doesn't stretch with the canvas's shape. For a trail in a 3D scene, find a point in the world instead, with a [Raycast](/interaction/raycast) onto a plane, and render with the camera as usual.

## Starting collapsed

Make the line with every point in the same place. A line whose points all sit together has no length, so it draws nothing until they spread out, rather than streaking in from the origin:

```js
import { Polyline } from 'wtc-gl'

const COUNT = 40
const collapsed = (p) => Array.from({ length: COUNT }, () => p)

const trail = new Polyline(gl, {
  points: collapsed([0, 0]),
  width: 14,
  taper: (u) => u * u,
  colour: [0.95, 0.42, 0.26]
})
```

`taper` runs from 0 at the first, oldest point to 1 at the newest, so `u * u` keeps the full width at the pointer and narrows to nothing at the tail.

## Pushing every frame

Push in the frame loop rather than in the pointer handler:

```js
frame() {
  trail.push(pointer)
  renderer.render({ scene })
}
```

Pointer events arrive at their own rate, often several a frame and none while the pointer is still. Pushing once a frame gives a trail whose length is a length of time: 40 frames, two thirds of a second at 60 frames a second. When the pointer stops, the same point is pushed again and again, and the trail draws itself in until only the head is left. `push` reuses the line's buffers, so it's cheap enough for every frame.

The length in time does depend on the frame rate: on a 120 Hz screen, 40 points last a third of a second. If that matters, push only when enough time has passed, or scale the count by the frame rate when making the line.

## Resetting

When the pointer leaves and comes back somewhere else, the next push would draw a straight line from the old spot to the new one. Collapse the line onto the new point first:

```js
const reset = (p) => trail.setPoints(collapsed(p))

const onMove = (e) => {
  const p = toClip(e)
  if (!pointer) reset(p) // arriving
  pointer = p
}
const onLeave = () => (pointer = null)
```

`setPoints` with the same number of points reuses the buffers too.

When the pointer leaves, the example keeps pushing the last point for as many frames as the line has points, so the trail shrinks into where the pointer left rather than vanishing. Then it resets onto its wandering path. Set `visible = false` on the line instead, if it should stop at once.

## Fading and glowing

A polyline has one colour, so a trail fades by thinning, through the taper. For a glow, draw a second, wider line under the first, with a low `opacity`, and push to both:

```js
const glow = new Polyline(gl, {
  points: collapsed([0, 0]),
  width: 40,
  taper: (u) => u,
  colour: [0.95, 0.6, 0.3],
  opacity: 0.2,
  depthWrite: false
})
```

`opacity` below 1 turns on blending. `depthWrite: false` lets the line blend where it crosses itself, where otherwise the later part would be hidden behind the earlier one. Opaque lines don't need it.

To fade along the line's length instead, use a `map`: a texture that runs from transparent to opaque, drawn along the line. Or write a fragment shader that reads `v_u`, the position along the line from 0 to 1; the [Polyline guide](/lines/polyline#custom-shaders) lists what it can use.

## Listeners

Listen on the canvas, not the window, so the trail only follows the pointer over it, and `pointerleave` tells you when it goes. Remove the listeners when you're done:

```js
canvas.removeEventListener('pointermove', onMove)
canvas.removeEventListener('pointerleave', onLeave)
```

On touch screens, the pointer only moves while a finger is down, and dragging scrolls the page and cancels it. Set `touch-action: none` on the canvas if the trail should follow a finger.

## See also

- [Polyline](/lines/polyline), for every option, including dashes and ribbons
- [Pointer, time and resolution](/cookbook/pointer-uniforms), for the pointer in device pixels and smoothing
- The [polyline trails demo](https://wethegit.github.io/wtc-gl/demos/polyline-trails/), with thousands of trails drawn by one instanced line
- API: [Polyline](/api/wtc-gl/classes/Polyline), [PolylineOptions](/api/wtc-gl/interfaces/PolylineOptions)
