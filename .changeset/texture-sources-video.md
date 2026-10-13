---
'wtc-gl': minor
---

More texture sources, and a video texture:

- `Texture` accepts `ImageBitmap` and `OffscreenCanvas` images, and any integer typed array as `data` (`Uint8Array`, `Uint16Array`, `Int32Array` and so on) as well as `Float32Array`. The new `TextureImage` and `TextureData` types describe these. Image sizes are now read without `instanceof` checks, so textures also work in workers.
- New `VideoTexture`, which follows a video element and uploads a frame only when the video presents a new one (via `requestVideoFrameCallback`, falling back to every use while playing). It shows an empty pixel until the video has loaded, and has mipmaps off by default. This replaces setting `needsUpdate = true` every frame.
