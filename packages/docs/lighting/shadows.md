# Shadows

Cast shadows from the directional light onto lit meshes with a `Shadow`. {.lead}

A `Shadow` is a shadow map for the directional light in [`Lights`](/lighting/lights). Each frame it draws the meshes that cast into a depth texture, seen from the light, and every `LitProgram` given the shadow looks it up to tell whether a point can see the light. Points that can't lose the directional light. The hemisphere, ambient and emissive light aren't shadowed, so shadows are as dark as those leave them.

<Example src="shadows" :height="360" demo="lighting" />

<<< @/examples/shadows.js

## Setting up

A shadow takes three things: the lights it follows, the meshes that cast, and the programs that receive.

```js
import { Shadow, LitProgram, Mesh, Plane } from 'wtc-gl'

const shadow = new Shadow(gl, { lights, size: 4 })

// Every mesh under model casts
shadow.add(model)

// The ground receives
const ground = new Mesh(gl, {
  geometry: new Plane(gl, { width: 10, height: 10 }),
  program: new LitProgram(gl, { lights, shadow })
})
ground.rotation.x = -Math.PI / 2
ground.updateRotation()
```

Then, each frame, draw the shadow map before the scene:

```js
shadow.render({ scene })
renderer.render({ scene, camera })
```

`render` updates the scene's world matrices first, so the casters are where they'll be drawn. If you've already updated them this frame, for [raycasting](/interaction/raycast) perhaps, pass `update: false`. The map only needs drawing when the casters or the light have moved, so a still scene can skip it.

A mesh can cast and receive at once, so models shadow themselves and each other.

## The area it covers

The light's camera is orthographic. It covers a sphere of radius `size` around `target`, and turns to follow `lights.direction` on every render.

```js
import { Shadow, Vec3 } from 'wtc-gl'

const shadow = new Shadow(gl, {
  lights,
  target: new Vec3(0, 0.5, 0),
  size: 3,
  mapSize: 2048
})
```

- `target` is the centre of the area that gets shadows, the origin by default.
- `size` is its radius in world units, 5 by default.
- `mapSize` is the width and height of the depth texture in pixels, 1024 by default.

The map's pixels are spread across the whole area, so keep `size` as small as the scene allows: halve it and the shadows are twice as sharp. Raise `mapSize` for detail over a larger area, at the cost of memory and fill rate. Outside the area, everything is lit.

`fit(node)` sets `target` and `size` to cover every mesh under `node`, from their bounds. The world matrices need to be up to date, so update the scene first. It suits a model that stays put or spins in place:

```js
scene.updateMatrixWorld()
shadow.add(model).fit(model)
// A little room, as it spins
shadow.size *= 1.1
```

`target`, `size`, `bias`, `normalBias` and `softness` are plain properties, applied on the next `render`. Setting `mapSize` resizes the texture.

## Casters

`add(node)` casts shadows from `node` and every mesh under it. It's checked on every render, so meshes added under the node later cast too, and hidden ones don't. `delete(node)` stops a node casting.

Casters are drawn with a depth program that reads only `position` (and `instanceMatrix` for an `InstancedMesh`), from both sides, so open meshes such as planes cast too. Only triangle meshes cast; lines and points are skipped.

A shader that moves its vertices needs a depth program that moves them the same way, or the shadow will be cast by the mesh's original shape. Pass it to `add`. It only needs to write depth:

```js
import { Program, Uniform } from 'wtc-gl'

// Shared with the mesh's own program
const time = new Uniform({ name: 'time', value: 0, kind: 'float' })

const wavyDepth = new Program(gl, {
  vertex: /* glsl */ `#version 300 es
    in vec3 position;
    uniform mat4 u_modelViewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform float u_time;
    void main() {
      vec3 p = position;
      p.y += sin(p.x * 4.0 + u_time) * 0.1;
      gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(p, 1.0);
    }`,
  fragment: /* glsl */ `#version 300 es
    precision highp float;
    void main() {}`,
  uniforms: { u_time: time },
  // Both sides, like the built-in depth program
  cullFace: 0
})

shadow.add(flag, { program: wavyDepth })
```

## Receivers

A `LitProgram` receives with its `shadow` option, or by setting `program.shadow` later. Switching between a shadow and `null` recompiles the program, which is fine in response to a click but not every frame. Swapping one `Shadow` for another doesn't recompile.

[`GLTFLoader`](/loading/gltf) takes a `shadow` option too, and passes it to every program it makes. It doesn't add casters: pass `gltf.scene`, or the nodes that should cast, to `shadow.add`.

## Acne and softness

