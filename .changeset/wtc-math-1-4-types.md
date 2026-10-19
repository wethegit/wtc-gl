---
'wtc-gl': minor
---

Require `wtc-math@^1.4.0` and use the type declarations it now ships. wtc-gl no longer bundles its own loose `wtc-math` declarations, so the wtc-math classes it re-exports are now fully typed. Code that relied on the old `[key: string]: any` index signatures may see new type errors, for example `Mat3.fromMat4()` is typed as returning `Mat3 | null`.
