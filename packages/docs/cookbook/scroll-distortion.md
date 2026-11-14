# Images that ripple on scroll

Bend the images on a page as it scrolls, by how fast it's scrolling, and let them settle when it stops. {.lead}

The images stay in the page as ordinary `<img>`s, for layout, loading and accessibility, but they're hidden, and a [`ScrollRenderer`](/recipes/scroll-renderer) draws each one in WebGL in its place. Each image gets a `ScrollImage`, which uploads it as a texture and keeps a mesh over the element as the page moves. The page's scroll speed, measured once a frame, goes to every image's vertex shader as a uniform, which bows the image against the direction of travel, and to the fragment shader, which splits its colours a little.

This needs a whole page to show, so there's no live example here. The [image cloth demo](https://wethegit.github.io/wtc-gl/demos/scroll-image-cloth/) takes the same idea further, with images hanging as cloth that the scroll shakes.

## The page

Mark the images to distort, and hide them once WebGL is drawing them. A `ScrollScene` adds `scroll-scene--initialized` to its element when it's added to a renderer, so the images stay visible if WebGL isn't there:

```html
<img class="ripple" src="harbour.jpg" alt="Boats in the harbour at dusk" />
```

```css
.ripple.scroll-scene--initialized {
  opacity: 0;
}
```

`opacity: 0` keeps the image's layout and lets it load, which `display: none` wouldn't.

## The renderer and the scroll speed

One `ScrollRenderer` covers the viewport. Its `onBeforeRender` runs once a frame before any scene, with the milliseconds since the last frame, which makes it the place to measure the scroll:

```js
import { ScrollRenderer, Uniform } from 'wtc-gl'

// Shared by every image's program
const u_bend = new Uniform({ name: 'bend', value: 0, kind: 'float' })

let lastY = window.scrollY
let velocity = 0 // CSS pixels per millisecond, positive scrolling down

const scrollRenderer = new ScrollRenderer({
  rendererProps: { antialias: true, premultipliedAlpha: true },
  onBeforeRender(delta) {
    const y = window.scrollY
    const raw = delta > 0 ? (y - lastY) / delta : 0
    lastY = y
    // Ease towards the measured speed, so the bend rises and settles smoothly
    velocity += (raw - velocity) * (1 - Math.exp(-delta / 80))
    u_bend.value = Math.max(-0.3, Math.min(0.3, velocity * 0.06))
  }
})
Object.assign(scrollRenderer.canvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  pointerEvents: 'none'
})
document.body.appendChild(scrollRenderer.canvas)
```

Measuring per frame, rather than in a `scroll` listener, gives one speed per frame however often the browser reports scrolling. The clamp keeps a flick from folding the image over.

## A scene for each image

Each image gets a `ScrollImage` and a finely divided `Plane`, so it has vertices to bend. The plane is 2 wide and 2 high, -1 to 1 across the element:

```js
import { ScrollImage, Obj, Mesh, Program, Plane } from 'wtc-gl'

const { gl } = scrollRenderer

const scenes = [...document.querySelectorAll('img.ripple')].map((img) => {
  const scene = new ScrollImage({
    gl,
    element: img,
    scene: new Obj(),
    // Draw over the whole canvas, placed by the element, so the bend can
    // reach outside the image's box
    elementSpace: true,
    useViewport: false,
    clipToViewport: false,
    margin: 200
  })
  new Mesh(gl, {
    geometry: new Plane(gl, {
      width: 2,
      height: 2,
      widthSegments: 32,
      heightSegments: 8
    }),
    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: { ...scene.uniforms, u_bend },
      depthTest: false,
      cullFace: 0
    })
  }).setParent(scene.scene)
  scrollRenderer.addScene(scene)
  return scene
})

scrollRenderer.playing = true
```

With `useViewport` and `clipToViewport` off, the scene isn't confined to its element, so the image can bow out past its edges. `margin` keeps it drawing a little before and after the element is on screen, since the bent edge shows first. These are explained under [spilling outside the element](/recipes/scroll-renderer#spilling-outside-the-element). Every image shares the canvas's depth buffer, so `depthTest: false` keeps one from hiding another.

