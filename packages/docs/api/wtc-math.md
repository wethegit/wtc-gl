# wtc-math

wtc-gl re-exports [wtc-math](https://wethegit.github.io/wtc-math/), so its vectors, matrices and quaternions come from the same import as everything else. {.lead}

```js
import { Vec2, Vec3, Vec4, Mat3, Mat4, Quat } from 'wtc-gl'
```

wtc-math has its own reference: [wethegit.github.io/wtc-math](https://wethegit.github.io/wtc-math/).

A few things to know when using it with wtc-gl:

- Matrices are column-major, as WebGL expects. In a `Mat4`, `a11`–`a14` are the first column, and `a41`–`a43` are the translation.
- Methods ending in `New` (`addNew`, `scaleNew` and so on) return a new vector; the others change the vector in place.
- `.array` gives a vector's or matrix's values as an array, ready for a `Uniform`.
