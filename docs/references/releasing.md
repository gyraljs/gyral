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
- **Visibility**: npm provenance needs a **public** repository. gyraljs/gyral is public
  (since 2026-10-05); a private repository fails at the publish step.

## Cutting a release

1. Pull requests that change a package add a changeset: `pnpm changeset` (see
   [.changeset/README.md](../../.changeset/README.md)).
2. When ready, first prepare the release's gyral.dev changes on a gyral.dev branch: the
   upgrade page, the "current version" wording, and every changed command or API. Don't wait
   for step 7: `@gyral/mcp` ships the docs snapshot taken here, and npm never replaces a
   published version, so a page written after the release reaches the package only with the
   next one (0.3.3 shipped without its own upgrade page; gyral-ttk). Build that branch and take
   the snapshot from its output, on a gyral branch. Build it with `GYRAL_DOCS_VERSION=X.Y.Z pnpm build`
   so the llms files name the new release rather than the installed one, then run
   `pnpm mcp:refresh --from ../gyral.dev/dist`
   (a relative path is resolved from where you run pnpm; the directory must hold `llms.txt` and
   `llms-full.txt`). Review and commit the diff, then run `pnpm changeset version`. Plain
   `pnpm mcp:refresh` reads the live site, which is right only when the site already describes
   this release. It consumes the changesets, bumps every
   `@gyral/*` package to the same version and writes each `CHANGELOG.md`. Commit as
   `chore(release): vX.Y.Z`, open a PR, run `pnpm check`, merge. In the same PR, rewrite the
   "unreleased (next release)" markers on features this release ships: they are in package
   READMEs, the skill (which the MCP corpus bundles), `docs/references` and example READMEs
   (`git grep -in 'unreleased'`). Say "since X.Y.Z" instead.
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
6. Verify all nine versions and `latest` tags on the registry, including npm provenance.
   Generate both templates in fresh directories using `npm create gyral@X.Y.Z app-basic --
--template basic --yes` and the equivalent `ssr` command. Install with npm, then run each
   app's `typecheck`, `build` and `test`. Check manifests and lockfiles contain registry
   dependencies, with no `file:`, `link:`, vendor tarballs or overrides for Gyral. Run
   `npx -y @gyral/mcp@X.Y.Z --help` (the documented command, which picks the package's only
   bin) and start it as an MCP stdio server.
7. Move gyral.dev to the verified npm release (registry dependencies only, no overrides or
   vendored packages) on the branch from step 2, run its gate and deploy matching docs and llms
   files. Then rebuild the hosted MCP image (production-mcp.md) with `--released-corpus X.Y.Z`.
   Only after the stable registry installs and deployed docs pass may Context7 be submitted
   or refreshed (gyral-b2g → gyral-7se.5). Use the [Context7 runbook](context7.md) to
   submit the released corpus and record live component, form and driver retrieval.

The placeholders occupy 0.0.0, so every real release is **0.1.0** or higher (the first one,
0.1.0, came from a `minor` changeset).

## Before publishing: local checks

- `pnpm pack:check` (part of `pnpm check`): packs each package as `pnpm publish` will and
  runs publint, @arethetypeswrong/cli (esm-only profile), tarball content assertions and an
  `npm pack --dry-run` file-list comparison. Packages run by name (`@gyral/mcp` through
  `npx`, `create-gyral` through `npm create gyral`) must have exactly one bin or one named
  after the unscoped package, or npx cannot pick a command (`scripts/lib/npx-bin.mjs`).
- `pnpm verify:install` (network, not in the gate): installs the tarballs with npm in a fresh
  temp project, imports every Node-loadable entry, server-renders a component, runs
  `npx --no-install @gyral/mcp --help`, then starts the server through
  `npx --no-install @gyral/mcp` over stdio and calls tools, so npx's bin selection is
  exercised as users run it. It fails if the tarballs install any Lit package (ADR 0018).
  The browser-only entry `@gyral/devtools` is covered by the browser tests instead.
- `pnpm verify:create` (network, not in the gate): installs `create-gyral` from its packed
  tarball and runs it as `npm create gyral` for each template (`basic`, `ssr`), points the
  app's `@gyral/*` at the tarballs, installs with npm and runs the generated app's
  `typecheck`, `build` and `test`. Run it after changing create-gyral or its templates, and
  before every release.

Recorded 0.3.1 candidate checks (2026-10-11): `verify:install` passes with nine tarballs,
all Node-loadable entries (including storage and network subpaths), native SSR output and
the installed MCP stdio binary's seven tools. API lookup verifies all four new driver
factories. The verifier adds no extra peers, and no Lit package is installed.