## The shaders

The vertex shader bows the image: the middle lags behind the edges, by more the faster the page moves. Scrolling down moves the content up, so the middle is pulled down. Then it places the plane on the element, using the scene's `u_origin` and `u_elementSize`:

```glsl
#version 300 es
in vec3 position;
in vec2 uv;
uniform vec4 u_origin;
uniform vec2 u_elementSize;
uniform float u_bend;
out vec2 v_uv;

void main() {
  v_uv = uv;
  vec2 p = position.xy;
  p.y -= sin(uv.x * 3.14159) * u_bend;
  gl_Position = vec4(p * u_elementSize * 0.5 + u_origin.zw, 0.0, 1.0);
}
```

The fragment shader fits the image to the element as `object-fit: cover` would, then reads red and blue a little apart, by the same bend:

```glsl
#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_imageSize; // [0, 0] until it loads
uniform vec2 u_resolution;
uniform float u_bend;
in vec2 v_uv;
out vec4 colour;

void main() {
  vec2 image = max(u_imageSize, vec2(1.0));
  float ratio = (u_resolution.x / u_resolution.y) / (image.x / image.y);
  vec2 scale = ratio > 1.0 ? vec2(1.0, 1.0 / ratio) : vec2(ratio, 1.0);
  vec2 uv = (v_uv - 0.5) * scale + 0.5;

  vec2 split = vec2(0.0, u_bend * 0.03);
  float r = texture(u_image, uv + split).r;
  vec4 g = texture(u_image, uv);
  float b = texture(u_image, uv - split).b;
  colour = vec4(r, g.g, b, 1.0) * g.a;
}
```

`u_resolution` is the element's size in device pixels, and only its shape matters here. The last line premultiplies the alpha, to suit `premultipliedAlpha: true`.

## Variations

- Bend along `uv.y` as well, with `p.x += sin(uv.y * 3.14159) * u_bend * 0.2`, for a twist as well as a bow.
- A ripple rather than a bow: `p.y -= sin(uv.x * 12.0 + u_time * 200.0) * u_bend * 0.1`. `u_time` is the scene's own; it grows by about 0.05 a second.
- Give each image its own speed, by measuring its element's `rect.top` in the scene's `onBeforeRender(delta, rect)`, for images that move differently from the page, such as in a horizontal scroller.

## Pitfalls

- Respect reduced motion. When `matchMedia('(prefers-reduced-motion: reduce)')` matches, leave `u_bend` at 0, or don't start the renderer and leave the images showing.
- Images from another origin need CORS headers and `crossorigin="anonymous"` on the `<img>`, or the texture upload fails.
- `layout: 'fixed'`, the default, can show the images lagging behind the page during momentum scrolling on touch devices. `layout: 'absolute'` avoids it; see [fixed or absolute](/recipes/scroll-renderer#fixed-or-absolute).

## Cleaning up

To take one image out while the page carries on, remove its scene and free what it made:

```js
scrollRenderer.removeScene(scene)
scene.destroy() // deletes its texture and disconnects its observer
for (const mesh of scene.scene.children) {
  mesh.geometry.remove()
  mesh.program.remove()
}
```

To take the whole thing down, `scrollRenderer.destroy()` stops the loop, destroys the scenes still added, and frees the WebGL context along with everything in it. It returns the canvas for you to take out of the page:

```js
scrollRenderer.destroy().remove()
```

## See also

- [ScrollRenderer](/recipes/scroll-renderer), for every option, the uniforms and `ScrollImage`
- [Scroll-synced scenes](/getting-started/scroll-synced-scenes), for a first scroll scene
- [useScrollImage](/react/use-scroll-image), to do this in React
- The [image cloth demo](https://wethegit.github.io/wtc-gl/demos/scroll-image-cloth/)
- API: [ScrollRenderer](/api/wtc-gl/classes/ScrollRenderer), [ScrollImage](/api/wtc-gl/classes/ScrollImage), [ScrollSceneOptions](/api/wtc-gl/interfaces/ScrollSceneOptions)
