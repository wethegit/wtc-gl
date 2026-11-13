---
'wtc-gl': minor
---

Add `LitProgram` and `Lights`, a built-in lit program for any mesh with positions and normals.

- `LitProgram` shades with Lambert diffuse and an optional Blinn-Phong highlight (`specular`, `shininess`), over a `colour`, a texture `map` read with `uv`, or both. `opacity` and `alphaTest` work as on `Polyline`, and the output is premultiplied when the renderer is.
- `flatShading` shades each triangle from its face normal without needing `toNonIndexed`. `vertexColours` multiplies by a `colour` attribute, and `doubleSided` draws and lights the back faces. These three change the shaders, so they're set when the program is made. The colour, opacity, map, specular and shininess can be changed at any time.
- `Lights` holds one directional light (`direction`, `colour`, `intensity`), a sky/ground hemisphere and flat `ambient` light, all in world space. Programs given the same `Lights` share its uniforms, so changing a light updates every one of them without allocating.
- `litShading` exports the lighting as GLSL for custom shaders: the light uniforms and `litShade(base, normal, view, viewRotation, specular, shininess)`. Add it after the shader's precision statement and spread `lights.uniforms` into the program's uniforms.
