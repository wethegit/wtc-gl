# Programs and shaders

A `Program` is a vertex and fragment shader compiled together, with the uniforms and render state a mesh draws with. {.lead}

wtc-gl doesn't write shaders for you, apart from the ready-made programs such as `LitProgram`. You pass the GLSL source as strings, along with the uniforms it reads, and a `Mesh` pairs the program with a geometry. Many meshes can share one program; they share its uniforms too.

<Example src="custom-shader" :height="360" />

<<< @/examples/custom-shader.js

## Writing the shaders

Write GLSL 3.00 (`#version 300 es` on the first line, with `in`, `out` and a named fragment output). The library's own shaders are 3.00, and so are the GLSL chunks below. GLSL 1.00 shaders still compile, but both shaders of a program must use the same version.

The program compiles the source exactly as given: it doesn't add a `#version` line, a precision statement or any declarations. A fragment shader needs its own `precision highp float;`.

If a shader fails to compile or link, the program logs the error with the source and line numbers, `program.linked` is `false`, and meshes using it draw nothing.

### Attributes

Attributes are matched to the geometry by name. The built-in geometries, such as `Sphere`, `Box`, `Plane` and `Torus`, provide:

| Attribute | Type   | What it is                    |
| --------- | ------ | ----------------------------- |
| position  | `vec3` | The vertex position           |
| normal    | `vec3` | The surface normal, unit long |
| uv        | `vec2` | Texture coordinates, 0 to 1   |

They're indexed as well, but the index isn't an attribute a shader reads. `Triangle`, the full-screen triangle, has a `vec2` position in clip space and a `uv`. Declare only the attributes you use; if a shader reads one the geometry doesn't have, the geometry warns `active attribute … not being supplied`. See [geometry and attributes](/geometry/geometry-and-attributes) to add your own.

### Uniforms the mesh sets

When a mesh is drawn with a camera, it sets these uniforms on its program before each draw. Declare the ones you need, with these names:

| Uniform              | Type   | What it is                                                  |
| -------------------- | ------ | ----------------------------------------------------------- |
| `u_modelMatrix`      | `mat4` | Object space to world space                                 |
| `u_viewMatrix`       | `mat4` | World space to the camera's view space                      |
| `u_modelViewMatrix`  | `mat4` | Object space to view space                                  |
| `u_projectionMatrix` | `mat4` | View space to clip space                                    |
| `u_normalMatrix`     | `mat3` | Object-space normals to view space                          |
| `u_cameraPosition`   | `vec3` | The camera's position in world space                        |
| `u_objectPosition`   | `vec3` | The mesh's position in world space, set even with no camera |

So the usual vertex shader is:

```glsl
#version 300 es
in vec3 position;
in vec3 normal;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
out vec3 v_normal;

void main() {
  v_normal = u_normalMatrix * normal;
  gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(position, 1.0);
}
```

Without a camera (`renderer.render({ scene })`), only `u_objectPosition` is set, and the vertex shader writes clip-space positions itself, as a full-screen pass does.

Every other uniform the shaders declare has to be in the program's `uniforms`, keyed by its name in the shader. One that's missing is skipped with a warning, `Active uniform … has not been supplied`. [Uniforms](/core/uniforms) covers making them.

## Render state

The rest of the options set how the program draws. Each is also a property, so you can change it later; it's applied every time the program is used.

```js
import { Program } from 'wtc-gl'

const program = new Program(gl, {
  vertex,
  fragment,
  uniforms: { u_time },
  transparent: true,
  cullFace: 0, // draw both sides
  depthWrite: false
})
```

| Option        | Default   | What it does                                                          |
| ------------- | --------- | --------------------------------------------------------------------- |
| `transparent` | `false`   | Blend with what's behind, and draw after the opaque meshes            |
| `cullFace`    | `gl.BACK` | The face to skip: `gl.BACK`, `gl.FRONT`, or `0` to draw both          |
| `frontFace`   | `gl.CCW`  | Which winding faces front                                             |
| `depthTest`   | `true`    | Test fragments against the depth buffer                               |
| `depthWrite`  | `true`    | Write to the depth buffer                                             |
| `depthFunc`   | `gl.LESS` | The depth comparison, e.g. `gl.LEQUAL`                                |
| `colourWrite` | `true`    | Write colour; turn it off for passes that only write depth or stencil |
| `stencil`     | `null`    | A stencil test; see below                                             |

A mesh scaled negatively on one axis turns inside out, so it flips `frontFace` for that draw and its faces still cull the right way.

### Blending

`transparent: true` sets an alpha blend: `gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA`, or `gl.ONE, gl.ONE_MINUS_SRC_ALPHA` when the renderer was made with `premultipliedAlpha: true`. For anything else, call `setBlendFunc`, which also turns `transparent` on, and `setBlendEquation`:

```js
// Additive, for glows and particles
program.setBlendFunc(gl.SRC_ALPHA, gl.ONE)

// Separate factors for alpha
program.setBlendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE)

// Keep the brighter of the two
program.setBlendEquation(gl.MAX, gl.MAX)
```

When the renderer sorts a scene, transparent meshes are drawn after the opaque ones, back to front. Transparent meshes with `depthTest: false` are drawn last of all, which suits overlays.

### Stencil

`stencil` takes the arguments of `gl.stencilFunc`, `gl.stencilOp` and `gl.stencilMask` as one object, filling in WebGL's defaults for anything left out. This pair draws a mask into the stencil, then draws a second mesh only inside it:

```js
// Write 1 wherever the mask draws, without drawing any colour
const maskProgram = new Program(gl, {
  vertex,
  fragment,
  colourWrite: false,
  stencil: { ref: 1, zpass: gl.REPLACE }
})

// Draw only where the stencil is 1
const insideProgram = new Program(gl, {
  vertex,
  fragment,
  stencil: { func: gl.EQUAL, ref: 1 }
})
```

