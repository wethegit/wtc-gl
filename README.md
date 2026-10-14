# wtc-gl

ES6 Web GL library for simple WebGL work. Much of this 1.0 version has been adapted from and inspired by Three.js and OGL.

See [the documentation](https://wethegit.github.io/wtc-gl/) for details.

## Development

This is a pnpm workspace with three packages:

| Package | Path | Published |
| --- | --- | --- |
| `wtc-gl` | `packages/wtc-gl` | Yes |
| `@wethegit/react-wtc-gl` | `packages/react` | Yes |
| `wtc-gl-site` (demos and docs site) | `packages/site` | No |

### Setup

You'll need the Node version in `.nvmrc` and pnpm. The pnpm version is pinned by the `packageManager` field in `package.json`, so `corepack enable` will pick up the right one.

```sh
nvm use
corepack enable
pnpm install
```

### Scripts

Run these from the repo root:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the demo site with Vite. |
| `pnpm build` | Builds every package. |
| `pnpm lint` | Lints and auto-fixes the package sources. |
| `pnpm check` | Lints without fixing, then builds. This is what CI runs before a release. |
| `pnpm document` | Generates the TypeDoc API docs into `docs/`. |
| `pnpm build:site` | Builds the docs and the demo site for GitHub Pages. |
| `pnpm changeset` | Adds a changeset describing your change (see [Releasing](#releasing)). |

A pre-commit hook (husky and lint-staged) runs eslint and prettier on staged files.

### Linking into another project during development

To test unpublished changes to `wtc-gl` or `@wethegit/react-wtc-gl` in a consuming project, use [`yalc`](https://github.com/wclr/yalc) rather than `npm link`/`yarn link` - the consumer's bundler otherwise resolves the linked package's peer dependencies (e.g. `react`) relative to this repo's `node_modules`, which can pull in a second copy of React and cause "Invalid hook call" errors.

1. Install yalc globally (one-time): `npm install -g yalc`
2. Build and publish the package(s) you're working on:
   ```sh
   pnpm --filter wtc-gl run build
   (cd packages/wtc-gl && yalc publish)

   pnpm --filter @wethegit/react-wtc-gl run build
   (cd packages/react && yalc publish)
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

## Releasing

Releases are managed with [Changesets](https://github.com/changesets/changesets) and published to npm by the Release workflow (`.github/workflows/publish-package.yml`). The workflow logs in to npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers/), so there's no npm token. Don't run `npm publish` or `pnpm publish` by hand.

### Adding a changeset

When a PR changes `wtc-gl` or `@wethegit/react-wtc-gl` in a way that should ship, add a changeset before opening it:

```sh
pnpm changeset
```

Choose the packages that changed, the bump type and a short summary. The summary becomes the changelog entry. Commit the generated `.changeset/*.md` file with your PR.

| Bump | Use for |
| --- | --- |
| `patch` | Bug fixes and internal changes that don't affect the API. |
| `minor` | New features that are backwards-compatible. |
| `major` | Breaking changes. |

Changes that don't need a release (docs, demos, CI) don't need a changeset.

### Shipping a release

1. Merge PRs with changesets into `master`. Nothing is published yet.
2. The Release workflow opens a **"chore: release packages"** PR, or updates it if one is already open. It shows the version bumps and changelog entries for everything merged since the last release.
3. When you're ready to ship, merge that PR. The workflow publishes the changed packages to npm, pushes git tags and creates GitHub releases.

To bundle several changes into one release, leave the release PR open while you merge them. Each merge updates it, and merging it publishes them all together. When several changesets touch the same package, the highest bump wins.

### Useful commands

| Command | What it does |
| --- | --- |
| `pnpm changeset status` | Shows what would be released from your branch. |
| `pnpm changeset pre enter beta` | Starts publishing prereleases (for example `2.0.0-beta.0`) under the `beta` tag. |
| `pnpm changeset pre exit` | Stops publishing prereleases, ready for the final release. |

To change a pending bump or changelog entry, edit or delete its `.changeset/*.md` file in a follow-up PR. The release PR updates itself.

`@wethegit/react-wtc-gl` lists `wtc-gl` as a peer dependency. It's only bumped when you select it in a changeset, or when a `wtc-gl` release moves outside its peer range, such as a major release.

Prereleases need the Release workflow to also run on the prerelease branch. It currently only runs on `master`.
