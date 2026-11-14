# Render targets

A `RenderTarget` is somewhere to draw other than the canvas: a framebuffer whose colour and depth end up in textures you can read in a later pass. {.lead}

Draw a scene into a target, then use its texture like any other: on a plane in another scene, or in a full-screen pass that adds a post effect. Targets are also how you blur, composite, read depth, and run simulations that keep their state in textures.

<Example src="render-target" :height="360" />

<<< @/examples/render-target.js

## Drawing into a target

Pass the target to `renderer.render`. The viewport is set to the target's size, and it's cleared first with the renderer's `clearColour`, unless you pass `clear: false` or the renderer's `autoClear` is off:

```js
import { RenderTarget } from 'wtc-gl'

const target = new RenderTarget(gl, { width: 1024, height: 1024 })

renderer.render({ scene, camera, target }) // into the target
renderer.render({ scene: post }) // then to the canvas
```

Then read `target.texture`, the first colour texture, in a uniform:

```js
const u_scene = new Uniform({
  name: 'scene',
  value: target.texture,
  kind: 'texture'
})
```

A target's textures aren't flipped, so `uv` (0, 0) in a full-screen pass reads the bottom left of what was drawn, and the image comes out the right way up.

A shader can't read a texture while drawing into it. For effects that build on the last frame, draw into one target while reading another; `Framebuffer`, below, does the swapping.

## Options

Left out, `width` and `height` are the canvas size in device pixels at the time the target is made. The colour textures default to 8-bit RGBA with linear filtering, clamped at the edges and without mipmaps. You can change each of these:

```js
const target = new RenderTarget(gl, {
  width: 512,
  height: 512,
  type: gl.HALF_FLOAT, // 16-bit float colour
  minFilter: gl.NEAREST,
  wrapS: gl.REPEAT,
  wrapT: gl.REPEAT,
  depth: false
})
```

- `type`, `format` and `internalFormat` set the colour textures' format. With `type: gl.HALF_FLOAT`, the internal format is always `gl.RGBA16F`. For 32-bit floats, set `type: gl.FLOAT` and `internalFormat: gl.RGBA32F`. Drawing into float textures needs the `EXT_color_buffer_float` extension, which the renderer turns on where it's available.
- `minFilter` (default `gl.LINEAR`) and `magFilter` (default the same as `minFilter`), `wrapS` and `wrapT` (default `gl.CLAMP_TO_EDGE`), and `generateMipmaps` (default `false`) work as they do for [textures](/core/textures).
- `data` fills the colour textures to start with, for seeding a simulation.

See [RenderTargetOptions](/api/wtc-gl/interfaces/RenderTargetOptions) for all of them.

## Depth and stencil

A target has a depth buffer by default (`depth: true`), so a 3D scene draws into it with its surfaces in the right order. Turn it off for full-screen passes, which don't need one.

`depthTexture` decides where the depth goes:

- `true` (the default): a texture, `target.depthTexture`, that a later pass can read. The depth is in its red channel, from 0 to 1, and isn't linear.
- `false`: a renderbuffer, which can't be read but is all a scene needs to draw correctly.
- A `Texture`: draw into a depth texture you made, for instance to share one between targets.

`depthFormat` sets the depth's internal format: `gl.DEPTH_COMPONENT24` by default, or `gl.DEPTH_COMPONENT32F` for more precision.

