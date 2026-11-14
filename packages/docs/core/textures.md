# Textures

A `Texture` holds an image or an array of data for shaders to sample, along with how it's wrapped and filtered. {.lead}

Make a texture from an image, a canvas, a video or a typed array, and pass it to a program as a [uniform](/core/uniforms) with the kind `'texture'`. Nothing is uploaded until the texture is first drawn with; after that, it's uploaded again only when you say it changed.

<Example src="textures" :height="360" />

<<< @/examples/textures.js

## Loading an image

`Texture.fromURL` fetches an image and decodes it off the main thread with `createImageBitmap`. It returns a promise of the texture, and takes the same options as the constructor:

```js
import { Texture, Uniform } from 'wtc-gl'

const texture = await Texture.fromURL(gl, '/images/photo.jpg', {
  wrapS: gl.REPEAT,
  wrapT: gl.REPEAT
})
const u_map = new Uniform({ name: 'map', value: texture, kind: 'texture' })
```

The promise rejects if the request fails, with the status in the message. Pass a `signal` to abort it, for instance when the page or component it's for goes away:

```js
const controller = new AbortController()

Texture.fromURL(gl, url, { signal: controller.signal })
  .then((texture) => (u_map.value = texture))
  .catch((error) => {
    if (error.name !== 'AbortError') throw error
  })

// Later
controller.abort()
```

`Texture.fromBlob` does the decoding half, for a blob you already have, such as a file the visitor picked:

```js
input.addEventListener('change', async () => {
  u_map.value = await Texture.fromBlob(gl, input.files[0])
})
```

Until it arrives, a uniform can hold a placeholder, such as `new Texture(gl)`, which is a single transparent pixel, and swap to the loaded texture by setting `value`.

### Other images

The constructor takes an `image`: an `HTMLImageElement`, `HTMLCanvasElement`, `HTMLVideoElement`, `ImageBitmap` or `OffscreenCanvas`. Its size is read from the image when it's uploaded. An `<img>` needs to have loaded first:

```js
const image = new Image()
image.src = '/images/photo.jpg'
await image.decode()

const texture = new Texture(gl, { image })
```

A canvas is a convenient way to draw a texture, as the example above does, or to put text on one.

## Flipping and alpha

Images are stored top row first, but texture coordinates start at the bottom. `flipY` flips the image as it's uploaded so that `uv` (0, 0) is the bottom left of the picture. It's on by default for 2D textures, and off for cube maps and render targets.

`premultiplyAlpha` multiplies the colour by alpha on upload. It's off by default; turn it on to blend with `gl.ONE, gl.ONE_MINUS_SRC_ALPHA` or for a renderer made with `premultipliedAlpha: true`.

An `ImageBitmap` ignores both, because the browser applies them when it decodes the image. `Texture.fromURL` and `fromBlob` handle that for you, passing your `flipY` and `premultiplyAlpha` to `createImageBitmap`. If you make an `ImageBitmap` yourself, use `imageOrientation: 'flipY'` and `premultiplyAlpha: 'premultiply'` there instead.

## Wrapping and filtering

`wrapS` and `wrapT` decide what happens outside 0 to 1, across and up: `gl.CLAMP_TO_EDGE` (the default), `gl.REPEAT` or `gl.MIRRORED_REPEAT`.

`magFilter` is used when a texel covers more than a pixel and `minFilter` when it covers less. `magFilter` defaults to `gl.LINEAR`. `minFilter` defaults to `gl.NEAREST_MIPMAP_LINEAR` when mipmaps are on and `gl.LINEAR` when they're off.

```js
// Smooth at a distance: blend between and within mipmap levels
const ground = new Texture(gl, {
  image,
  wrapS: gl.REPEAT,
  wrapT: gl.REPEAT,
  minFilter: gl.LINEAR_MIPMAP_LINEAR,
  anisotropy: 8
})

// Pixel art: hard edges, no mipmaps
const sprite = new Texture(gl, {
  image,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  generateMipmaps: false
})
```

- `generateMipmaps` (default `true`) builds the smaller copies a mipmapped `minFilter` reads, after every upload. WebGL2 can mipmap textures of any size. Turn it off for textures you upload often and never draw small.
- `anisotropy` sharpens textures seen at a steep angle, such as a floor. It's capped at what the device supports, and 0 (the default) turns it off.

## Data textures

Pass a typed array as `data`, with its `width` and `height`, to make a texture from numbers: a lookup table, a noise field, or the state of a simulation. `height` defaults to `width`.

```js
// Four RGBA colours in a row
// prettier-ignore
const colours = new Uint8Array([
  74, 158, 255, 255,
  242, 107, 66, 255,
  250, 200, 50, 255,
  30, 30, 40, 255
])

const palette = new Texture(gl, {
  data: colours,
  width: 4,
  height: 1,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  generateMipmaps: false
})
```