Both `verify:create` templates typecheck, build and pass their tests (basic: two Chromium
tests; SSR: three server tests and a prerendered page). Client builds: basic 21.9 KiB JS
(8.3 KiB gzip), SSR 34.4 KiB JS (14.1 KiB gzip). These are pre-publication tarball checks;
they do not replace step 6's registry-only checks after npm approval.

Recorded 0.3.2 candidate checks (2026-10-12): `pnpm check` passes (312 test files, 2016
tests). `verify:install` passes with nine tarballs, all 18 Node-loadable entries, native SSR
output and the installed MCP stdio binary's eight tools (`start_here` is new). The verifier
adds no extra peers, and no Lit package is installed.

Both `verify:create` templates typecheck, build and pass their tests (basic: two Chromium
tests; SSR: three server tests and a prerendered page), and both generated manifests depend on
`^0.3.2`. Client builds are unchanged from 0.3.1: basic 21.9 KiB JS (8.3 KiB gzip), SSR
34.4 KiB JS (14.1 KiB gzip). As for 0.3.1, these do not replace step 6's registry-only checks.

Recorded 0.3.2 registry checks (2026-10-12, step 6): all nine packages serve 0.3.2 as
`latest` with SLSA v1 provenance. `npm create gyral@0.3.2` generated both templates in fresh
directories, and npm installed them. Each app's `typecheck`, `build` and `test` pass (basic:
two Chromium tests; SSR: three server tests and a prerendered page), and client builds match
the candidate checks (basic 21.9 KiB JS, SSR 34.4 KiB JS). Both manifests depend on `^0.3.2`,
with no overrides. Every lockfile entry resolves from `registry.npmjs.org` with SHA-512
integrity; no entry uses `file:`, `link:` or a vendor tarball, and no Lit package is installed.
`node scripts/verify-ssr-production.mjs` (exact 0.3.2) and the Rust compatibility fixture
(gyral-rs `1131fef`) also pass.

The MCP check **fails as documented**: `npx -y @gyral/mcp@0.3.2` (and unversioned
`npx -y @gyral/mcp`) exits with "could not determine executable to run". 0.3.2 added a second
bin, `gyral-mcp-http`, and npx runs a package without naming a command only when it has one
bin or a bin named after the package (`mcp`). 0.3.1 has a single bin and still starts. The
published server itself works: `npx -y -p @gyral/mcp@0.3.2 gyral-mcp` starts over stdio,
answers `initialize` as `gyral 0.3.2` and lists eight tools, including `start_here`, which
returns its guide. `verify:install` missed this because it starts the installed `gyral-mcp`
bin directly. Fixing the documented command needs a patch release.

0.3.3 is that patch. `@gyral/mcp` has one bin again, `gyral-mcp`: with no arguments it is the
stdio server as before, and `gyral-mcp http` replaces the `gyral-mcp-http` bin (the container
image and `deploy/mcp/compose.yaml` run `gyral-mcp http`, so redeploying needs an image built
from 0.3.3; see [the production runbook](production-mcp.md)). New checks keep this from
recurring: `pack:check` asserts that `@gyral/mcp` and `create-gyral` each have exactly one bin
or one named after the unscoped package, `verify:install` runs the installed tarball through
`npx --no-install @gyral/mcp` (help, then a stdio session), and `verify:create` runs the
packed create-gyral as `npm create gyral`. Restoring the second bin fails both `pack:check` and
`verify:install`.

Recorded 0.3.3 candidate checks (2026-10-12): `pnpm check` passes (314 test files, 2028
tests). `verify:install` passes with nine tarballs; `npx --no-install @gyral/mcp --help` prints
both modes and the server answers over stdio through npx with eight tools. Both
`verify:create` templates, run through `npm create gyral`, typecheck, build and pass their
tests, with client builds unchanged (basic 21.9 KiB JS, SSR 34.4 KiB JS). An image built from
this source with the released 0.3.2 corpus passes `verify-mcp-traefik.mjs` (Compose running
`gyral-mcp http`) and `verify-mcp-proxy.mjs`.

