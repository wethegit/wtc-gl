# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).

When a PR changes `wtc-gl` or `@wethegit/react-wtc-gl` in a way that should ship, run:

```sh
pnpm changeset
```

Pick the packages and bump type, write a short summary (it becomes the changelog entry), and commit the generated file with your PR.

On merge to `master`, the Release workflow opens (or updates) a "chore: release packages" PR that bumps versions and writes changelogs. Merging that PR publishes to npm.