`format` (default `gl.RGBA`), `type` (default `gl.UNSIGNED_BYTE`) and `internalFormat` (default the same as `format`) describe the data. The array has to match `type`: a `Uint8Array` for `gl.UNSIGNED_BYTE`, a `Float32Array` for `gl.FLOAT`, a `Uint16Array` for `gl.HALF_FLOAT`. Float data also needs a sized `internalFormat`, such as `gl.RGBA32F` for `gl.FLOAT` or `gl.RGBA16F` for `gl.HALF_FLOAT`:

```js
// 64 × 64 texels of four floats each
const state = new Texture(gl, {
  data: new Float32Array(64 * 64 * 4),
  width: 64,
  type: gl.FLOAT,
  internalFormat: gl.RGBA32F,
  minFilter: gl.NEAREST,
  magFilter: gl.NEAREST,
  generateMipmaps: false,
  flipY: false
})

// One float per texel
const heights = new Texture(gl, {
  data: new Float32Array(256 * 256),
  width: 256,
  format: gl.RED,
  internalFormat: gl.R32F,
  type: gl.FLOAT,
  generateMipmaps: false
})
```

`flipY` applies to data as well, so turn it off when rows of the array should map to rows of texels in order, as they do in the state texture above.

Rows of data are expected to start on 4-byte boundaries. When they don't, such as single-byte `gl.RED` data an odd number of texels wide, set `unpackAlignment: 1`.

::: tip
Linear filtering of 32-bit float textures needs the `OES_texture_float_linear` extension, which the renderer turns on where it's available. Use `gl.NEAREST` or `gl.HALF_FLOAT` data when you can't rely on it, and leave mipmaps off for float textures.
:::

## Updating a texture

Setting `image` to a different image uploads it the next time the texture is used. When the same canvas, video or array has new contents, set `needsUpdate`:

```js
drawOn(canvas)
texture.needsUpdate = true
```

Wrapping, filtering and `anisotropy` don't need it. Change them at any time and they apply the next time the texture is used, without uploading the image again.

To resize a data texture, set `width`, `height` and `data` together, then `needsUpdate`.

## Video

`VideoTexture` follows an `HTMLVideoElement`. It uploads a frame only when the video presents a new one (using `requestVideoFrameCallback`), so you don't need to set `needsUpdate` every frame. In browsers without `requestVideoFrameCallback`, it uploads every time it's used while the video plays.

```js
import { VideoTexture, Uniform } from 'wtc-gl'

const video = document.createElement('video')
video.src = '/media/loop.mp4'
video.muted = true
video.loop = true
video.playsInline = true
video.play()

const texture = new VideoTexture(gl, { video })
const u_video = new Uniform({ name: 'video', value: texture, kind: 'texture' })
```

The video doesn't need to have loaded: until it has a frame, the texture is a single transparent pixel. It takes the other texture options too, except that `generateMipmaps` defaults to `false`, because rebuilding mipmaps for every frame is costly. `texture.remove()` stops following the video. See it in the [video texture demo](https://wethegit.github.io/wtc-gl/demos/video-texture/).

## Cube maps

Set `target` to `gl.TEXTURE_CUBE_MAP` and pass six images, in the order +X, −X, +Y, −Y, +Z, −Z, and read it with a `samplerCube`:

```js
const sky = new Texture(gl, {
  target: gl.TEXTURE_CUBE_MAP,
  image: [px, nx, py, ny, pz, nz]
})
```

`flipY` defaults to `false` for cube maps. Until the images are set, each face is a transparent pixel. A cube map on a `sampler2D`, or a 2D texture on a `samplerCube`, is skipped with a warning, since WebGL won't draw with the wrong kind.

## Depth textures

A [render target](/core/render-targets) can keep its depth buffer as a texture, to read in a later pass. Set its `compareFunc`, such as `gl.LEQUAL`, and a `sampler2DShadow` compares a depth against it as it samples, returning how much passes rather than the depth itself. With `gl.LINEAR` filtering, each sample blends four comparisons, which softens edges for free. Like the filtering, it can be changed at any time, and applies the next time the texture is used. [`Shadow`](/lighting/shadows) uses this for its shadow map.

## Cleaning up

`texture.remove()` deletes the WebGL texture. It can't be used afterwards. See [cleaning up](/core/cleaning-up).

## Related

- [Uniforms](/core/uniforms), for passing textures to shaders
- [Render targets](/core/render-targets), for drawing into textures
- [Loading glTF](/loading/gltf), which makes textures for a model's materials
- API: [Texture](/api/wtc-gl/classes/Texture), [TextureOptions](/api/wtc-gl/interfaces/TextureOptions), [VideoTexture](/api/wtc-gl/classes/VideoTexture), [VideoTextureOptions](/api/wtc-gl/interfaces/VideoTextureOptions)
