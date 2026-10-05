# Changesets

Every pull request that changes a published package adds a changeset:

```sh
pnpm changeset          # pick the bump (patch/minor/major) and write a one-line summary
```

All `@gyral/*` packages are released together at one version (the `fixed` group in
`config.json`), and each package gets its own `CHANGELOG.md`. Releases are cut by the owner
with the manual Release workflow: [docs/references/releasing.md](../docs/references/releasing.md).
