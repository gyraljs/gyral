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

`release/placeholders/` holds 0.0.0 "Coming soon — https://gyral.dev" manifests for the eight
`@gyral/*` packages and the unscoped `gyral`, `gyraljs` and `create-gyral`. Publish them once,
from a clean checkout of `main`. **A new package needs this again before the first release
that includes it** (npm only lets you configure a trusted publisher for a package that
exists): add its placeholder, re-run the script (published names are skipped), then do steps
3 and 4 for it.

```sh
npm login                                        # browser login, 2FA
npm whoami                                       # your npm username
node scripts/publish-placeholders.mjs            # dry run: lists what would be published
node scripts/publish-placeholders.mjs --publish  # publishes; npm asks for 2FA as needed
node scripts/publish-placeholders.mjs --publish --otp=123456  # when npm fails with EOTP (no interactive terminal)
```

Names already on npm are skipped, so re-run it after any failure. It ends by printing the
checklist below. If npm rejects an unscoped name as too similar to an existing package, the
other names still publish; record the rejected one in the release bead.

### 3. Trusted publisher, per released package

For each of `@gyral/core`, `http`, `router`, `time`, `ssr`, `testing`, `devtools`, `mcp`
**and `create-gyral`** (9 packages; create-gyral joined the lockstep release on 2026-10-05,
`@gyral/mcp` on 2026-10-05 and needs its placeholder published first):
npmjs.com/package/NAME → **Settings** → **Trusted Publisher** → GitHub Actions:

| Field                | Value         |
| -------------------- | ------------- |
| Organization or user | `gyraljs`     |
| Repository           | `gyral`       |
| Workflow filename    | `release.yml` |
| Environment name     | `npm`         |

**Allowed actions**: leave **Allow npm publish** and **Allow npm dist-tag** unchecked. The
publisher is then stage-only: the workflow runs `npm stage publish`, and nothing goes live
until you approve it on npmjs.com with 2FA. A compromised workflow or GitHub account can stage
a version, but cannot publish one or move `latest`.

### 4. Lock publishing down, per package

Same Settings page → **Publishing access** → **Require two-factor authentication and disallow
tokens**. From now on the release workflow (OIDC) can only stage, and only you with 2FA can
publish or approve. Do this for the unscoped placeholders (`gyral`, `gyraljs`) too.

### 5. GitHub

- **Environment**: gyraljs/gyral → Settings → Environments → New `npm`. Required reviewers:
  `mikezupper`. Deployment branches and tags: selected branches → `main`.
- **Branch ruleset** `main` (set 2026-10-05): block force pushes and deletion. No required
  pull request or status checks yet: CI runs locally (ADR 0004).
- **Tag ruleset** for `v*` and `@gyral/*`: block deletion and updates (non-fast-forward). If
  you also restrict creation, add the GitHub Actions app as a bypass actor so the workflow
  can push release tags.
- **Visibility**: npm provenance needs a **public** repository. Make gyraljs/gyral public
  before the first release. Until then a release fails at the publish step.

## Cutting a release

1. Pull requests that change a package add a changeset: `pnpm changeset` (see
   [.changeset/README.md](../../.changeset/README.md)).
2. When ready, on a branch: `pnpm mcp:refresh` (updates `@gyral/mcp`'s docs snapshot from
   gyral.dev; review and commit the diff), then `pnpm changeset version`. It consumes the changesets, bumps every
   `@gyral/*` package to the same version and writes each `CHANGELOG.md`. Commit as
   `chore(release): vX.Y.Z`, open a PR, run `pnpm check`, merge.
3. GitHub → Actions → **release** → Run workflow (branch `main`) → approve the `npm`
   deployment when asked.
4. The workflow refuses unconsumed changesets, runs `pnpm check`, builds, runs
   `scripts/stage-release.mjs --stage` (`pnpm pack` + `npm stage publish --provenance` for
   each version npm does not serve yet), pushes the `vX.Y.Z` tag and creates the GitHub
   release from the core changelog.
5. **Approve the staged versions**: npmjs.com → the `gyral` org → Packages → **Staged
   Packages** → review → **Approve** (2FA) for each, or `npm stage list @gyral/NAME` then
   `npm stage approve <stage-id>`. Approve `@gyral/core` first; the others depend on it.
   That is 9 approvals: the eight `@gyral/*` packages and `create-gyral`.
6. Check npmjs.com shows the version with the provenance badge, then try
   `npm create vite@latest` + `npm i @gyral/core lit` in a scratch app.

The first real release must be **0.1.0** or higher: the placeholders already occupy 0.0.0.
`.changeset/first-public-release.md` is a `minor` changeset for exactly that.

## Before publishing: local checks

- `pnpm pack:check` (part of `pnpm check`): packs each package as `pnpm publish` will and
  runs publint, @arethetypeswrong/cli (esm-only profile), tarball content assertions and an
  `npm pack --dry-run` file-list comparison.
- `pnpm verify:install` (network, not in the gate): installs the tarballs with npm in a fresh
  temp project, imports every Node-loadable entry, server-renders a component, and starts the
  installed `gyral-mcp` bin over stdio and calls a tool. The
  browser-only entries (`@gyral/ssr/hydrate`, `@gyral/devtools`) are covered by the browser
  tests instead.
- `pnpm verify:create` (network, not in the gate): runs `create-gyral` from its packed tarball
  for each template (`basic`, `ssr`), points the app's `@gyral/*` at the tarballs, installs
  with npm and runs the generated app's `typecheck`, `build` and `test`. Run it after changing
  create-gyral or its templates, and before every release.

Last recorded result (2026-10-05, 0.0.0): pack:check ok for all 7 packages; verify:install ok
(9 entries imported, `<gy-hello>` rendered to Declarative Shadow DOM) with lit ^3.3.0,
@lit-labs/ssr ^4.1.0, @lit-labs/ssr-client ^1.1.8, fast-check ^4.

Last recorded `verify:create` (2026-10-05, 0.0.0, 31 s): both templates typecheck, build and
pass their tests (basic: 2 browser tests in Chromium; ssr: 2 server-render tests, and
`dist/static/index.html` is the prerendered page). Client builds: basic 151.6 KiB JS
(49.8 KiB gzip), ssr 157.3 KiB JS (51.8 KiB gzip), mostly the Effect 3 runtime (ADR 0015). 0.2.0 drops Effect: about 11 KiB gzip for an empty app.

Last recorded `verify:install` with `@gyral/mcp` (2026-10-05, 9 tarballs): all entries imported,
SSR ok, and `gyral-mcp` answered over stdio with 7 tools.

## When something goes wrong

- **Staging failed halfway**: fix the cause and re-run the workflow. The stage script skips
  versions npm already serves, and tagging skips an existing `vX.Y.Z`. A version staged but
  not approved is not live; reject it on npmjs.com before re-staging if it was wrong.
- **Bad release**: `npm deprecate @gyral/NAME@X.Y.Z "reason"` and release a patch. Unpublish
  only within 72 hours and only if nothing depends on it.
- **OIDC error (`E404`/`ENEEDAUTH`/`E403` on stage)**: the trusted publisher fields must match
  exactly (`gyraljs` / `gyral` / `release.yml` / `npm`).
