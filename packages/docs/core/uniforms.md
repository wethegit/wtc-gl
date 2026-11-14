# Uniforms

A `Uniform` holds a value a program's shaders read, such as a time, a colour or a texture. {.lead}

Make a uniform with a value and a kind, then pass it to a program in `uniforms`, keyed by its name in the shader. Change its `value` whenever you like; the program uploads it the next time it draws, and only if it changed.

<Example src="uniforms" :height="320" />

<<< @/examples/uniforms.js

## Names

The key in the program's `uniforms` is what connects a uniform to the shader. It has to match the GLSL name exactly:

```js
import { Program, Uniform } from 'wtc-gl'

const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })

const program = new Program(gl, {
  vertex,
  fragment, // declares `uniform float u_time;`
  uniforms: { u_time }
})
```

The uniform's own `name` is only used in warnings, so it can be anything that helps you find it. Nothing is added to or taken off either name.

The convention in wtc-gl, and in its demos, is a `u_` prefix for uniforms, `a_` for your own attributes and `v_` for values passed from the vertex shader to the fragment shader. The [uniforms a mesh sets](/core/programs-and-shaders#uniforms-the-mesh-sets) follow it: `u_modelViewMatrix`, `u_projectionMatrix` and the rest. Some demos use `b_` for textures that hold a buffer, such as the last frame of a simulation.

## Kinds and values

`kind` names the uniform's GLSL type. Values are numbers, booleans, arrays of numbers (or a `Float32Array`), or textures:

| GLSL                            | `kind`                          | Value                  |
| ------------------------------- | ------------------------------- | ---------------------- |
| `float`                         | `'float'`                       | `0.5`                  |
| `int`                           | `'int'`                         | `3`                    |
| `uint`                          | `'uint'`                        | `3`                    |
| `bool`                          | `'boolean'`                     | `true`                 |
| `vec2`, `vec3`, `vec4`          | `'float_vec2'` … `'float_vec4'` | `[1, 0.5, 0]`          |
| `ivec2` … `ivec4`               | `'int_vec2'` … `'int_vec4'`     | `[1, 2]`               |
| `uvec2` … `uvec4`               | `'uint_vec2'` … `'uint_vec4'`   | `[1, 2]`               |
| `mat2`, `mat3`, `mat4`          | `'mat2'`, `'mat3'`, `'mat4'`    | 4, 9 or 16 numbers     |
| `mat2x3`, `mat3x4` and the rest | `'mat2x3'`, `'mat3x4'` …        | The matching count     |
| `sampler2D`, `samplerCube` …    | `'texture'`                     | A `Texture`            |
| an array of samplers            | `'texture_array'`               | An array of `Texture`s |

See [UniformKind](/api/wtc-gl/type-aliases/UniformKind) for the full list. Vectors and matrices from wtc-math aren't arrays; pass their `.array`:

```js
import { Uniform, Vec3, Mat4 } from 'wtc-gl'

const u_colour = new Uniform({
  name: 'colour',
  value: new Vec3(1, 0.4, 0.2).array,
  kind: 'float_vec3'
})
const u_warp = new Uniform({
  name: 'warp',
  value: new Mat4().array,
  kind: 'mat4'
})
```

A matrix's `.array` is already in the column order GLSL expects.

### How kind is used

The upload is chosen from the type the shader declares, not from `kind`, so a `vec3` gets `uniform3fv` whatever the uniform says. `kind` records what you meant. Where it matters is textures: wtc-gl checks them against the shader, and warns once per uniform when something doesn't fit:

- A texture whose kind isn't `'texture'` (or `'texture_array'`) still binds as a texture, with a warning.
- A texture on a uniform the shader declares as something other than a sampler is skipped, with a warning.
- A texture whose target doesn't match the sampler, such as a cube map on a `sampler2D`, is skipped, with a warning. WebGL would refuse to draw otherwise.
- A sampler whose value isn't a texture is skipped, with a warning. `null` is allowed, and reads texture unit 0, which is handy while a render target is still being set up.

A value of `undefined` is skipped with a `missing a value` warning, and a uniform the shader declares but the program wasn't given is skipped with `Active uniform … has not been supplied`. The shader compiler removes uniforms it doesn't use, so declaring one you don't pass is fine as long as nothing reads it.

### Arrays

An array uniform takes all its values in one flat array: three `vec3`s are nine numbers. Use the element's kind:

```js
// uniform vec3 u_colours[3];
const u_colours = new Uniform({
  name: 'colours',
  value: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  kind: 'float_vec3'
})

// uniform float u_weights[4];
const u_weights = new Uniform({
  name: 'weights',
  value: [0.1, 0.2, 0.3, 0.4],
  kind: 'float'
})
```

For an array of samplers, pass an array of textures with `'texture_array'`; each gets its own texture unit.

## Textures

A `Texture` as the value binds the texture to the next free texture unit and points the sampler at it. Uploading the image happens there too, the first time the texture is used or after you set `needsUpdate`:

```js
import { Texture, Uniform } from 'wtc-gl'

const texture = await Texture.fromURL(gl, '/photo.jpg')
const u_map = new Uniform({ name: 'map', value: texture, kind: 'texture' })
```

Swap textures by setting `value` to another one. [Textures](/core/textures) covers making them, and [render targets](/core/render-targets) reading what you've drawn.

## Changing values

Set `value` as often as you like, each frame included. When the program draws, it compares the value with what it last uploaded to that program and skips the upload if nothing changed.

Arrays are compared by their contents, and the last upload is kept as a copy, so you can change an array, or a `Float32Array`, in place:

```js
const position = [0, 0, 0]
const u_position = new Uniform({
  name: 'position',
  value: position,
  kind: 'float_vec3'
})

// Each frame
position[0] = Math.sin(time)
```

Reusing one array this way also saves making a new one every frame.

## Sharing uniforms

A uniform can be in any number of programs. Changing its value changes it in all of them, which suits values the whole scene reads, such as a time or a pointer position:

```js
const u_time = new Uniform({ name: 'time', value: 0, kind: 'float' })

const water = new Program(gl, {
  vertex,
  fragment: waterFragment,
  uniforms: { u_time }
})
const sky = new Program(gl, {
  vertex,
  fragment: skyFragment,
  uniforms: { u_time }
})
```

wtc-gl does this itself: `Lights` and `Shadow` each keep their uniforms in a `uniforms` object, and every program spreads it into its own, so moving the light moves it everywhere:

```js
const program = new Program(gl, {
  vertex,
  fragment,
  uniforms: { ...lights.uniforms, u_time }
})
```

## Related

- [Programs and shaders](/core/programs-and-shaders)
- [Textures](/core/textures)
- API: [Uniform](/api/wtc-gl/classes/Uniform), [UniformOptions](/api/wtc-gl/interfaces/UniformOptions), [UniformKind](/api/wtc-gl/type-aliases/UniformKind)
