# wtc-gl

## 2.0.0

### Major Changes

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`e32bebb`](https://github.com/wethegit/wtc-gl/commit/e32bebb12d1d685e46f5723ba87c821d8fd1fe60) Thanks [@liamegan](https://github.com/liamegan)! - Require WebGL2. `Renderer` now only asks for a `webgl2` context and throws `Unable to create a WebGL2 context` if it can't get one. It no longer falls back to WebGL1, which was already broken for image textures.

  **Migrating**

  - **`webgl` option removed.** Delete `webgl: 1` / `webgl: 2` from `new Renderer({...})`.
  - **`renderer.isWebgl2` removed.** It was always true for working code. Remove the checks.
  - **Extension aliases removed.** `renderer.vertexAttribDivisor`, `drawArraysInstanced`, `drawElementsInstanced`, `createVertexArray`, `deleteVertexArray` and `drawBuffers` are gone. Call the same methods on `gl` instead, e.g. `gl.drawBuffers([...])`.
  - **`renderer.bindVertexArray(vao, key?)`** still exists, but now also resets `renderer.currentGeometry` (or sets it to `key`), so a VAO you bind yourself doesn't stop the next `Geometry` draw from binding its own. Use it, rather than `gl.bindVertexArray`, for VAOs you bind between wtc-gl draws.
  - **`renderer.getExtension(name)`** takes just the extension name and returns the extension object or `null`. The second and third arguments (the WebGL2 function name and WebGL1 alias) are gone. Known WebGL2 extensions are typed through the new `WTCGLExtensionMap`. Lookups are cached per context, and the cache is cleared when the context is restored.
  - **`renderer.extensions` removed.** Use `renderer.getExtension(name)`.
  - **Types:** `WTCGLRenderingContext` is now `WebGL2RenderingContext & { renderer, canvas }`. `WTCGLExtensions` is replaced by `WTCGLExtensionMap`.
  - **`Framebuffer.TEXTYPE_HALF_FLOAT_OES`** is deprecated in favour of `Framebuffer.TEXTYPE_HALF_FLOAT` (same value). Half-float framebuffers and render targets always use `gl.HALF_FLOAT` with `RGBA16F`.
  - **`RenderTarget`** depth buffers always default to `DEPTH_COMPONENT24`, or `DEPTH24_STENCIL8` with `stencil`. The WebGL1 `DEPTH_COMPONENT16` / `DEPTH_STENCIL` fallbacks are gone, and `depthTexture` no longer depends on `WEBGL_depth_texture`.
  - **`Texture`** always generates mipmaps when `generateMipmaps` is set, including for non-power-of-two images. Under WebGL1 these silently fell back to no mipmaps, clamped wrapping and linear filtering. An `anisotropy` value on a device without `EXT_texture_filter_anisotropic` is now ignored instead of throwing.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`efbee48`](https://github.com/wethegit/wtc-gl/commit/efbee480923885b392a4970e4578815e21ab5f90) Thanks [@liamegan](https://github.com/liamegan)! - Redesign `TransformFeedback` as a standalone GPU simulation. It now owns its ping-pong state, and simulating is separate from drawing. `step()` runs the simulation program once with rasterisation turned off, and `attribute(name)` gives you an attribute that always holds the latest results, ready to draw with any geometry and program. Simulations can now run without being drawn, be drawn by a different program (and more than one mesh), and be stepped more or less often than they're drawn.

  New:

  - **`staticAttributes`** for per-vertex inputs the simulation reads but doesn't change, such as a rest position or a random seed. They're uploaded once and restored with the context.
  - **Interleaved capture.** Pass `transformFeedbackBufferMode: 'interleaved'` to `Program` to capture every varying into one buffer.
  - **`reset()`** starts the simulation again from the attributes' `data`.
  - **Instanced outputs.** `attribute(name, { instanced: 1 })` returns a per-instance version of an output, for example to draw one instanced shape per simulated vertex. Each option set gets its own attribute, and they all follow the latest results.
  - **Attribute locations come from the linked program**, so simulation shaders no longer need `layout(location = …)`.
  - **`GeometryAttribute` takes `buffer` and `external` options.** An external attribute's buffer is managed elsewhere: `Geometry` never uploads, recreates or deletes it, and re-points its vertex arrays when the buffer is swapped. Bounds aren't computed from an external `position`, since its values live on the GPU, so a mesh using one isn't frustum culled unless you set `geometry.bounds` yourself.
  - **`Program.transformFeedbackVaryings` and `Program.transformFeedbackBufferMode`** are now public and read-only.

  **Migrating**

  Split the vertex shader in two: a simulation shader that writes the captured varyings (with a fragment shader that outputs nothing), and a render shader that reads the simulated attributes. Then:

  ```js
  // Before
  const program = new Program(gl, {
    vertex,
    fragment,
    transformFeedbackVaryings: ['v_position', 'v_velocity']
  })
  const tf = new TransformFeedback(gl, {
    program: program.program,
    transformFeedbacks: {
      a_position: { data: positions, size: 2, varying: 'v_position' },
      a_velocity: { data: velocities, size: 2, varying: 'v_velocity' }
    }
  })
  const mesh = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new PointCloud(gl, { particles: N, transformFeedbacks: tf }),
    program
  })

  // After
  const simulation = new TransformFeedback(gl, {
    program: new Program(gl, {
      vertex: simulateVertex,
      fragment: simulateFragment,
      transformFeedbackVaryings: ['v_position', 'v_velocity']
    }),
    attributes: {
      a_position: { data: positions, size: 2, varying: 'v_position' },
      a_velocity: { data: velocities, size: 2, varying: 'v_velocity' }
    }
  })
  const mesh = new Mesh(gl, {
    mode: gl.POINTS,
    geometry: new Geometry(gl, {
      a_position: simulation.attribute('a_position')
    }),
    program: new Program(gl, { vertex: renderVertex, fragment })
  })

  // Each frame, before rendering
  simulation.step()
  ```

  - **`program`** must be a `Program`. A raw `WebGLProgram` is no longer accepted.
  - **`transformFeedbacks` is renamed `attributes`.** Its per-attribute `type`, `normalize`, `stride`, `offset`, `buffer`, `usage` and `buffertype` options are gone. Attributes are `Float32Array` data, and a single `usage` option (default `gl.DYNAMIC_COPY`) covers all of them.
  - **The attributes must match the program's `transformFeedbackVaryings` exactly.** The constructor throws if a varying has no attribute, more than one attribute, or an attribute's varying isn't captured.
  - **Values that never change**, like a seed that was fed straight back each frame, should move to `staticAttributes`.
  - **`VAOs`, `TFBs` and `BufferRefs` are gone.** Use `attribute(name)` to read the results.
  - **`Geometry`** no longer takes a transform feedback as its third argument, and loses `transformFeedbacks`, `transformFeedbackIndex` and `bindTransformFeedbacks()`.
  - **`PointCloud`** loses its `transformFeedbacks` option.
  - **`remove()`** also deletes the static attributes' buffers. It leaves the program alone, so call `simulation.program.remove()` if nothing else uses it.

### Minor Changes

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`844248c`](https://github.com/wethegit/wtc-gl/commit/844248c09fb0c032b40b6409da983e6de86c1457) Thanks [@liamegan](https://github.com/liamegan)! - Add two ways to smooth a `Curve`:

  - `tension` for `catmullrom` curves (default 0). Higher values shorten the tangents, tightening the curve towards straight lines at 1; values below 0 loosen it. It still passes through every point.
  - A `bspline` type (`Curve.BSPLINE`): a uniform cubic B-spline. Its curvature doesn't change where spans join, so it's smoother than a Catmull-Rom, but it only passes near the points between the ends. An open one starts and ends on the end points, and `closed` makes a smooth loop.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`b1922d7`](https://github.com/wethegit/wtc-gl/commit/b1922d79c0847273bc84d22bf5eb2d87fcb019b1) Thanks [@liamegan](https://github.com/liamegan)! - Add `Curve`, a `Path` through or around a list of points, so it samples evenly by distance and has frames like any path. `new Curve({ points, type, closed, alpha })`:

  - `catmullrom` (the default) passes smoothly through every point. `alpha` sets the knot spacing: 0 is the uniform Catmull-Rom, 0.5 (the default) is centripetal, which doesn't form cusps or loops within a span, and 1 is chordal. `closed` joins the end back to the start, smoothly. Repeated points are skipped.
  - `quadraticbezier` (`p0, c, p1, c, p2, …`) and `cubicbezier` (`p0, c1, c2, p1, …`) chain Bézier spans that share their end points. A point count that doesn't make whole spans throws, rather than dropping points. `closed` adds a straight line back to the start.

  `setPoints(points)` rebuilds a curve with the same options. Also adds `Path.clear()`, which empties a path ready for a new `moveTo`.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`40fed37`](https://github.com/wethegit/wtc-gl/commit/40fed37382dad9abe5f39a673d90b7833253a580) Thanks [@liamegan](https://github.com/liamegan)! - Add an `Extrude` primitive, which turns a 2D outline, with optional `holes`, into a solid along z. It keeps the outline's x and y and centres the solid on z. Outlines can be a `Path` or `Curve`, or a list of points, wound either way. Caps are triangulated with `earcut`, which is now a dependency of wtc-gl.

  - `depth` sets the thickness, and `curveDivisions` how finely curves in a `Path` are sampled.
  - `bevel` rounds the edges between the caps and the sides: `bevelThickness` adds to each end, `bevelSize` insets the caps, and `bevelSegments` sets the roundness (1 is a chamfer).
  - The sides are smooth where they turn by less than `creaseAngle` (default 30°) and hard-edged at sharper corners, both around the outline and across the bevel.
  - UVs are in world units. Caps are projected flat as (x, y), and the straight sides run around the outline and from the back. By default (`uvs: 'projected'`) the bevel is projected like the caps, so a texture runs on from the face over the bevel without a seam. `uvs: 'separate'` maps the bevel like the sides instead.

  Also adds `Path.toPolyline(curveDivisions)`, which samples a path as a polyline that keeps its corners.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`951a223`](https://github.com/wethegit/wtc-gl/commit/951a223a6ef67077b23ab3f32fe7a36d52c5bb58) Thanks [@liamegan](https://github.com/liamegan)! - Add `Geometry.applyMatrix(mat4)`, which bakes a transform into the geometry's data. Positions are transformed by the matrix, and normals by its normal matrix and then re-normalised. 2D and interleaved attributes are supported. A mirroring matrix (negative determinant) also reverses each triangle's winding, so mirrored faces aren't back-face culled. Existing bounds are recomputed. External positions are skipped with a warning.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`c226e68`](https://github.com/wethegit/wtc-gl/commit/c226e68b6267a1ddeab74b789818b2e6c5970d70) Thanks [@liamegan](https://github.com/liamegan)! - Add a `Capsule` primitive: a cylinder with a hemisphere on each end, along the y axis and centred on the origin. `height` is the whole length, tip to tip, like `Cylinder`'s, and a height under twice the `radius` gives a sphere. It also takes `capSegments` (steps in each quarter circle), `radialSegments` and `heightSegments`. It's built with `Lathe.build`, with exact normals.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`555be69`](https://github.com/wethegit/wtc-gl/commit/555be69bbc7235e21888593ea9cae2b235acddf9) Thanks [@liamegan](https://github.com/liamegan)! - Add a `Cylinder` primitive, ported from OGL. It's centred on the origin along the y axis, with separate `radiusTop` and `radiusBottom`, so `radiusTop: 0` gives a cone. It also takes `radialSegments`, `heightSegments`, `thetaStart`/`thetaLength` for a partial sweep, and `openEnded` to leave out the caps. A cap with zero radius is always left out. Side normals lean with the slope between the two radii, and each cap has flat normals and circular uvs.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`bc592ec`](https://github.com/wethegit/wtc-gl/commit/bc592ecb66b683efa7d850b690cdb5168de4889c) Thanks [@liamegan](https://github.com/liamegan)! - Add a `Lathe` primitive, which spins a 2D profile around the y axis. `points` takes `[r, y]` pairs or `Vec2`s, listed bottom to top for outward-facing triangles. It also takes `segments`, plus `phiStart`/`phiLength` for a partial sweep starting from +z, like `Cylinder`. v is spaced by distance along the profile, so textures don't stretch where points are unevenly spaced. Normals are smooth, including at corners in the profile. `Lathe.build()` returns the raw arrays, with optional per-point profile normals, for primitives built from a profile.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`6af1e81`](https://github.com/wethegit/wtc-gl/commit/6af1e81a0282ec8343fe317038e9b0a1bdc6ff31) Thanks [@liamegan](https://github.com/liamegan)! - Add `Geometry.setIndex(index)` to replace a geometry's index after construction. It takes a `GeometryAttribute` or a `Uint16Array`/`Uint32Array`, resets the draw range to the whole new index, and also turns a non-indexed geometry into an indexed one. The old index buffer isn't deleted, because attributes can be shared between geometries.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`47d58fc`](https://github.com/wethegit/wtc-gl/commit/47d58fca7ab0e356ef5ab2815cd560012ecdc595) Thanks [@liamegan](https://github.com/liamegan)! - Add a `Torus` primitive, ported from OGL. It lies in the xy plane, centred on the origin. `radius` goes from the centre to the middle of the tube and `tube` is the tube's radius. `radialSegments` go around the tube and `tubularSegments` around the ring. An `arc` below 2π leaves the ring open, sweeping from +x towards +y.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`0d7a809`](https://github.com/wethegit/wtc-gl/commit/0d7a809ad0244b995a71be8aa7b3b5cc1821686c) Thanks [@liamegan](https://github.com/liamegan)! - Add `Geometry.computeVertexNormals()`, which computes area-weighted normals from the positions for geometry drawn as triangles. Indexed geometry gets smooth normals across shared vertices, and non-indexed geometry gets one normal per face. It writes into the existing `normal` attribute when it's a plain size-3 `Float32Array` of the right length, and adds one otherwise. 2D and interleaved positions are supported; external positions are skipped with a warning.

  `Geometry.addAttribute` now rebuilds the geometry's vertex arrays when it adds or replaces an attribute after the geometry has been drawn. Previously, those vertex arrays kept pointing at the old attributes and ignored the new one.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`cae3472`](https://github.com/wethegit/wtc-gl/commit/cae347270e7f7cfb3050714f173af86260bb617f) Thanks [@liamegan](https://github.com/liamegan)! - Add `Geometry.toNonIndexed()` and `Geometry.mergeVertices(tolerance = 1e-4)`, for switching between flat and smooth shading. Both return a new `Geometry` with its own tightly packed copies of the attributes, including instanced ones, and leave the original unchanged.

  - `toNonIndexed()` gives every index entry its own vertex, so `computeVertexNormals()` then gives one normal per face.
  - `mergeVertices()` welds vertices whose attributes, apart from `normal`, match within the tolerance, so UV seams are kept. It drops vertices the index never uses, keeps the triangle order and winding, and picks a 16- or 32-bit index depending on the vertex count. If the source had normals, they're recomputed, so shared vertices come out smooth.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`8719756`](https://github.com/wethegit/wtc-gl/commit/8719756786bdcf5a4d7a37cead640aa10035acad) Thanks [@liamegan](https://github.com/liamegan)! - Add `mergeGeometries(geometries)`, which combines geometries into one new `Geometry` so they draw in a single call. Use it with `applyMatrix` to build a model from transformed parts. Every input needs the same attributes with the same size, type and normalisation; anything else throws, as do instanced and external attributes. If any input is indexed, the result is indexed: the non-indexed inputs get a sequential index, and indices are rebased onto the merged vertices, 32-bit past 65,536 vertices. The inputs are left unchanged.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`39ab382`](https://github.com/wethegit/wtc-gl/commit/39ab382dbf94d1d16582aaa09c5bfa699124fad1) Thanks [@liamegan](https://github.com/liamegan)! - Add `Path`, a continuous 3D path drawn like a canvas path: `moveTo`, then `lineTo`, `quadraticCurveTo` and `bezierCurveTo`, and optionally `close()`. Points can be `Vec3`s, `Vec2`s (z = 0) or `[x, y]`/`[x, y, z]` arrays, and they're copied, never mutated.

  - Sampling is by distance along the path, including inside curved segments, so `getPoints(divisions)` and `getPointAt(u)` give evenly spaced points. There are also `getPointAtLength`, `getTangentAt`/`getTangentAtLength`, `getTiltAt` and `getLength`. The samplers take an optional `out` vector and don't allocate.
  - `computeFrames(divisions, closed)` returns rotation-minimising tangents, normals and binormals. Each frame is twisted by the per-point tilt (radians, interpolated along each segment) and by an optional `tiltFunction`. On a closed path, the leftover twist is spread around the loop so the last frame matches the first.
  - The segment classes (`LineSegment`, `QuadraticBezierSegment`, `CubicBezierSegment`) are exported for `addSegment`.

  Based on OGL's `Path`, with arc-length sampling inside segments and corrected tilt interpolation.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`15be538`](https://github.com/wethegit/wtc-gl/commit/15be53846026963c98d8f3c000e2907b1cd5b232) Thanks [@liamegan](https://github.com/liamegan)! - Add `Polyline`, a MeshLine for wtc-gl: a line drawn as a strip of triangles that can be any width, taper, dash, carry a texture and draw itself on.

  - By default it's a billboard, extruded in screen space with mitred corners so it always faces the camera. `width` is in CSS pixels, or in world units with `sizeAttenuation`, and `taper: (u, i) => number` scales it along the line. Pixels are measured from the viewport being drawn to, so widths are right in a render target too. Drawn without a camera, the points are in clip space.
  - With `billboard: false` it's a flat ribbon in world space that follows rotation-minimising frames. It starts out facing `facing` (by default the plane its points lie in), `tilt` rolls it about the line, and `bank` leans it into turns in proportion to how tightly it curves.
  - Dashes (`dashArray`, `dashRatio`, `dashOffset`) are measured by the distance travelled. `visibility` draws the line on, and it also supports `map` (settable at any time), `repeat`, `alphaTest` and `opacity`. It turns `transparent` on by default for a map or an opacity below 1, and premultiplies its output when the renderer uses premultiplied alpha.
  - `points` can be a point list, or a `Path` or `Curve` sampled with `toPolyline`. `setPoints` reuses the buffers when the count is unchanged, and `push` adds a point and drops the oldest, for trails. `closed` loops it, and `miterLimit` caps sharp corners.
  - `vertex` and `fragment` take custom shaders, and `uniforms` and `attributes` add to the line's own, including instanced attributes, to draw many lines at once. `polylineExtrude` exports the billboard extrusion as GLSL for custom vertex shaders.

  `Path.computeFrames` now uses the new `rotationMinimisingFrames(tangents, { closed, tilts, normal })`, which works on any list of tangents. Its results are unchanged.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`3263fad`](https://github.com/wethegit/wtc-gl/commit/3263fadaea6ea71672dffcdd3b362da9ea805b92) Thanks [@liamegan](https://github.com/liamegan)! - Add a `Tube` primitive, which sweeps a circle along a `Path` or `Curve`. `new Tube(gl, { path, radius, tubularSegments, radialSegments, closed })`. The rings are spaced evenly by distance and oriented by `path.computeFrames`, so the path's tilt twists the tube. `radius` can be a function of `u` (0 to 1 along the path) for tapers, and the normals lean with the taper so it lights correctly. `closed` defaults to the path's own and joins the last ring onto the first. The ends are open. Based on OGL's `Tube`.

- [#171](https://github.com/wethegit/wtc-gl/pull/171) [`7f68588`](https://github.com/wethegit/wtc-gl/commit/7f68588605f06cb2a69fda3fad98459d8c7ed77d) Thanks [@liamegan](https://github.com/liamegan)! - Require `wtc-math@^1.4.0` and use the type declarations it now ships. wtc-gl no longer bundles its own loose `wtc-math` declarations, so the wtc-math classes it re-exports are now fully typed. Code that relied on the old `[key: string]: any` index signatures may see new type errors, for example `Mat3.fromMat4()` is typed as returning `Mat3 | null`.

## 1.5.0

### Minor Changes

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`16936b8`](https://github.com/wethegit/wtc-gl/commit/16936b87337fd6976a51e53d769994961100ba41) Thanks [@liamegan](https://github.com/liamegan)! - Recover from WebGL context loss:

  - `Renderer` now handles `webglcontextlost` and `webglcontextrestored` on its canvas. While the context is lost, `renderer.contextLost` is `true` and `render()` does nothing. When it's restored, the renderer resets its state and rebuilds every `Program`, `Texture`, `Geometry`, `RenderTarget` and `TransformFeedback` that hasn't been removed.
  - New `renderer.onContextLost` and `renderer.onContextRestored` callbacks, e.g. to show a fallback while the context is gone.
  - New `renderer.track(resource)` / `untrack(resource)` to rebuild your own GL objects on restore. A resource is any object with a `restoreContext()` method. Library resources register themselves and unregister in `remove()`. The renderer only holds them weakly, so keep your own reference to anything you track.
  - Each of those classes has a `restoreContext()` method, called by the renderer.
  - What's lost: render target contents, and transform feedback state, which restarts from each attribute's initial `data`. Buffers passed to `TransformFeedback` through the `buffer` option can't be rebuilt and must be recreated by the caller.
  - `TransformFeedback`'s `program` option now accepts the `Program` as well as its `WebGLProgram`. Pass the `Program` so the feedback can be relinked after a restore.
  - `Renderer.dispose()` removes the context listeners.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`039b232`](https://github.com/wethegit/wtc-gl/commit/039b2323684e536d6c54dea97099f1a448adaf34) Thanks [@liamegan](https://github.com/liamegan)! - The render loop makes almost no garbage. With 1,000 animated meshes it used to allocate about 7.8 KB per mesh per frame; now it's about 70 bytes. In Chrome, a 6,000-mesh scene went from ~45 ms to ~10 ms of CPU per frame.

  - `Obj` updates `matrix`, `worldMatrix` and `quaternion` in place, and `Camera` does the same for `viewMatrix`, `projectionViewMatrix`, `worldPosition` and the frustum planes. The wtc-math methods used before allocate even in their "in place" forms, so these use allocation-free versions of the same formulas.
  - `Mesh.draw` keeps a typed array per matrix and vector uniform, updates `modelViewMatrix` and `normalMatrix` in place, and reuses its option objects.
  - `Renderer.render` reuses its render lists, viewport vectors and draw options, and culls and sorts without temporary objects. `getRenderList()` still returns a new array.
  - `ScrollRenderer` updates its viewport and each scene's `u_resolution`, `u_origin` and `u_elementSize` values in place.

  Behaviour change: those matrices and vectors are now the same objects from frame to frame. Code that kept a reference expecting a snapshot (e.g. `const before = mesh.worldMatrix`) should `clone()` it. Matrix uniform values set by `Mesh` are now `Float32Array`s rather than plain arrays.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - Work without a `window` or `document` when given a canvas, e.g. in a worker, under SSR or in tests:

  - `FragmentShader` and `ParticleSimulation` default `container` to `null` (don't append the canvas) when there's no document, instead of throwing on `document.body`. `container: null` can also be passed explicitly.
  - `Renderer` and `Framebuffer` default `dpr` to 1 when there's no `devicePixelRatio`.
  - `GeometryAttribute` no longer reads `window.WebGLRenderingContext` to pick its default `type`.
  - `Geometry.computeBoundingBox` and `computeBoundingSphere` handle 2D positions (`size: 2`), treating z as 0. They used to read the next vertex's x as z.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`8d6d778`](https://github.com/wethegit/wtc-gl/commit/8d6d778f936979aac97c4ac3c4eb3de507049b34) Thanks [@liamegan](https://github.com/liamegan)! - Programs can set a stencil test and turn off colour writes, so stencil passes no longer need raw `gl.stencilFunc` / `gl.colorMask` calls:

  - `stencil: { func, ref, mask, writeMask, fail, zfail, zpass }` applies a stencil test when the program is used. Anything left out uses the WebGL default, and it can be changed later through `program.stencil`.
  - `colourWrite: false` stops the program writing colour, for passes that only write depth or stencil.
  - The renderer only undoes state it set itself, so programs without these options leave stencil and colour-mask state set directly on the context alone. Before a clear, colour and stencil writes are turned back on if a program turned them off.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - `RenderTarget` now honours its `stencil` and `depthTexture` options, and adds `depthFormat`:

  - `stencil: true` gives the target a stencil buffer. With `depth`, the two share a `DEPTH24_STENCIL8` texture or renderbuffer; on its own it's a `STENCIL_INDEX8` renderbuffer.
  - `depthTexture: false` uses a renderbuffer (`target.depthBuffer`) instead of a depth texture, and a `Texture` can be passed to use as the depth texture. A texture passed in isn't deleted by `remove()`.
  - The depth texture now defaults to `DEPTH_COMPONENT24` under WebGL2 instead of `DEPTH_COMPONENT16`, which z-fought on coplanar faces. Set `depthFormat` to choose another (e.g. `gl.DEPTH_COMPONENT32F`).
  - When rendering to a target, `Renderer.render` now clears the target's own depth and stencil buffers rather than going by the renderer's `depth` and `stencil` settings.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`8d6d778`](https://github.com/wethegit/wtc-gl/commit/8d6d778f936979aac97c4ac3c4eb3de507049b34) Thanks [@liamegan](https://github.com/liamegan)! - Add `RenderTarget.resize(width, height)`. It reallocates the target's textures and depth/stencil buffer in place, keeping the same framebuffer and texture objects, so uniforms holding the textures stay valid. Previously a target had to be removed and recreated to change size.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - Add `Renderer.clearColour` (and a `clearColour` option), as `[r, g, b, a]`. Unlike calling `gl.clearColor` directly, it's re-applied after the WebGL context is restored. `FragmentShader` and `ParticleSimulation` now set their default clear colours this way, so a `clearColour` in `rendererProps` (or one set in `onInit`) is respected instead of being overwritten.

- [#164](https://github.com/wethegit/wtc-gl/pull/164) [`b2485ef`](https://github.com/wethegit/wtc-gl/commit/b2485ef40074cfd1fb683aac8019fce3b849aacd) Thanks [@liamegan](https://github.com/liamegan)! - Add teardown for renderers and fragment shaders:

  - `Renderer.dispose()` clears the renderer's state caches. If the renderer created its own canvas, it also releases the WebGL context straight away. A canvas passed in through the `canvas` option keeps its context, so a new renderer can still use it.
  - `FragmentShader.destroy()` stops the render loop, removes the `resize` listener, deletes the geometry and program, and disposes the renderer. A canvas the renderer created is removed from the DOM; it's returned either way. A `post` framebuffer is left for the caller to remove.
  - `FragmentShader.playing = false` now cancels the pending animation frame, so one more frame no longer renders after pausing.
  - `Program.remove()` now drops its uniform values from the renderer's cache.
  - `ScrollRenderer.destroy()` now calls `Renderer.dispose()`.
  - `FragmentShader`'s `rendererProps` option is now typed as `Partial<RendererOptions>` instead of `object`.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`16936b8`](https://github.com/wethegit/wtc-gl/commit/16936b87337fd6976a51e53d769994961100ba41) Thanks [@liamegan](https://github.com/liamegan)! - Fix fields that could be read before they were set. The library is now compiled with `strictPropertyInitialization`.

  - `Renderer` now throws `Unable to create a WebGL context` when it can't get one. It used to log an error and return a half-built renderer, which threw as soon as it was used.
  - `Camera.frustum` is created up front, so `frustumIntersects` no longer throws when called before `updateFrustum`.
  - `ParticleSimulation` throws a clear error if a custom `createGeometry` doesn't set `this.cloud`.
  - `GeometryAttribute.updateAttribute` does nothing until the attribute has been added to a geometry, instead of uploading to a missing buffer.
  - `Framebuffer` keeps its default size (512) and pixel ratio (1) when given 0 or a negative value, instead of leaving them undefined.
  - `Texture.width`/`height` default to `0` and `Texture.data` to `null` instead of `undefined`. `RenderTarget.stencil` is `false`.

  TypeScript changes. These may need small updates in typed code:

  - Now optional: `Drawable.program` (a plain `Drawable` used as a group has none; `Mesh.program` is still required), `Geometry.bounds` (unset until computed), `Geometry.transformFeedbacks`, `Texture.image` and `ParticleSimulation.cloud`.
  - `GeometryAttribute.buffer` and `WTCGLGeometryAttribute.buffer` are `WebGLBuffer | null`.
  - `FragmentShader.post` and `ParticleSimulation.post` are typed `Framebuffer | null`.
  - `Geometry.computeBoundingBox()` now returns the bounds.
  - Removed unused fields that were never set: `Texture.glState`, `Geometry.glState`, and `RenderTarget.depthBuffer`, `stencilBuffer` and `depthStencilBuffer`.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`85d93ba`](https://github.com/wethegit/wtc-gl/commit/85d93baa0512184d641a8363b9608872b54007fe) Thanks [@liamegan](https://github.com/liamegan)! - More texture sources, and a video texture:

  - `Texture` accepts `ImageBitmap` and `OffscreenCanvas` images, and any integer typed array as `data` (`Uint8Array`, `Uint16Array`, `Int32Array` and so on) as well as `Float32Array`. The new `TextureImage` and `TextureData` types describe these. Image sizes are now read without `instanceof` checks, so textures also work in workers.
  - New `VideoTexture`, which follows a video element and uploads a frame only when the video presents a new one (via `requestVideoFrameCallback`, falling back to every use while playing). It shows an empty pixel until the video has loaded, and has mipmaps off by default. This replaces setting `needsUpdate = true` every frame.

- [#162](https://github.com/wethegit/wtc-gl/pull/162) [`9eb5a54`](https://github.com/wethegit/wtc-gl/commit/9eb5a54d7c7d83bb6c24a58d8e5acefd556d7633) Thanks [@liamegan](https://github.com/liamegan)! - Add disposal for textures and render targets, and fix a GPU memory leak in `Framebuffer`:

  - `Texture.remove()` deletes the WebGL texture and clears it from the renderer's texture-unit cache.
  - `RenderTarget.remove()` deletes the framebuffer and its colour and depth textures. If the target is bound, the canvas is bound in its place.
  - `Framebuffer.remove()` deletes both ping-pong targets.
  - `Framebuffer.resize()` now frees the previous targets. It used to create two new ones on every resize and never delete the old ones. If you keep a reference to `fbo.read.texture` across a resize, read it again after resizing.

- [#166](https://github.com/wethegit/wtc-gl/pull/166) [`16936b8`](https://github.com/wethegit/wtc-gl/commit/16936b87337fd6976a51e53d769994961100ba41) Thanks [@liamegan](https://github.com/liamegan)! - Bind texture uniforms by value and check them against the shader:

  - A `Texture` (or array of textures) now binds as a texture whatever its `kind`. Without `kind: 'texture'` it used to be passed to `gl.uniform1i` as an object. A mismatched `kind` still binds, with a warning.
  - A texture on a uniform the shader doesn't declare as a sampler, a texture whose target doesn't match the sampler (such as a cube map on a `sampler2D`), and a non-texture value on a sampler are now skipped with a warning instead of being sent to WebGL. `null` and texture unit numbers are still accepted on samplers.
  - Each of these warnings is shown once per uniform.
  - WebGL2 sampler types are now uploaded: `sampler3D`, `sampler2DArray`, the shadow samplers, and the `isampler*`/`usampler*` types. They were silently ignored before.
  - `uint`/`uvec2`–`uvec4` and the non-square matrix types (`mat2x3`, `mat2x4`, `mat3x2`, `mat3x4`, `mat4x2`, `mat4x3`) are now uploaded too, with matching `kind` names.

### Patch Changes

- [#165](https://github.com/wethegit/wtc-gl/pull/165) [`5e6b33a`](https://github.com/wethegit/wtc-gl/commit/5e6b33a500e796c9ab86f71e3a9d8855f7a9f565) Thanks [@liamegan](https://github.com/liamegan)! - Fix `GeometryAttribute` counts and bounds for interleaved attributes:

  - An explicit `count` is now used as given. Without a `stride` it used to become `Infinity`, and with a `stride` it was ignored.
  - `computeBoundingBox` / `computeBoundingSphere` now treat `stride` and `offset` as bytes, matching what's passed to `vertexAttribPointer`. They used them as array indices, so bounds for interleaved attributes were read from the wrong values.

## 1.4.1

### Patch Changes

- [#158](https://github.com/wethegit/wtc-gl/pull/158) [`6b30270`](https://github.com/wethegit/wtc-gl/commit/6b30270f3647b2d2fefd9f0ba0a8cf632c5f5038) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Framebuffer` and `RenderTarget` bugs:

  - `Framebuffer.IMAGETYPE_TILING` and `IMAGETYPE_MIRROR` were swapped. `TILING` now uses `REPEAT` and `MIRROR` uses `MIRRORED_REPEAT`. If you used `IMAGETYPE_MIRROR` and relied on it wrapping around, switch to `IMAGETYPE_TILING`.
  - `Framebuffer` with `generateMipmaps: true` now generates mipmaps for the texture it just rendered to, instead of whichever texture happened to be bound.
  - Creating a `RenderTarget` no longer leaves the renderer's cached framebuffer binding out of date. Previously, rendering again into the last-used target after creating a new one could draw to the canvas instead.

- [#160](https://github.com/wethegit/wtc-gl/pull/160) [`eb4f735`](https://github.com/wethegit/wtc-gl/commit/eb4f73537ddfc6ae14aff822ee986898b87ab0bd) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Geometry` bugs and export `Sphere`:

  - `setDrawRange` now works with 32-bit (`Uint32Array`) indices. The draw offset assumed 2-byte indices, which gave an invalid offset and drew nothing.
  - `computeBoundingBox` / `computeBoundingSphere` no longer throw on a geometry with no `position` attribute. The bounds are left unset instead.
  - Transform-feedback draws no longer write a `feedbk` global to `window`.
  - `Sphere` geometry is now exported from the package.

- [#157](https://github.com/wethegit/wtc-gl/pull/157) [`a12126c`](https://github.com/wethegit/wtc-gl/commit/a12126c37063811b266a0f8eaf467954d9cb6344) Thanks [@liamegan](https://github.com/liamegan)! - Fix several `Mesh` bugs:

  - `Mesh.draw` no longer creates new matrix uniforms on every frame. It was checking for `modelMatrix` instead of `u_modelMatrix`, so the check never passed.
  - Drawing a mesh scaled to zero with a camera no longer throws. The previous normal matrix is kept when the model-view matrix can't be inverted.
  - `u_objectPosition` is now the mesh's world position, not its local position, so it's correct for child objects.
  - `removeBeforeRender` / `removeAfterRender` now remove every copy of the callback, including ones registered back to back.

- [#159](https://github.com/wethegit/wtc-gl/pull/159) [`92657ce`](https://github.com/wethegit/wtc-gl/commit/92657ce9ef18439b0dcd99aa215b6ef252abe993) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Program` and `Uniform` bugs:

  - `Program.setBlendEquation()` no longer throws. `blendEquation` now defaults to `FUNC_ADD`.
  - A program that fails to link no longer throws on every frame. It logs the link error once, has the new `linked` flag set to `false`, and meshes using it draw nothing. Its shaders are now deleted when linking fails too.
  - `Program.remove()` clears the renderer's current-program cache when it deletes the active program.
  - `Float32Array` uniform values are now cached by copy, so changes made in place are uploaded on the next draw. `Float32Array` values for `float[]` uniforms are now set at all.

- [#155](https://github.com/wethegit/wtc-gl/pull/155) [`c91a9c5`](https://github.com/wethegit/wtc-gl/commit/c91a9c503c4e94fc31095e1037cfb62ea4a2e358) Thanks [@liamegan](https://github.com/liamegan)! - Fix `Renderer.getRenderList` skipping meshes whose program is `transparent` with `depthTest: false` when sorting. These now render last, in the UI group. Also fix the renderer's initial blend-equation state, which used a blend factor (`ONE_MINUS_SRC_ALPHA`) instead of `FUNC_ADD`.
