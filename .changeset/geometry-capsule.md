---
'wtc-gl': minor
---

Add a `Capsule` primitive: a cylinder with a hemisphere on each end, along the y axis and centred on the origin. `height` is the whole length, tip to tip, like `Cylinder`'s, and a height under twice the `radius` gives a sphere. It also takes `capSegments` (steps in each quarter circle), `radialSegments` and `heightSegments`. It's built with `Lathe.build`, with exact normals.
