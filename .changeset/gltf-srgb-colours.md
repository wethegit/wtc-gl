---
'wtc-gl': minor
---

`GLTFLoader` converts base colour and emissive factors, and `COLOR_0` vertex colours, from glTF's linear values to sRGB, the space `LitProgram` shades in. Loaded models now show the colours they had in the modelling tool, where before they came out darker and more saturated.
