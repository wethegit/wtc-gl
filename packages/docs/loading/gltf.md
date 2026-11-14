# glTF models

Load models from Blender and other tools with `GLTFLoader`, lit by `LitProgram`. {.lead}

[glTF](https://www.khronos.org/gltf/) is the standard format for models on the web, and Blender and most 3D tools export it. `GLTFLoader` reads a `.glb` or `.gltf` file into wtc-gl objects: nodes become `Obj`s, meshes become `Mesh`es, cameras become `Camera`s, and each material becomes a [`LitProgram`](/lighting/lights). It's made for the occasional hero model, not for a game's worth of assets.

<Example src="gltf" :height="360" demo="gltf" />

<<< @/examples/gltf.js

## Loading a file

`GLTFLoader.load` fetches a file and resolves with what's in it. Add `gltf.scene` to your own scene:

```js
import { GLTFLoader, Lights } from 'wtc-gl'

const lights = new Lights()
const url = new URL('./models/hero.glb', import.meta.url).href

const gltf = await GLTFLoader.load(gl, url, { lights })
gltf.scene.setParent(scene)
```

`new URL(..., import.meta.url)` has the bundler copy the file into the build and give you its final address. A file in your public folder can be loaded by its path instead.

The options are all optional:

- `lights` is the [`Lights`](/lighting/lights) every program shares. Pass the scene's own, so the model is lit like everything else. A new `Lights()` by default.
- `shadow` is a [`Shadow`](/lighting/shadows) every program receives. The loader doesn't add casters: pass `gltf.scene`, or the nodes that should cast, to `shadow.add`.
- `baseURL` is what relative URIs in the file, for its buffers and images, are resolved against. By default, the file's own URL.
- `signal` is an `AbortSignal` that cancels the requests, if the page moves on before the model arrives.

`GLTFLoader.parse(gl, data, options)` reads a file you already have: a `.glb` or `.gltf` as an `ArrayBuffer`, or the parsed JSON of a `.gltf`.

Loading is asynchronous, so draw the rest of the scene, or nothing, until it resolves.

## What you get back

| Property   | What it is                                                         |
| ---------- | ------------------------------------------------------------------ |
| `scene`    | The default scene's root, an `Obj`. Add it to your own scene       |
| `scenes`   | Every scene's root                                                 |
| `nodes`    | Every node, by its index in the file                               |
| `meshes`   | Every `Mesh` made, including each primitive of a mesh with several |
| `cameras`  | Every `Camera` made, one per node with a camera                    |
| `programs` | The `LitProgram`s made for the materials                           |
| `textures` | The textures loaded for the materials                              |
| `lights`   | The `Lights` the programs share                                    |
| `json`     | The file's parsed JSON                                             |
| `remove()` | Frees every geometry, program and texture made for the file        |

Nodes keep their names from the file, and their transforms as `position`, `quaternion` and `scale`. A node with a mesh is the `Mesh` itself; when the mesh has several primitives, one per material, the node is an `Obj` with a `Mesh` for each, named `Name.0`, `Name.1` and so on. Meshes used by several nodes share their geometry and program.

Find a node by name with `traverse`:

```js
let sign = null
gltf.scene.traverse((node) => {
  if (node.name === 'Sign') sign = node
  return null
})
```

A camera from the file starts with the file's aspect ratio, or the canvas's. Set it on resize, as for any [camera](/core/cameras): `gltf.cameras[0].perspective({ aspect })`.

## Geometry

The `POSITION`, `NORMAL`, `TEXCOORD_0` and `COLOR_0` attributes are read into floats as `position`, `normal`, `uv` and `colour`; others are ignored. Because they're on the CPU, bounds, [`Raycast`](/interaction/raycast), the [debug helpers](/lighting/debug-helpers) and the geometry tools all work on them. Quantised attributes (`KHR_mesh_quantization`) are converted to floats as they're read.

A primitive without normals is shaded flat.

## Materials

glTF materials are physically based; `LitProgram` is a simpler Blinn-Phong material. The loader approximates each one:

- The base colour factor and texture become `colour`, `opacity` and `map`.
- `alphaMode` OPAQUE draws fully opaque, MASK discards below `alphaCutoff` (0.5 by default) with `alphaTest`, and BLEND draws `transparent`.
- `doubleSided` maps straight across.
- The emissive factor, times `KHR_materials_emissive_strength`, and the emissive texture become `emissive` and `emissiveMap`.
- Roughness sets the highlight: none when fully rough, small and sharp when smooth. Metalness isn't modelled.
- A primitive with vertex colours gets `vertexColours`.

Normal, occlusion and metallic-roughness textures are ignored. Textures keep their sampler's wrapping and filtering.

glTF stores colour factors and vertex colours as linear values, while `LitProgram` shades in sRGB, the space textures and the page are in. The loader converts them to sRGB, so a colour picked in Blender looks as it did there rather than darker and more saturated.

The programs are ordinary `LitProgram`s, so you can change them after loading:

```js
for (const program of gltf.programs) {
  program.specular = 0
}
```

[`materialProgram`](/api/wtc-gl/functions/materialProgram) is the function that makes them, if you need the same mapping for a material of your own.

## Instancing

A node exported with `EXT_mesh_gpu_instancing` becomes an [`InstancedMesh`](/geometry/instancing) with a matrix per instance, drawn in one call. Its program is made with `instanced: true`. Picking an instance with `Raycast` gives its `instanceId`.

## Extras

Custom properties set in Blender can be exported as `extras` on each node. They aren't copied onto the objects, but `gltf.json.nodes[i]` and `gltf.nodes[i]` share an index:

```js
gltf.json.nodes.forEach((node, i) => {
  if (node.extras?.clickable) clickable.push(gltf.nodes[i])
})
```

This is handy for tagging which meshes are colliders, which can be clicked, or which should cast shadows.

## Freeing a model

`gltf.remove()` frees every geometry, program and texture the loader made. Take the scene out of yours first. It doesn't touch the `Lights` or `Shadow` you passed in.

```js
gltf.scene.setParent(null)
gltf.remove()
```

## What's out of scope

- Skinning, morph targets and animation. Nodes are placed as the file has them, and move only as you move them.
- PBR materials and image-based lighting: materials are approximated as above.
- Texture coordinates other than the first set.
- Compressed files, with Draco or meshopt. Export uncompressed.

A file that requires an extension the loader doesn't support is rejected with an error naming it. The supported ones are `EXT_mesh_gpu_instancing`, `KHR_materials_emissive_strength` and `KHR_mesh_quantization`.

## See also

- [Lights and LitProgram](/lighting/lights), for the light the model is shaded with.
- [Shadows](/lighting/shadows), to cast shadows from a model.
- [Raycast](/interaction/raycast), to pick nodes and instances under the pointer.
- The [glTF demo](https://wethegit.github.io/wtc-gl/demos/gltf/), with the file's camera and hover picking.
- API: [GLTFLoader](/api/wtc-gl/classes/GLTFLoader), [GLTFLoaderOptions](/api/wtc-gl/interfaces/GLTFLoaderOptions), [GLTF](/api/wtc-gl/interfaces/GLTF), [materialProgram](/api/wtc-gl/functions/materialProgram).
