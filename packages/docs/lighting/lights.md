# Lights and LitProgram

Light meshes with a shared `Lights` and `LitProgram`, a simple material for models and primitives. {.lead}

`Lights` holds the light for a scene: one directional light, like the sun, a sky and ground hemisphere that stands in for light bouncing around a room, and flat ambient light. All of it is in world space, so the shading stays put as the camera moves.

`LitProgram` lights any mesh with a `position` and a `normal`: Lambert diffuse, an optional Blinn-Phong highlight, and a colour, a texture or both. Give every `LitProgram` the same `Lights`, and changing a light changes them all.

<Example src="lights" :height="360" demo="lighting" />

<<< @/examples/lights.js

## Lights

```js
import { Lights } from 'wtc-gl'

const lights = new Lights({
  direction: [-1, 1, 1],
  intensity: 0.8,
  ambient: 0.1
})
```

All of the options are optional:

| Option      | Default              | What it does                                                   |
| ----------- | -------------------- | -------------------------------------------------------------- |
| `direction` | `[-0.45, 0.7, 0.55]` | The direction _towards_ the directional light. It's normalised |
| `colour`    | `[1, 1, 1]`          | The directional light's colour                                 |
| `intensity` | `0.75`               | The directional light's strength                               |
| `sky`       | `[0.3, 0.32, 0.36]`  | The hemisphere light from above, world +Y                      |
| `ground`    | `[0.1, 0.09, 0.08]`  | The hemisphere light from below                                |
| `ambient`   | `0.05`               | Flat light added everywhere                                    |

Each has a setter of the same name. The values live in `lights.uniforms`, which every program using these lights holds, so setting one updates every program at once without allocating:

```js
// A sun that circles overhead
lights.direction = [Math.cos(time), 0.8, Math.sin(time)]
```

A surface's colour comes out as `base × (ambient + hemisphere + light × diffuse)`, plus the highlight. The hemisphere blends from `ground` to `sky` by how far the surface faces up, and `diffuse` is how directly it faces the light. A surface facing away from the light still gets the hemisphere and ambient light, so set them low for strong contrast and higher for a softer, room-lit look.

## LitProgram

```js
import { Mesh, Sphere, LitProgram } from 'wtc-gl'

const ball = new Mesh(gl, {
  geometry: new Sphere(gl),
  program: new LitProgram(gl, {
    lights,
    colour: [0.95, 0.42, 0.26],
    specular: 0.5
  })
})
```

`lights` is the `Lights` to share. Leave it out and the program makes its own, which nothing else will share. The [primitives](/geometry/primitives) all have the normals and uvs it reads. It needs a camera to draw, since the lighting is done in view space from the matrices the mesh sets.

### Surface

- `colour` is the surface colour, `[r, g, b]` from 0 to 1. White by default.
- `map` is a [texture](/core/textures) multiplied with the colour, read with the `uv` attribute.
- `opacity` is the surface alpha, multiplied with the map's. Below 1, the program is `transparent` and blends, unless you say otherwise.
- `alphaTest` discards fragments whose alpha is below it, for cut-outs such as leaves from a texture.
- `vertexColours: true` multiplies by a `colour` attribute (a `vec3`) on the geometry.

### Highlight

- `specular` is the strength of a Blinn-Phong highlight. 0, the default, is plain Lambert, a matte surface.
- `shininess` is how tight the highlight is, 32 by default. Higher is smaller and sharper, like polished plastic; lower spreads it out.

The highlight is the directional light's reflection, so it moves as the camera does.

### Emissive

`emissive` is light the surface gives off, `[r, g, b]`, added after the lighting so it shows in shadow and in the dark. `emissiveMap` is a texture multiplied with it, for windows or screens that glow. Both default to off.

### Faces

- `flatShading: true` shades each triangle by its face normal, for a faceted look, whatever normals the geometry has.
- `doubleSided: true` draws the back faces too and lights them with their normals flipped, for open meshes such as planes, leaves and cloth.
- `depthTest` and `depthWrite` are on by default, as for any [program](/core/programs-and-shaders).

### Instancing and shadows

- `instanced: true` reads each instance's matrix and colour from an `InstancedMesh`. The instance colour multiplies the surface colour. See [Instancing](/geometry/instancing).
- `shadow` receives a `Shadow` from the directional light. See [Shadows](/lighting/shadows).

## Changing a program

