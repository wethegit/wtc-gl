---
'wtc-gl': minor
---

Add `FlyCamera`, a camera that flies forward on its own and is steered like a plane: drag like a joystick, W/S or the up and down arrows to pitch, A/D or the left and right arrows to turn, Q/E to roll, R/F to change speed and space to stop. With `accelerationMode`, holding W/S or the up and down arrows boosts, or brakes and then reverses (up to `maxReverseSpeed`), instead, returning quickly to the cruising speed once let go; `currentSpeed` includes the boost. Held keys ramp up and turns die away the same at any frame rate, keys are ignored while typing in a field, and `keyTarget` scopes the keys to one element. Use it with a `Stage` through `stage.camera`.
