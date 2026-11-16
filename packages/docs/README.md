# wtc-gl docs

The documentation site, built with [VitePress](https://vitepress.dev) and published at `/wtc-gl/docs/` alongside the demos.

```sh
pnpm docs:dev            # from the repo root: API pages, then the dev server
pnpm --filter wtc-gl-docs build
```

- Guides are Markdown pages in the section folders (`getting-started/`, `core/`, `geometry/` and so on). The sidebar is in `.vitepress/config.mts`.
- `api/wtc-gl/` and `api/react/` are generated from TSDoc by TypeDoc (`pnpm run api`) and aren't committed. The build fails on an undocumented export or a dead link.
- Live examples are modules in `examples/`, shown with `<Example>`.

## Writing a page

Each page starts with a title and a one-sentence lead, marked `{.lead}`:

```md
# Shadows

Cast shadows from the directional light onto lit meshes. {.lead}
```

Then explain the idea in a paragraph or two, show it working, and work through the options a reader actually reaches for, each under its own `##` heading. Finish with links to related pages and the API reference.

- Write plainly, in British English (colour, normalise, centre). Short sentences; say what something does and why you'd use it. No "simply", "just", "easy" or "powerful".
- Code is complete enough to paste: imports, then the setup. Use the library's real names and options; check them against the source in `packages/wtc-gl/src` rather than memory.
- Link to API pages by path, without the extension: `[LitProgram](/api/wtc-gl/classes/LitProgram)`, `[ShadowOptions](/api/wtc-gl/interfaces/ShadowOptions)`. Link to other guides the same way: `[Cameras](/core/cameras)`. Only link to pages that exist; the build fails on dead links.
- Use `::: tip` and `::: warning` containers sparingly, for things that trip people up.
- Larger demos live at `https://wethegit.github.io/wtc-gl/demos/<name>/`.

## Live examples

An example is a module in `examples/` whose default export takes the element to draw into and returns the example:

```js
import { Renderer, Vec2 } from 'wtc-gl'

export default function (container) {
  // See-through, so the panel's light or dark background shows
  const renderer = new Renderer({
    dpr: Math.min(devicePixelRatio, 2),
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    clearColour: [0, 0, 0, 0]
  })
  container.appendChild(renderer.gl.canvas)
  // ...build the scene

  return {
    frame(time, delta) {
      // time and delta in seconds; only called while on screen
    },
    resize(width, height) {
      renderer.dimensions = new Vec2(width, height)
    },
    dispose() {
      // remove() what you made, then:
      renderer.dispose() // loses the WebGL context
      renderer.gl.canvas.remove()
    }
  }
}
```

Show it on a page with its source under it:

```md
<Example src="lit-scene" :height="360" demo="lighting" />

<<< @/examples/lit-scene.js
```

`<Example>` makes the example when it nears the screen, only calls `frame` while it's visible, and disposes of it when it's far away, so a page can have several. Keep examples small (20–60 lines) and focused on the page's idea. Don't add a render loop of your own, and don't listen to window resize. Keep the canvas see-through as above (`alpha` defaults to false, which turns a transparent clear black, and `premultipliedAlpha` avoids dark edges with antialiasing), since the panel follows the light and dark themes. `examples/first-shader.js` is a working example.
