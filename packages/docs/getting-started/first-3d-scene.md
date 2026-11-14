# Your first 3D scene

Light a few shapes, look at them through a perspective camera, and turn them every frame. {.lead}

A 3D scene has four parts. The `Renderer` owns the canvas and its WebGL2 context. A `Camera` decides what's seen and how it's projected. The scene is a tree of `Obj`s, with an empty `Obj` at its root. And each thing you can see is a `Mesh`: a geometry, which holds the shape, and a program, which holds the shaders that colour it.

<Example src="first-3d-scene" :height="360" demo="primitives" />

<<< @/examples/first-3d-scene.js

## The renderer

`new Renderer()` makes a canvas and a WebGL2 context for it, and throws if the browser has no WebGL2. Append `renderer.gl.canvas` to the page yourself. `gl` is the context, and every geometry, program and mesh takes it as its first argument.

```js
import { Renderer } from 'wtc-gl'

const renderer = new Renderer({
  antialias: true,
  clearColour: [0.95, 0.96, 0.97, 1]
})
const { gl } = renderer
document.body.appendChild(gl.canvas)
```

The canvas is cleared to `clearColour` before each render. It's `[0, 0, 0, 0]` by default, but the drawing buffer has no alpha channel unless you ask for one, so a page-coloured clear colour is the simplest choice. The example above makes a see-through canvas instead; [Renderer](/core/renderer) explains the options.

## The camera

A `Camera` is perspective unless you give it orthographic planes. `fov` is the vertical field of view in degrees, and `aspect` should match the canvas's width over its height. It sits at the origin looking down −z, so move it back to see what's in front of it:

```js
import { Camera } from 'wtc-gl'

const camera = new Camera({ fov: 35 })
camera.position.z = 6
```

To point it somewhere else, set its `position` and call `camera.lookAt(target)` with a `Vec3`. [Cameras](/core/cameras) covers the rest.

## Meshes and light

A `Mesh` brings together a geometry and a program. wtc-gl has [primitives](/geometry/primitives) for common shapes, such as `Box`, `Sphere` and `Torus`, and `LitProgram`, a ready-made program that shades a mesh by the light from a `Lights`. Share one `Lights` between all your programs, so they're all lit the same way:

```js
import { Obj, Mesh, Sphere, Lights, LitProgram } from 'wtc-gl'

const scene = new Obj()
const lights = new Lights()

const ball = new Mesh(gl, {
  geometry: new Sphere(gl, { radius: 0.6, widthSegments: 32 }),
  program: new LitProgram(gl, { lights, colour: [0.95, 0.42, 0.26] })
})
ball.setParent(scene)
```

`setParent` adds the mesh to the scene. Only what's in the tree under the scene you render gets drawn. Meshes can be children of other meshes too, and move with them; see [Scene graph](/core/scene-graph).

[Lights and LitProgram](/lighting/lights) covers the light and the material options, such as `specular` and texture `map`s.

## Resizing

The renderer's `dimensions` is the canvas size in CSS pixels. Setting it sizes the drawing buffer to that times `dpr`, the device pixel ratio, which is `devicePixelRatio` capped at 2 by default. It doesn't set the canvas's CSS size, so give the canvas one, or it shows at `dpr` times the size:

```css
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

Update the camera's aspect ratio at the same time. `camera.perspective()` takes any of `fov`, `aspect`, `near` and `far`, keeps the rest, and rebuilds the projection:

```js
import { Vec2 } from 'wtc-gl'

const resize = () => {
  renderer.dimensions = new Vec2(innerWidth, innerHeight)
  camera.perspective({ aspect: innerWidth / innerHeight })
}
addEventListener('resize', resize)
resize()
```

Assign a new `Vec2` to `dimensions`; changing its `x` or `y` in place doesn't resize the canvas.

## The render loop

`renderer.render({ scene, camera })` draws one frame: it clears the canvas, updates the world matrices of everything in the scene, skips meshes outside the camera's view, and draws the rest. Call it from a `requestAnimationFrame` loop:

```js
requestAnimationFrame(function frame(time) {
  requestAnimationFrame(frame)
  renderer.render({ scene, camera })
})
```

## Moving things

Every `Obj` has a `position`, a `rotation` and a `scale`, each a `Vec3`. Position and scale take effect as you set them. The rotation is in radians, and is turned into the object's `quaternion` when you call `updateRotation()`, so call it after changing `rotation`:

```js
requestAnimationFrame(function frame(time) {
  requestAnimationFrame(frame)
  ball.rotation.y = time * 0.001
  ball.updateRotation()
  ball.position.y = Math.sin(time * 0.002) * 0.5
  renderer.render({ scene, camera })
})
```

## Orbiting with the mouse

`DollyCamera` is a camera that orbits a target as you drag, zooms with the wheel or a pinch, and pans with the right button or two fingers. Make it in place of `Camera`, passing the element to listen on and the camera options separately. Place it with `setPosition`, and call `update()` every frame so it eases towards where the input puts it:

```js
import { DollyCamera, Vec3 } from 'wtc-gl'

const camera = new DollyCamera(
  { element: gl.canvas, target: new Vec3(0, 0, 0), maxDistance: 20 },
  { fov: 35 }
)
camera.setPosition(0, 2, 6)

requestAnimationFrame(function frame() {
  requestAnimationFrame(frame)
  camera.update()
  renderer.render({ scene, camera })
})
```

[Cameras](/core/cameras#orbiting-with-dollycamera) has a live example and its options.

## Next steps

- [Scene graph](/core/scene-graph): parents and children, matrices and draw order.
- [Primitives](/geometry/primitives): the shapes that come with wtc-gl.
- [Lights and LitProgram](/lighting/lights) and [Shadows](/lighting/shadows).
- [Programs and shaders](/core/programs-and-shaders), to write your own.
- [Cleaning up](/core/cleaning-up), to free what you made.
- The API reference for [Renderer](/api/wtc-gl/classes/Renderer), [Camera](/api/wtc-gl/classes/Camera), [Mesh](/api/wtc-gl/classes/Mesh) and [LitProgram](/api/wtc-gl/classes/LitProgram).
