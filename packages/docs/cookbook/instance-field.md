# A field of instances

Lay thousands of copies of a mesh out on a grid, each with its own colour, and ripple them out from the pointer every frame. {.lead}

One [`InstancedMesh`](/geometry/instancing) draws every copy in a single draw call, reading each one's matrix and colour from a buffer. The work left each frame is on the CPU: working out thousands of matrices and colours and copying them in. Done with a few reused objects and no allocations, that's a small job, even for four thousand.

Move the pointer over the field.

<Example src="cookbook-field" :height="360" demo="many-meshes" />

<<< @/examples/cookbook-field.js

## The instanced mesh

Make one geometry, a program that reads the instance data, and room for every instance:

```js
import { Box, InstancedMesh, LitProgram, Lights } from 'wtc-gl'

const SIDE = 64
const COUNT = SIDE * SIDE

const box = new Box(gl, { width: 0.16, height: 1, depth: 0.16 })
const program = new LitProgram(gl, { lights: new Lights(), instanced: true })
const field = new InstancedMesh(gl, {
  geometry: box,
  program,
  count: COUNT,
  frustumCulled: false
})
```

The box is one unit tall, so an instance's y scale is its height.

`frustumCulled: false` skips testing each instance against the camera. The test only pays when a good share of the instances are off screen; when they're all in view, as here, it's work for nothing. Leave it on for a field that stretches past the edges of the screen.

## Working out the layout once

Anything that doesn't change belongs outside the frame loop. The grid positions are worked out once, into typed arrays:

```js
const GAP = 0.2
const half = ((SIDE - 1) * GAP) / 2
const xs = new Float32Array(COUNT)
const zs = new Float32Array(COUNT)
for (let i = 0; i < COUNT; i++) {
  xs[i] = (i % SIDE) * GAP - half
  zs[i] = Math.floor(i / SIDE) * GAP - half
}
```

## Writing matrices cheaply

The [instancing guide](/geometry/instancing#placing-instances) composes each matrix on a spare `Obj`, which handles any position, rotation and scale. For a field that only moves and scales, write the matrix's fields directly: there's no rotation to compose, so it's a handful of assignments. Keep one `Mat4` and reuse it for every instance:

```js
import { Mat4 } from 'wtc-gl'

const matrix = new Mat4() // the identity

for (let i = 0; i < COUNT; i++) {
  const h = heightAt(xs[i], zs[i], time)
  matrix.a22 = h // y scale
  matrix.a41 = xs[i] // position
  matrix.a42 = h / 2 // stand it on the ground
  matrix.a43 = zs[i]
  field.setMatrixAt(i, matrix)
}
```

`a11`, `a22` and `a33` are the scale along x, y and z when there's no rotation, and `a41`, `a42` and `a43` the position. `setMatrixAt` copies the numbers in, so the same `Mat4` can be changed and passed again straight away. Everything uploads in one go on the next draw.

The same goes for colours. `setColourAt` copies three numbers from any array, so fill one array and pass it each time:

```js
const colour = [0, 0, 0]

const t = Math.min(h / 1.2, 1)
colour[0] = 0.29 + 0.66 * t
colour[1] = 0.62 - 0.2 * t
colour[2] = 1 - 0.74 * t
field.setColourAt(i, colour)
```

Avoid `new`, array literals and methods that return new vectors in the loop. At 4,096 instances, one allocation each is four thousand objects a frame for the garbage collector, and its pauses show as stutters.

## Following the pointer

The ripple's centre is where the pointer meets the ground. Cast from the camera through the pointer and meet the plane y = 0, writing into a vector you keep:

```js
import { Raycast, Vec3 } from 'wtc-gl'

const raycast = new Raycast()
const up = new Vec3(0, 1, 0)
const origin = new Vec3(0, 0, 0)
const target = new Vec3()

const onMove = (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const y = 1 - ((e.clientY - rect.top) / rect.height) * 2
  inside = !!raycast
    .castMouse(camera, [x, y])
    .intersectPlane(up, origin, target)
}
```

There's no need to test the instances themselves, which would mean thousands of boxes per cast. `intersectPlane` returns null when the pointer is above the horizon, which the example treats as having left.

In the frame loop, ease a centre towards `target`, and the ripple's strength towards 1 while the pointer is over the field and 0 when it leaves, so the ripple settles rather than stopping dead:

```js
const ease = 1 - Math.exp(-delta * 6)
centre.x += (target.x - centre.x) * ease
centre.z += (target.z - centre.z) * ease
strength += ((inside ? 1 : 0) - strength) * ease
```

Then each instance's height is a gentle wave plus a ripple that dies away with its distance from the centre.

## Going further

- Tens of thousands of instances make the loop itself the cost. Move the height into a vertex shader instead: give the instances a fixed matrix, and pass the pointer and time as uniforms. The [instancing guide](/geometry/instancing#programs-for-instances) shows a vertex shader that reads `instanceMatrix`. Turn off culling then, since the test can't see what the shader moves.
- To pick single instances, `intersectMeshes(field)` returns hits with an `instanceId`, as in [Raycast](/interaction/raycast#instances).
- An instanced field can cast [shadows](/lighting/shadows). With `frustumCulled: false`, its instances upload once a frame rather than once for each camera.

## See also

- [Instancing](/geometry/instancing), for `InstancedMesh` in full
- [Pick and drag](/cookbook/pick-and-drag), for more on casting onto a plane
- The [many-meshes demo](https://wethegit.github.io/wtc-gl/demos/many-meshes/), comparing thousands of meshes with one `InstancedMesh`
- API: [InstancedMesh](/api/wtc-gl/classes/InstancedMesh), [InstancedMeshOptions](/api/wtc-gl/interfaces/InstancedMeshOptions), [Raycast](/api/wtc-gl/classes/Raycast)