`stencil: true` adds a stencil buffer. With a depth buffer, the two share a `gl.DEPTH24_STENCIL8` texture or renderbuffer. Programs use it through their [`stencil` option](/core/programs-and-shaders#stencil).

## Several outputs

`colour` sets how many colour textures the target has. With more than one, a fragment shader writes to each in the same draw, by location:

```js
const gbuffer = new RenderTarget(gl, { colour: 2 })
const [albedo, normals] = gbuffer.textures
```

```glsl
layout(location = 0) out vec4 albedo;
layout(location = 1) out vec4 normal;

void main() {
  albedo = vec4(u_colour, 1.0);
  normal = vec4(normalize(v_normal) * 0.5 + 0.5, 1.0);
}
```

Every program drawn into the target should write to every output.

## Resizing

`target.resize(width, height)` resizes the textures and depth buffer in place. It keeps the same texture objects, so uniforms that hold them stay valid. What was drawn is lost, along with any starting `data`. To follow the canvas, resize the target when the renderer resizes, in device pixels:

```js
renderer.dimensions = new Vec2(width, height)
target.resize(gl.canvas.width, gl.canvas.height)
```

## Feedback with Framebuffer

`Framebuffer` is a pair of render targets that swap after every render, for effects that read their own last frame: trails, smudges, reaction-diffusion and simulations. `render` draws into `write`, then swaps, so `read` always holds the latest frame.

```js
import { Framebuffer, Mesh, Program, Triangle, Uniform } from 'wtc-gl'

const feedback = new Framebuffer(gl, {
  width: innerWidth,
  height: innerHeight,
  dpr: renderer.dpr,
  texdepth: Framebuffer.TEXTYPE_HALF_FLOAT,
  depth: false
})

const triangle = new Triangle(gl)
const u_pointer = new Uniform({
  name: 'pointer',
  value: [0.5, 0.5],
  kind: 'float_vec2'
})
const u_previous = new Uniform({
  name: 'previous',
  value: null,
  kind: 'texture'
})
const u_result = new Uniform({ name: 'result', value: null, kind: 'texture' })

// Fades the last frame and draws on top of it
const step = new Mesh(gl, {
  geometry: triangle,
  program: new Program(gl, {
    vertex,
    fragment: stepFragment,
    uniforms: { b_previous: u_previous, u_pointer }
  })
})
// Shows the result on the canvas
const show = new Mesh(gl, {
  geometry: triangle,
  program: new Program(gl, {
    vertex,
    fragment: showFragment,
    uniforms: { b_result: u_result }
  })
})

// Each frame
u_previous.value = feedback.read.texture
feedback.render(renderer, { scene: step })
u_result.value = feedback.read.texture
renderer.render({ scene: show })
```

```glsl
// stepFragment
uniform sampler2D b_previous;
uniform vec2 u_pointer; // in uv
in vec2 v_uv;
out vec4 colour;

void main() {
  vec4 last = texture(b_previous, v_uv) * 0.96;
  float spot = 1.0 - smoothstep(0.02, 0.03, distance(v_uv, u_pointer));
  colour = max(last, vec4(spot));
}
```

Set the uniforms from `read` every frame, since the two targets swap places on every render.

Its options differ from a `RenderTarget`'s:

- `width` and `height` are in CSS pixels, and the targets are `dpr` times larger. `dpr` defaults to the device pixel ratio, capped at 2.
- `texdepth` is the data type: `Framebuffer.TEXTYPE_UNSIGNED_BYTE` (the default), `TEXTYPE_HALF_FLOAT` or `TEXTYPE_FLOAT`.
- `tiling` is the wrapping: `Framebuffer.IMAGETYPE_REGULAR` (clamped, the default), `IMAGETYPE_TILING` (repeat) or `IMAGETYPE_MIRROR`.
- `minFilter`, `magFilter`, `premultiplyAlpha`, `data`, `depth` and `generateMipmaps` are as for a render target.

`render` passes on `scene`, `camera`, `update`, `clear` and `viewport`. `resize(width, height)` makes two new targets at the new size, deleting the old ones, so their textures change too. `swap()` swaps the targets without drawing, and `remove()` deletes both.

The [framebuffer demo](https://wethegit.github.io/wtc-gl/demos/framebuffer/) paints with the pointer this way, and [`ParticleSimulation`](/recipes/particle-simulation) reads particle state from a `Framebuffer` you step each frame. For simulations that don't need textures, see [transform feedback](/simulation/transform-feedback).

## Cleaning up

`target.remove()` deletes the framebuffer, its colour textures and its depth texture or renderbuffer. A depth texture you passed in is left alone. See [cleaning up](/core/cleaning-up).

## Related

- [Textures](/core/textures)
- [Shadows](/lighting/shadows), which renders depth into a target from the light
- API: [RenderTarget](/api/wtc-gl/classes/RenderTarget), [RenderTargetOptions](/api/wtc-gl/interfaces/RenderTargetOptions), [Framebuffer](/api/wtc-gl/classes/Framebuffer), [FramebufferOptions](/api/wtc-gl/interfaces/FramebufferOptions), [RenderOptions](/api/wtc-gl/interfaces/RenderOptions)
