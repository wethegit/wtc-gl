---
'wtc-gl': patch
---

Fix `Renderer.getRenderList` skipping meshes whose program is `transparent` with `depthTest: false` when sorting. These now render last, in the UI group. Also fix the renderer's initial blend-equation state, which used a blend factor (`ONE_MINUS_SRC_ALPHA`) instead of `FUNC_ADD`.
