---
'wtc-gl': minor
---

Programs can set a stencil test and turn off colour writes, so stencil passes no longer need raw `gl.stencilFunc` / `gl.colorMask` calls:

- `stencil: { func, ref, mask, writeMask, fail, zfail, zpass }` applies a stencil test when the program is used. Anything left out uses the WebGL default, and it can be changed later through `program.stencil`.
- `colourWrite: false` stops the program writing colour, for passes that only write depth or stencil.
- The renderer only undoes state it set itself, so programs without these options leave stencil and colour-mask state set directly on the context alone. Before a clear, colour and stencil writes are turned back on if a program turned them off.