Recorded 0.3.3 registry checks (2026-10-12, step 6): all nine packages serve 0.3.3 as
`latest` with SLSA v1 provenance. `@gyral/mcp@0.3.3` has a single bin, `gyral-mcp`, and the
MCP check passes again: `npx -y @gyral/mcp@0.3.3` and unversioned `npx -y @gyral/mcp` both
start over stdio, answer `initialize` as `gyral 0.3.3` and list eight tools (`start_here`,
`search_docs`, `get_doc`, `get_api`, `list_examples`, `get_example`, `scaffold_component`,
`check_snippet`). `npm create gyral@0.3.3` generated both templates in fresh directories, and
npm installed them. Each app's `typecheck`, `build` and `test` pass (basic: two Chromium
tests; SSR: three server tests and a prerendered page with the hydration chunk preloaded
once), and client builds are unchanged from 0.3.2 (basic 21.9 KiB JS, SSR 34.4 KiB JS). Both
manifests depend on `^0.3.3`, with no overrides. Every lockfile entry resolves from
`registry.npmjs.org` with SHA-512 integrity, and no Lit package is installed.
`node scripts/verify-ssr-production.mjs` (exact 0.3.3; a 58,738-byte one-file server) and
the Rust compatibility fixture (gyral-rs `eb074c6`, which pins core and SSR 0.3.3) also pass.

Recorded 0.3.4 registry checks (2026-10-13, step 6): all nine packages serve 0.3.4 as
`latest` with SLSA v1 provenance. `npx -y @gyral/mcp@0.3.4` and unversioned
`npx -y @gyral/mcp` both start over stdio, answer `initialize` as `gyral 0.3.4` and list eight
tools. `npm create gyral@0.3.4` generated both templates in fresh directories, and npm
installed them. Each app's `typecheck`, `build` and `test` pass (basic: two Chromium tests;
SSR: three server tests and a prerendered page). Both manifests depend on `^0.3.4`, with no
overrides. Every lockfile entry resolves from `registry.npmjs.org` with SHA-512 integrity,
and no Lit package is installed. The prerendered SSR page links no `modulepreload` twice.
`node scripts/verify-ssr-production.mjs` (exact 0.3.4; a 59,333-byte one-file server) and
the Rust compatibility fixture (gyral-rs `2f56c63`, which pins core and SSR 0.3.4) also pass.

Recorded 0.3.5 candidate checks (2026-10-13): `pnpm check` passes (316 test files, 2054
tests). `verify:install` passes with nine tarballs, all Node-loadable entries, native SSR output,
and `npx --no-install @gyral/mcp` (help, then a stdio session with eight tools). Both
`verify:create` templates typecheck, build and pass their tests, with client builds unchanged
(basic 21.9 KiB JS, SSR 34.4 KiB JS). The `@gyral/mcp` docs snapshot comes from the gyral.dev
`release/0.3.5` build with `GYRAL_DOCS_VERSION=0.3.5`.

Recorded 0.3.5 registry checks (2026-10-14, step 6): all nine packages serve 0.3.5 as
`latest` with SLSA v1 provenance. `npx -y @gyral/mcp@0.3.5 --help` prints both modes, and the
server answers `initialize` over stdio as `gyral 0.3.5` with eight tools. `npm create
gyral@0.3.5` generated both templates in fresh directories, and npm installed them. Each app's
`typecheck`, `build` and `test` pass (basic: two Chromium tests; SSR: three server tests), with
client builds unchanged from 0.3.4. Both manifests depend on `^0.3.5`, with no overrides. Every
lockfile entry resolves from `registry.npmjs.org`, and no Lit package is installed.
`node scripts/verify-ssr-production.mjs` (exact 0.3.5; a 59,333-byte one-file server) and the
Rust compatibility fixture (gyral-rs `6ccc1b3`, which pins core and SSR 0.3.5) also pass. The
hosted MCP image with the released 0.3.5 corpus (built from `e981d3f`) passes
`verify-mcp-traefik.mjs` and `verify-mcp-proxy.mjs`; gyral.dev and gyral-shop build on 0.3.5
from the registry.

## When something goes wrong

- **Staging failed halfway**: fix the cause and re-run the workflow. The stage script skips
  versions npm already serves, and tagging skips an existing `vX.Y.Z`. A version staged but
  not approved is not live; reject it on npmjs.com before re-staging if it was wrong.
- **Bad release**: `npm deprecate @gyral/NAME@X.Y.Z "reason"` and release a patch. Unpublish
  only within 72 hours and only if nothing depends on it.
- **OIDC error (`E404`/`ENEEDAUTH`/`E403` on stage)**: the trusted publisher fields must match
  exactly (`gyraljs` / `gyral` / `release.yml` / `npm`).
