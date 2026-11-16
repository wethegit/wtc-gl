# Installation

Install wtc-gl from npm, and set up your bundler to import GLSL files as strings. {.lead}

## Install the package

::: code-group

```sh [npm]
npm install wtc-gl
```

```sh [pnpm]
pnpm add wtc-gl
```

```sh [yarn]
yarn add wtc-gl
```

:::

Everything is a named export from `wtc-gl`, including the vectors and matrices from [wtc-math](https://wethegit.github.io/wtc-math/), which it depends on:

```js
import { Renderer, Mesh, Program, Vec3, Mat4 } from 'wtc-gl'
```

wtc-gl ships ES modules and a CommonJS build, with TypeScript types.

## Browser support

wtc-gl needs WebGL2, which every current browser supports. Version 1 also ran on WebGL1; if you're upgrading, the [changelog](https://github.com/wethegit/wtc-gl/blob/master/packages/wtc-gl/CHANGELOG.md) lists what changed and how to migrate.

## Shaders as files

Shaders are strings, so they can live inline in your JavaScript. For anything longer, keep them in `.vert`, `.frag` and `.glsl` files and have your bundler import them as strings. With [Vite](https://vite.dev), add [vite-plugin-glsl](https://github.com/UstymUkhman/vite-plugin-glsl):

::: code-group

```js [vite.config.js]
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()]
})
```

```js [main.js]
import vertex from './shaders/scene.vert'
import fragment from './shaders/scene.frag'
```

:::

For TypeScript, declare the modules once:

```ts [shaders.d.ts]
declare module '*.vert' {
  const source: string
  export default source
}
declare module '*.frag' {
  const source: string
  export default source
}
declare module '*.glsl' {
  const source: string
  export default source
}
```

## React

The [React package](/react/) wraps `ScrollRenderer` in a provider and hooks. It needs React 18 or later, and wtc-gl alongside it:

```sh
npm install @wethegit/react-wtc-gl wtc-gl
```

## Optional extras

Some features use packages you install only if you need them:

- **CSG** works with [manifold-3d](https://github.com/elalish/manifold). wtc-gl doesn't depend on it; you load it and pass it in.
