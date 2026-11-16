---
'wtc-gl': minor
---

Add `Shadow`, a shadow map for the `Lights` directional light. Casters are added with `shadow.add(node)`, and `LitProgram` and `GLTFLoader` take a `shadow` to receive it, with hardware-filtered soft edges. `Texture` gains `compareFunc` for depth comparison, `shadowShading` exports the lookup for custom shaders, and `litShade` takes an optional shadow factor.
