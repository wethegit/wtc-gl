---
'wtc-gl': minor
---

Add `Program.setShaders` and scissoring through the renderer.

- `program.setShaders({ vertex, fragment })` replaces a program's shaders, keeping its uniforms and state. Either source can be left out. If the new shaders fail to compile or link, the reason is logged and the program keeps drawing with the old ones, so a broken edit never blanks the screen. The current sources are available as `program.vertex` and `program.fragment`.
- `LitProgram`'s `flatShading`, `vertexColours`, `doubleSided` and `instanced`, and `NormalProgram`'s `space`, `flatShading`, `doubleSided` and `instanced`, can now be changed after the program is made. Changing one recompiles the shaders.
- `renderer.setScissor(size, position)` sets the scissor rect, and `render({ scissor })` keeps a render's clear and drawing inside its viewport (`true`) or a given rect, turning the scissor test off again afterwards.
- `ScrollRenderer` scissors through the renderer instead of calling `gl.scissor` and `gl.enable(gl.SCISSOR_TEST)` directly. The scissor test is now only on while a clipped scene renders, not during the scenes' `onBeforeRender` and `onAfterRender` callbacks, so renders made there (into a render target, say) are no longer clipped to the previous scene's rect.