The canvas needs a stencil buffer for this: make the renderer with `stencil: true`, or draw into a [render target](/core/render-targets) with one. The [stencil and depth demo](https://wethegit.github.io/wtc-gl/demos/stencil-depth/) uses it for a portal. See [StencilOptions](/api/wtc-gl/interfaces/StencilOptions) for every field.

## Changing the shaders

`setShaders` swaps the shaders of a program in place, keeping its uniforms and state, so every mesh using it picks up the change. Leave either source out to keep the current one. It returns whether the new shaders linked:

```js
const ok = program.setShaders({ fragment: editedFragment })
```

If the new shaders fail, the error is logged and the program carries on drawing with the old ones, so a broken edit while you're working on a shader, or during hot reloading, doesn't blank the canvas.

## Shaders in files

Longer shaders are easier to keep in `.vert`, `.frag` and `.glsl` files and import as strings; [installation](/getting-started/installation#shaders-as-files) shows how to set up Vite. Since they're strings, you can put them together with template literals. Keep `#version` out of a file you prefix, because it has to be the first line of the final source:

```js
import fragmentBody from './surface.frag'

const fragment = `#version 300 es
precision highp float;
${fragmentBody}`
```

## The library's GLSL

Some of wtc-gl's own shader code is exported as GLSL strings, so your shaders can share it. Add each one after the precision statement.

### litShading

[`litShading`](/api/wtc-gl/variables/litShading) is the lighting `LitProgram` uses: one directional light, a sky and ground hemisphere and flat ambient light, from a shared `Lights`. It declares the light uniforms and a function:

```glsl
vec3 litShade(vec3 base, vec3 normal, vec3 view, mat3 viewRotation,
              float specular, float shininess[, float shadow]);
```

`normal` and `view` (pointing towards the camera) are view-space unit vectors, and `viewRotation` is `mat3(u_viewMatrix)`, which turns the world-space light direction into view space. `specular` scales a Blinn-Phong highlight, 0 for none. Spread `lights.uniforms` into the program's uniforms, and declare `u_viewMatrix` yourself:

```js
import { Program, Uniform, Lights, litShading } from 'wtc-gl'

const lights = new Lights()

const fragment = `#version 300 es
precision highp float;
${litShading}
uniform mat4 u_viewMatrix;
uniform vec3 u_colour;
in vec3 v_normal;   // view space
in vec3 v_position; // view space
out vec4 colour;

void main() {
  vec3 n = normalize(v_normal);
  vec3 view = normalize(-v_position);
  colour = vec4(litShade(u_colour, n, view, mat3(u_viewMatrix), 0.5, 32.0), 1.0);
}`

const program = new Program(gl, {
  vertex, // passes v_normal and v_position in view space
  fragment,
  uniforms: {
    ...lights.uniforms,
    u_colour: new Uniform({
      name: 'colour',
      value: [1, 0.4, 0.2],
      kind: 'float_vec3'
    })
  }
})
```

Because the uniforms are shared, changing `lights` relights every program that uses them. See [lights](/lighting/lights).

### shadowShading

[`shadowShading`](/api/wtc-gl/variables/shadowShading) looks up a `Shadow` map. It declares the fragment shader's shadow uniforms and `float shadowFactor(vec4 coord)`, which is 0 in shadow and 1 in the light; pass it as the last argument of `litShade`. The vertex shader works out the coordinate, from the world position pushed out along the world normal:

```glsl
uniform mat4 u_modelMatrix;
uniform mat4 u_shadowMatrix;
uniform float u_shadowNormalBias;
out vec4 v_shadowCoord;

// in main()
vec4 world = u_modelMatrix * vec4(position, 1.0);
vec3 worldNormal = normalize(mat3(u_modelMatrix) * normal);
v_shadowCoord = u_shadowMatrix * vec4(world.xyz + worldNormal * u_shadowNormalBias, 1.0);
```

Spread `shadow.uniforms` into the program's uniforms alongside `lights.uniforms`. [Shadows](/lighting/shadows) covers setting up the shadow itself.

### polylineExtrude

[`polylineExtrude`](/api/wtc-gl/variables/polylineExtrude) is the vertex-shader function `Polyline` uses to give a line width on screen. It returns the clip-space position of one edge of a line point:

```glsl
vec4 polylineExtrude(mat4 projection, mat4 modelView, vec3 position,
                     vec3 prev, vec3 next, float side, float width,
                     vec2 resolution, bool sizeAttenuation, float miterLimit);
```

`prev` and `next` are the neighbouring points, `side` is `1.0` or `-1.0`, `width` is in CSS pixels (or world units with `sizeAttenuation`), and `resolution` is the canvas size in CSS pixels. It's for lines whose points come from somewhere `Polyline` can't see, such as a texture of particle positions; the [polyline trails demo](https://wethegit.github.io/wtc-gl/demos/polyline-trails/) does this. See [Polyline](/lines/polyline) for ordinary lines.

## Cleaning up

`program.remove()` deletes the WebGL program. Do it once no mesh uses the program; see [cleaning up](/core/cleaning-up).

## Related

- [Uniforms](/core/uniforms) and [textures](/core/textures), for the values shaders read
- [Your first 3D scene](/getting-started/first-3d-scene)
- [`LitProgram`](/api/wtc-gl/classes/LitProgram), a ready-made lit material
- API: [Program](/api/wtc-gl/classes/Program), [ProgramOptions](/api/wtc-gl/interfaces/ProgramOptions), [StencilOptions](/api/wtc-gl/interfaces/StencilOptions)
