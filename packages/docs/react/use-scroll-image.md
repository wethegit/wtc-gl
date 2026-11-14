# useScrollImage

Draw a scene from an `<img>`, with the image uploaded as a texture. {.lead}

`useScrollImage(ref, setup, options)` works like [`useScrollScene`](/react/use-scroll-scene), but makes a [ScrollImage](/recipes/scroll-renderer#scrollimage): a scene that uploads an image to a texture and adds two uniforms for it, `u_image` and `u_imageSize`. Use it for effects on the images on a page: distortions, transitions, hover ripples.

```tsx
import { useRef } from 'react'
import { Mesh, Program, Triangle } from 'wtc-gl'
import { useScrollImage } from '@wethegit/react-wtc-gl'

const vertex = /* glsl */ `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}`

const fragment = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec4 u_origin;
uniform float u_time;
out vec4 colour;

void main() {
  vec2 uv = (gl_FragCoord.xy - u_origin.xy) / u_resolution;
  uv.x += sin(uv.y * 20.0 + u_time * 80.0) * 0.005;
  colour = texture(u_image, uv);
}`

export function WavyImage({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement>(null)

  useScrollImage(ref, ({ gl, scrollScene }) => {
    const geometry = new Triangle(gl)
    const program = new Program(gl, {
      vertex,
      fragment,
      // The scene's uniforms, plus u_image and u_imageSize
      uniforms: { ...scrollScene.uniforms }
    })
    new Mesh(gl, { geometry, program }).setParent(scrollScene.scene)

    return () => {
      geometry.remove()
      program.remove()
      scrollScene.texture.remove()
    }
  })

  return <img ref={ref} src={src} alt={alt} className="wavy-image" />
}
```

## What it makes

Everything [useScrollScene](/react/use-scroll-scene) does, with a `ScrollImage` in place of the `ScrollScene`. On top of `u_time`, `u_resolution` and `u_origin`, its uniforms have:

| Uniform       | Type        | What it holds                                             |
| ------------- | ----------- | --------------------------------------------------------- |
| `u_image`     | `sampler2D` | The image.                                                |
| `u_imageSize` | `vec2`      | Its natural size in pixels, `[0, 0]` until it has loaded. |

If the image hasn't loaded when the scene is made, the texture is filled once it has. Until then `u_image` is a single transparent pixel.

The texture is the image as it is, so an element whose shape differs from the image's shows it stretched. Use `u_imageSize` to crop it in the shader, as [ScrollRenderer](/recipes/scroll-renderer#scrollimage) shows for `object-fit: cover`.

## The image element

The ref is both the element the scene is drawn in and, by default, the image it uploads. The `<img>` stays in the page, so the browser loads it and lays it out, and it's there for screen readers and when WebGL isn't. Hide it once the scene is running, with the class the scene adds to it:

```css
.wavy-image.scroll-scene--initialized {
  opacity: 0;
}
```

`opacity` keeps its size and place; `display: none` would leave the scene with nothing to track. An image from another origin needs CORS headers and `crossOrigin="anonymous"` on the `<img>` to be uploaded.

## Options

The third argument takes the [ScrollScene options](/recipes/scroll-renderer#scrollscene), the same as [useScrollScene's](/react/use-scroll-scene#options), plus `image`. `gl`, `element` and `scene` come from the provider, the ref and the hook. See [UseScrollImageOptions](/api/react/type-aliases/UseScrollImageOptions).

`image` uploads a different `<img>` from the element in the ref. Use it to draw into a wrapper, larger than the image or with other content, or to track a placeholder while the image itself stays hidden:

```tsx
import { useRef, useState } from 'react'
import { useScrollImage } from '@wethegit/react-wtc-gl'

import { setup } from './card-setup' // a setup function, as above

function Card({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // Made once, before the scene, so it can be passed in
  const [image] = useState(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    return img
  })

  useScrollImage(ref, setup, { image })

  return <div ref={ref} className="card" />
}
```

Like every option but the callbacks, `image` is read once, when the scene is made. Changing it, or the `<img>`'s `src`, doesn't upload a new image. Give the component a `key` from the image, so a new image remounts it and makes a new scene.

## Cleaning up

On unmount the hook removes and destroys the scene, then calls your cleanup. Destroying a `ScrollImage` doesn't free its texture, so remove `scrollScene.texture` in your cleanup, as the first example does, along with your programs and geometry.

## The returned ref

The hook returns a ref to the live `ScrollImage`, or `null` before it's made. From it you can reach `u_image`, `u_imageSize` and `texture` as well as the scene's own uniforms. As with [useScrollScene](/react/use-scroll-scene#the-returned-ref), read it in callbacks and effects, not while rendering.

## Related

- [useScrollScene](/react/use-scroll-scene), for the setup function and options
- [ScrollRenderer](/recipes/scroll-renderer#scrollimage), for `ScrollImage` and fitting images
- [Textures](/core/textures)
- The [image cloth demo](https://wethegit.github.io/wtc-gl/demos/scroll-image-cloth/), which does this without React
- API: [useScrollImage](/api/react/functions/useScrollImage), [UseScrollImageOptions](/api/react/type-aliases/UseScrollImageOptions), [ScrollImage](/api/wtc-gl/classes/ScrollImage)
