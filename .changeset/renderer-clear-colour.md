---
'wtc-gl': minor
---

Add `Renderer.clearColour` (and a `clearColour` option), as `[r, g, b, a]`. Unlike calling `gl.clearColor` directly, it's re-applied after the WebGL context is restored. `FragmentShader` and `ParticleSimulation` now set their default clear colours this way, so a `clearColour` in `rendererProps` (or one set in `onInit`) is respected instead of being overwritten.