Most options can be changed after the program is made, through setters of the same names, at two different costs.

- **Uniforms**, which are free to change every frame: `colour`, `opacity`, `map`, `specular`, `shininess`, `emissive` and `emissiveMap`.
- **Shader options**, which recompile the program in place with `setShaders`: `vertexColours`, `flatShading`, `doubleSided`, `instanced` and `shadow`. Fine in response to a click, not every frame. Swapping one `Shadow` for another doesn't recompile; only switching between a shadow and `null` does.

```js
program.colour = [0.3, 0.45, 0.85] // a uniform
program.flatShading = true // recompiles
```

`alphaTest` has no setter; change it through its uniform, `program.uniforms.u_alphaTest.value`. Setting `opacity` doesn't change `transparent`, so make a program that will fade out with `transparent: true` from the start.

## Colour space

`LitProgram` shades in sRGB, the space CSS colours, images and colour pickers are in. A colour picked for the page, such as `rgb(74, 158, 255)`, goes straight into `colour` as `[0.29, 0.62, 1]`, and textures need no conversion.

Lighting in sRGB rather than in linear light isn't physically right, so the falloff into shadow and the way colours blend won't match a physically based renderer. For a few lit models on a website, matching picked colours usually matters more. The [glTF loader](/loading/gltf) converts a model's linear colours to sRGB as it loads them.

## Lighting in your own shaders

[`litShading`](/api/wtc-gl/variables/litShading) is the same lighting as a GLSL chunk: the `Lights` uniforms, and

```glsl
vec3 litShade(vec3 base, vec3 normal, vec3 view, mat3 viewRotation,
              float specular, float shininess[, float shadow])
```

`normal` and `view` are view-space unit vectors, `view` pointing towards the camera, and `viewRotation` is `mat3(u_viewMatrix)`, which turns the world-space light into view space. The optional `shadow` scales the directional light, from 0 in shadow to 1; see [Shadows](/lighting/shadows).

Add the chunk after the fragment shader's precision statement, declare `u_viewMatrix` yourself, and spread `lights.uniforms` into the program's uniforms. Here a striped sphere is lit like a `LitProgram`:

```js
import { Program, Mesh, Sphere, Lights, litShading } from 'wtc-gl'

const lights = new Lights()

const vertex = /* glsl */ `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;
out vec3 v_normal;
out vec3 v_position;
out vec2 v_uv;
void main() {
  vec4 p = u_modelViewMatrix * vec4(position, 1.0);
  v_position = p.xyz;
  v_normal = u_normalMatrix * normal;
  v_uv = uv;
  gl_Position = u_projectionMatrix * p;
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
${litShading}
uniform mat4 u_viewMatrix;
in vec3 v_normal;
in vec3 v_position;
in vec2 v_uv;
out vec4 colour;
void main() {
  float stripe = step(0.5, fract(v_uv.y * 8.0));
  vec3 base = mix(vec3(0.95, 0.42, 0.26), vec3(0.98, 0.9, 0.8), stripe);
  vec3 n = normalize(v_normal);
  vec3 view = normalize(-v_position);
  colour = vec4(litShade(base, n, view, mat3(u_viewMatrix), 0.4, 32.0), 1.0);
}`

const striped = new Mesh(gl, {
  geometry: new Sphere(gl, { widthSegments: 48 }),
  program: new Program(gl, {
    vertex,
    fragment,
    // Spread, so the program gets its own object that shares the uniforms
    uniforms: { ...lights.uniforms }
  })
})
```

The mesh supplies `u_modelViewMatrix`, `u_projectionMatrix`, `u_normalMatrix` and `u_viewMatrix` when it's drawn with a camera.

## See also

- [Shadows](/lighting/shadows), to shadow the directional light.
- [Debug helpers](/lighting/debug-helpers), to check a mesh's normals when the lighting looks wrong.
- [glTF models](/loading/gltf), whose materials load as `LitProgram`s.
- The [lighting demo](https://wethegit.github.io/wtc-gl/demos/lighting/), with every option on a panel.
- API: [Lights](/api/wtc-gl/classes/Lights), [LightsOptions](/api/wtc-gl/interfaces/LightsOptions), [LitProgram](/api/wtc-gl/classes/LitProgram), [LitProgramOptions](/api/wtc-gl/interfaces/LitProgramOptions), [litShading](/api/wtc-gl/variables/litShading).