A surface sampling its own depth can shadow itself in stripes and speckles, known as shadow acne. Two settings push it away:

- `bias` is subtracted from the depth before comparing it, 0.001 by default.
- `normalBias` pushes each receiving point out along its normal before looking it up, in shadow map pixels, 1 by default.

Raise them until the acne goes. Too much and shadows come away from their casters, so objects look like they're floating.

`softness` is how far apart the filter's samples are, in shadow map pixels, 1 by default. Each lookup takes nine samples in a square that far apart, for a softer edge; 0 takes one, which the hardware still filters across a 2×2 block of pixels, for a hard but smooth edge. Softness doesn't grow with distance from the caster, as a real penumbra would.

## Shadows in your own shaders

[`shadowShading`](/api/wtc-gl/variables/shadowShading) is the shadow lookup as a GLSL chunk: the uniforms the fragment shader needs, and `float shadowFactor(vec4 coord)`, which is 0 in shadow and 1 in the light. Add it after the fragment shader's precision statement, spread `shadow.uniforms` into the program's uniforms, and work out the coordinate in the vertex shader from the world position, pushed out along the world normal:

```glsl
uniform mat4 u_shadowMatrix;
uniform float u_shadowNormalBias;
out vec4 v_shadowCoord;
// in main()
v_shadowCoord = u_shadowMatrix * vec4(world + worldNormal * u_shadowNormalBias, 1.0);
```

With [`litShading`](/lighting/lights#lighting-in-your-own-shaders), pass `shadowFactor(v_shadowCoord)` as the last argument of `litShade`.

A shadow catcher is a surface that shows only the shadows falling on it, so a model can sit on the page itself with nothing around it but its shadow. Make the renderer with `alpha: true`, and give the ground a program that's black, as opaque as the shadow is dark:

```js
import { Program, Mesh, Plane, Uniform, shadowShading } from 'wtc-gl'

const catcher = new Mesh(gl, {
  geometry: new Plane(gl, { width: 20, height: 20 }),
  program: new Program(gl, {
    vertex: /* glsl */ `#version 300 es
      in vec3 position;
      in vec3 normal;
      uniform mat4 u_modelMatrix;
      uniform mat4 u_viewMatrix;
      uniform mat4 u_projectionMatrix;
      uniform mat4 u_shadowMatrix;
      uniform float u_shadowNormalBias;
      out vec4 v_shadowCoord;
      void main() {
        vec4 world = u_modelMatrix * vec4(position, 1.0);
        vec3 worldNormal = normalize(mat3(u_modelMatrix) * normal);
        v_shadowCoord = u_shadowMatrix *
          vec4(world.xyz + worldNormal * u_shadowNormalBias, 1.0);
        gl_Position = u_projectionMatrix * u_viewMatrix * world;
      }`,
    fragment: /* glsl */ `#version 300 es
      precision highp float;
      ${shadowShading}
      uniform float u_strength;
      in vec4 v_shadowCoord;
      out vec4 colour;
      void main() {
        float dark = 1.0 - shadowFactor(v_shadowCoord);
        colour = vec4(0.0, 0.0, 0.0, dark * u_strength);
      }`,
    uniforms: {
      ...shadow.uniforms,
      u_strength: new Uniform({ name: 'strength', value: 0.35, kind: 'float' })
    },
    transparent: true,
    depthWrite: false
  })
})
catcher.rotation.x = -Math.PI / 2
catcher.updateRotation()
catcher.setParent(scene)
```

Don't add the catcher to the casters. The [icon swarm demo](https://wethegit.github.io/wtc-gl/demos/icon-swarm/) uses one as a backdrop behind its icons.

## Limits

- One directional light with one map: no cascades for large scenes, and no point or spot lights.
- Alpha-masked surfaces, such as leaves cut out with `alphaTest`, cast solid shadows unless you give them a depth program that discards the same fragments.
- An `InstancedMesh` that culls its instances differently against the light's camera and the view camera re-uploads them for each. Set `frustumCulled: false` on it if every instance is in view anyway.

When you're done with a shadow, `shadow.remove()` frees its depth texture, render target and depth programs.

## See also

- [Lights and LitProgram](/lighting/lights), for the light the shadow follows.
- [glTF models](/loading/gltf), to receive shadows on a loaded model.
- API: [Shadow](/api/wtc-gl/classes/Shadow), [ShadowOptions](/api/wtc-gl/interfaces/ShadowOptions), [ShadowCasterOptions](/api/wtc-gl/interfaces/ShadowCasterOptions), [shadowShading](/api/wtc-gl/variables/shadowShading).
