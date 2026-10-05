# Releasing Gyral

The owner's runbook. Releases publish every `@gyral/*` package at one shared version from the
manual **release** workflow (`.github/workflows/release.yml`), with npm trusted publishing
(OIDC: no npm token exists anywhere) and provenance. Why this one workflow runs on GitHub:
[ADR 0004 addendum](../design-docs/0004-local-ci.md).

## One-time setup

Do these in order. Steps 3 and 4 need the packages to exist on npm, which is what the
placeholders are for.

### 1. Accounts

- **npm**: enable two-factor authentication for _authorization and writes_
  (npmjs.com → Account → Two-Factor Authentication), preferably with a security key.
- **npm org `gyral`**: Organization → Settings → require 2FA for all members.
- **GitHub org `gyraljs`**: Settings → Authentication security → require 2FA.

### 2. Reserve the names (placeholders)

`release/placeholders/` holds 0.0.0 "Coming soon — https://gyral.dev" manifests for the seven
`@gyral/*` packages and the unscoped `gyral`, `gyraljs` and `create-gyral`. Publish them once,
from a clean checkout of `main`:

```sh
npm login                                        # browser login, 2FA
npm whoami                                       # your npm username
node scripts/publish-placeholders.mjs            # dry run: lists what would be published
node scripts/publish-placeholders.mjs --publish  # publishes; npm asks for 2FA as needed
```

Names already on npm are skipped, so re-run it after any failure. It ends by printing the
checklist below. If npm rejects an unscoped name as too similar to an existing package, the
other names still publish; record the rejected one in the release bead.

### 3. Trusted publisher, per `@gyral/*` package

For each of `@gyral/core`, `http`, `router`, `time`, `ssr`, `testing`, `devtools`:
npmjs.com/package/@gyral/NAME → **Settings** → **Trusted Publisher** → GitHub Actions:

| Field                | Value         |
| -------------------- | ------------- |
| Organization or user | `gyraljs`     |
| Repository           | `gyral`       |
| Workflow filename    | `release.yml` |
| Environment name     | `npm`         |

### 4. Lock publishing down, per package

Same Settings page → **Publishing access** → **Require two-factor authentication and disallow
tokens**. From now on only the release workflow (OIDC) or you with 2FA can publish. Do this
for the unscoped placeholders too.

### 5. GitHub

- **Environment**: gyraljs/gyral → Settings → Environments → New `npm`. Required reviewers:
  `mikezupper`. Deployment branches and tags: selected branches → `main`.
- **Branch ruleset** for `main`: require a pull request, block force pushes and deletion.
- **Tag ruleset** for `v*` and `@gyral/*`: block deletion and updates (non-fast-forward). If
  you also restrict creation, add the GitHub Actions app as a bypass actor so the workflow
  can push release tags.
- **Visibility**: npm provenance needs a **public** repository. Make gyraljs/gyral public
  before the first release. Until then a release fails at the publish step.

## Cutting a release

1. Pull requests that change a package add a changeset: `pnpm changeset` (see
   [.changeset/README.md](../../.changeset/README.md)).
2. When ready, on a branch: `pnpm changeset version`. It consumes the changesets, bumps every
   `@gyral/*` package to the same version and writes each `CHANGELOG.md`. Commit as
   `chore(release): vX.Y.Z`, open a PR, run `pnpm check`, merge.
3. GitHub → Actions → **release** → Run workflow (branch `main`) → approve the `npm`
   deployment when asked.
4. The workflow refuses unconsumed changesets, runs `pnpm check`, builds, runs
   `changeset publish` (provenance on, skipping versions npm already has), pushes the
   `@gyral/*@X.Y.Z` tags and `vX.Y.Z`, and creates the GitHub release from the core changelog.
5. Check npmjs.com shows the version with the provenance badge, then try
   `npm create vite@latest` + `npm i @gyral/core lit` in a scratch app.

The first real release must be **0.1.0** or higher: the placeholders already occupy 0.0.0.
`.changeset/first-public-release.md` is a `minor` changeset for exactly that.

## Before publishing: local checks

- `pnpm pack:check` (part of `pnpm check`): packs each package as `pnpm publish` will and
  runs publint, @arethetypeswrong/cli (esm-only profile), tarball content assertions and an
  `npm pack --dry-run` file-list comparison.
- `pnpm verify:install` (network, not in the gate): installs the tarballs with npm in a fresh
  temp project, imports every Node-loadable entry and server-renders a component. The
  browser-only entries (`@gyral/ssr/hydrate`, `@gyral/devtools`) are covered by the browser
  tests instead.

Last recorded result (2026-10-05, 0.0.0): pack:check ok for all 7 packages; verify:install ok
(9 entries imported, `<gy-hello>` rendered to Declarative Shadow DOM) with lit ^3.3.0,
@lit-labs/ssr ^4.1.0, @lit-labs/ssr-client ^1.1.8, fast-check ^4.

## When something goes wrong

- **Publish failed halfway**: fix the cause and re-run the workflow. `changeset publish` skips
  versions that are already on npm, and tagging skips an existing `vX.Y.Z`.
- **Bad release**: `npm deprecate @gyral/NAME@X.Y.Z "reason"` and release a patch. Unpublish
  only within 72 hours and only if nothing depends on it.
- **OIDC error (`E404`/`ENEEDAUTH` on publish)**: the trusted publisher fields must match
  exactly (`gyraljs` / `gyral` / `release.yml` / `npm`).
