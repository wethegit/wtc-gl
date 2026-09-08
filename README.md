# wtc-gl

ES6 Web GL library for simple WebGL work. Much of this 1.0 version has been adapted from and inspired by Three.js and OGL.

See [the documentation](https://wethegit.github.io/wtc-gl/) for details.

## Linking into another project during development

To test unpublished changes to `wtc-gl` or `@wethegit/react-wtc-gl` in a consuming project, use [`yalc`](https://github.com/wclr/yalc) rather than `npm link`/`yarn link` - the consumer's bundler otherwise resolves the linked package's peer dependencies (e.g. `react`) relative to this repo's `node_modules`, which can pull in a second copy of React and cause "Invalid hook call" errors.

1. Install yalc globally (one-time): `npm install -g yalc`
2. Build and publish the package(s) you're working on:
   ```sh
   pnpm --filter wtc-gl run build
   cd packages/wtc-gl && yalc publish

   pnpm --filter @wethegit/react-wtc-gl run build
   cd packages/react && yalc publish
   ```
3. In the consuming project, link them and reinstall:
   ```sh
   yalc add wtc-gl @wethegit/react-wtc-gl
   yarn install   # or npm/pnpm install
   ```
   This rewrites the consumer's `package.json` to point at `file:.yalc/...` and adds a `.yalc/` folder plus `yalc.lock`.
4. While iterating, run `pnpm run watch` in `packages/wtc-gl` or `packages/react` to rebuild `dist` on save, then push the update to every linked consumer:
   ```sh
   cd packages/wtc-gl && yalc push
   ```
5. When you're done, remove the link and restore the registry version in the consumer:
   ```sh
   yalc remove wtc-gl @wethegit/react-wtc-gl
   yarn install
   ```
