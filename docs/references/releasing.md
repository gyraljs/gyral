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

`release/placeholders/` holds 0.0.0 "Coming soon — https://gyral.dev" manifests for the nine
`@gyral/*` packages and the unscoped `gyral`, `gyraljs` and `create-gyral`. Publish them once,
from a clean checkout of `main`. **A new package needs this again before the first release
that includes it** (npm only lets you configure a trusted publisher for a package that
exists): add its placeholder, re-run the script (published names are skipped), then do steps
3 and 4 for it.

`@gyral/codemod`, new in 0.3.8, was set up on 2026-10-29: its name is reserved (npm shows
`0.0.0-stage`, the placeholder npm creates when staged publishing is set up, owned by
`mikezupper` like the other packages), its trusted publisher is configured (step 3) and its
publishing is locked down (step 4).

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

For each of `@gyral/core`, `http`, `router`, `time`, `ssr`, `testing`, `devtools`, `mcp`,
`codemod` **and `create-gyral`** (10 packages; create-gyral joined the lockstep release on
2026-10-05, `@gyral/mcp` on 2026-10-05, `@gyral/codemod` with 0.3.8; each new one needs its
placeholder published first):
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
   "current version" wording and every changed command or API. The docs describe only the new
   release: rewrite changed behaviour in the present tense, with no "new in" or "since"
   notes, and remove anything about older releases (history belongs in the changelogs). Add
   an upgrade page only when the release breaks something (a new minor), and remove the
   previous release's upgrade page at the same time. Don't wait
   for step 7: `@gyral/mcp` ships the docs snapshot taken here, and npm never replaces a
   published version, so a page written after the release reaches the package only with the
   next one (0.3.3 shipped without its own upgrade page; gyral-ttk). Build that branch and take
   the snapshot from its output, on a gyral branch. Build it with
   `GYRAL_DOCS_VERSION=X.Y.Z GYRAL_ERRORS_JSON=../gyral/packages/core/src/errors.json GYRAL_PACKAGES_DIR=../gyral/packages pnpm build`
   so the llms files name the new release, the errors page lists its codes and the API pages
   render this checkout's declarations, not the previous release's from npm (gyral-ns9), then run
   `pnpm mcp:refresh --from ../gyral.dev/dist`
   (a relative path is resolved from where you run pnpm; the directory must hold `llms.txt` and
   `llms-full.txt`). Review and commit the diff, then run `pnpm version-packages`
   (`changeset version`, then the skill plugin's version in `.claude-plugin/marketplace.json`
   set to the release, which `pnpm invariants` checks). Plain
   `pnpm mcp:refresh` reads the live site, which is right only when the site already describes
   this release. Once the changesets are consumed, `pnpm check` fails unless the snapshot names
   this release and its API pages carry this checkout's doc comments
   (packages/mcp/test/snapshot-api.node.test.ts). It consumes the changesets, bumps every
   `@gyral/*` package to the same version and writes each `CHANGELOG.md`. Commit as
   `chore(release): vX.Y.Z`, open a PR, run `pnpm check`, merge. In the same PR, rewrite the
   "unreleased (next release)" markers on features this release ships: they are in package
   READMEs, the skill (which the MCP corpus bundles), `docs/references` and example READMEs
   (`git grep -in 'unreleased'`). Remove the marker: the docs describe the current release.
3. GitHub → Actions → **release** → Run workflow (branch `main`) → approve the `npm`
   deployment when asked.
4. The workflow refuses unconsumed changesets, runs `pnpm check`, builds, runs
   `scripts/stage-release.mjs --stage` (`pnpm pack` + `npm stage publish --provenance` for
   each version npm does not serve yet), pushes the `vX.Y.Z` tag and creates the GitHub
   release from the core changelog.
5. **Approve the staged versions**: npmjs.com → the `gyral` org → Packages → **Staged
   Packages** → review → **Approve** (2FA) for each, or `npm stage list @gyral/NAME` then
   `npm stage approve <stage-id>`. Approve `@gyral/core` first; the others depend on it.
   That is 10 approvals: the nine `@gyral/*` packages and `create-gyral`.
6. Verify all ten versions and `latest` tags on the registry, including npm provenance.
   Generate both templates in fresh directories using `npm create gyral@X.Y.Z app-basic --
--template basic --yes` and the equivalent `ssr` command. Install with npm, then run each
   app's `typecheck`, `build` and `test`. Check manifests and lockfiles contain registry
   dependencies, with no `file:`, `link:`, vendor tarballs or overrides for Gyral. Run
   `npx -y @gyral/mcp@X.Y.Z --help` (the documented command, which picks the package's only
   bin) and start it as an MCP stdio server, and `npx -y @gyral/codemod@X.Y.Z --help`.
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
  `npm pack --dry-run` file-list comparison. Packages run by name (`@gyral/mcp` and
  `@gyral/codemod` through `npx`, `create-gyral` through `npm create gyral`) must have exactly
  one bin or one named after the unscoped package, or npx cannot pick a command
  (`scripts/lib/npx-bin.mjs`).
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

Recorded 0.3.5 follow-ups (2026-10-14): `mcp.gyral.dev` was redeployed with that image, and
`/healthz` reports `"version":"0.3.5"` and corpus `ff6e48cf…`. The official MCP client connects
over Streamable HTTP, lists seven tools, reads `gyral://skill` and gets answers from `get_api`,
`search_docs` and `scaffold_component`. gyral.dev and the demo shop are deployed on 0.3.5.
gyral-rs 0.3.0 (`d9265eb`, for Gyral 0.3.5) published all four crates to crates.io through
Trusted Publishing, and a fresh Cargo project on Rust 1.99 builds and runs against `gyral`
0.3.0 with the `axum` feature.

Recorded 0.3.6 candidate checks (2026-10-14): `pnpm check` passes (316 test files, 2065
tests, one skipped). The `@gyral/mcp` docs snapshot comes from the gyral.dev
`release/0.3.6-docs` build with `GYRAL_DOCS_VERSION=0.3.6` and
`GYRAL_ERRORS_JSON=../gyral/packages/core/src/errors.json`, so the errors page already
lists G0014.

Recorded 0.3.6 registry checks (2026-10-14, step 6): all nine packages serve 0.3.6 as
`latest` with SLSA v1 provenance; `@gyral/ssr` exports `.`, `./node` and `./static` only.
`npx -y @gyral/mcp@0.3.6 --help` prints both modes, and the server answers `initialize` over
stdio as `gyral 0.3.6` with eight tools; `search_docs` finds G0014 and `check_snippet` runs
TypeScript 6.0.3. `npm create gyral@0.3.6` generated both templates in fresh directories, and
npm installed them. Each app's `typecheck`, `build` and `test` pass (basic: two Chromium tests;
SSR: three server tests and a prerendered page), and the SSR production server answers 200
with a declarative shadow root. Both manifests depend on `^0.3.6`.
`node scripts/verify-ssr-production.mjs` (exact 0.3.6; a 59,337-byte one-file server) and the
Rust compatibility fixture (gyral-rs `771b28c`, which pins core and SSR 0.3.6) also pass. The
hosted MCP image with the released 0.3.6 corpus (built from `b276ff0`) passes
`verify-mcp-traefik.mjs` and `verify-mcp-proxy.mjs`; gyral.dev, gyral-shop (40 client assets
byte-identical to 0.3.5) and the benchmarks harness build on 0.3.6 from the registry.

Recorded 0.3.6 follow-ups (2026-10-14): `mcp.gyral.dev` was redeployed with that image, and
`/healthz` reports `"version":"0.3.6"` and corpus `0dcdedc7…`. The official MCP client connects
over Streamable HTTP, lists seven tools, reads `gyral://skill` and gets answers from `get_api`,
`search_docs` and `scaffold_component`. gyral.dev and the demo shop are deployed on 0.3.6.
Hand-written repository links in the gyral.dev docs pages had to be moved to the new tag by
hand; gyral.dev's content test now fails on a docs page that links an older tag.
The published 0.3.6 snapshot's API reference pages were rendered from the installed 0.3.5
declarations (three stale doc comments; `get_api` is built from source and correct). Main's
snapshot was refreshed from the deployed 0.3.6 site; `gyral-ns9` makes release builds read
the checkout's declarations.
gyral-rs 0.4.0 (`9987531`, for Gyral 0.3.6) published all four crates to crates.io through
Trusted Publishing (release run 38613425206; its first `verify` attempt failed on a transient
npm registry fetch inside the Docker build and passed on re-run). docs.rs built all four, and a
fresh Cargo project on Rust 1.99 with `gyral` 0.4.0 and the `axum` feature builds, resolves V8
150.4.0 and reports `GYRAL_VERSION` 0.3.6.

Recorded 0.3.7 candidate checks (2026-10-28, epic gyral-k97): `pnpm check` passes (323 test
files, 2117 tests, one skipped; 21 bundles within budget, register at 18,428 of 18,432 gzip
bytes) and `pnpm smoke:prod` passes. `verify:install` passes with nine tarballs, all
Node-loadable entries, native SSR output and `npx --no-install @gyral/mcp` (help, then a stdio
session with eight tools); no Lit package is installed. Both `verify:create` templates
typecheck, build and pass their tests (basic 21.9 KiB JS, 8.3 KiB gzip; SSR 34.5 KiB JS, 14.1
KiB gzip). The `@gyral/mcp` docs snapshot comes from the gyral.dev `release/0.3.7-docs` build
(8861ce2), made with the packed 0.3.7 tarballs installed temporarily (and
`GYRAL_DOCS_VERSION=0.3.7`), so its API reference pages render 0.3.7's declarations rather
than 0.3.6's (the gap gyral-ns9 records) and its repository links point at `v0.3.7`. Before
the release, each fix was checked in an app that uses Gyral, on a pre-release tarball: joystyk's
production E2Es without its compiled-library workaround, football-pool-tracker's browser suite
without its include list, and driftwake's listening page with a static import and its fallback
inside the element (gyral-k97.7 lists the migrations).

Recorded 0.3.7 registry checks (2026-10-28, step 6): all nine packages serve 0.3.7 as
`latest` with SLSA v1 provenance (release run 40747424576, tag `v0.3.7` at `0baddb3`; the GitHub
release opens with the three behavior changes). `npx -y @gyral/mcp@0.3.7 --help` prints both
modes, and the server answers `initialize` over stdio as `gyral 0.3.7` with eight tools;
`search_docs` finds G0015 and template rule 16. `npm create gyral@0.3.7` generated both
templates in fresh directories, and npm installed them. Each app's `typecheck`, `build` and
`test` pass (basic: two Chromium tests; SSR: three server tests), with client builds unchanged
from the candidate checks (basic 21.9 KiB JS, 8.3 KiB gzip; SSR 34.5 KiB JS, 14.1 KiB gzip).
Both manifests depend on `^0.3.7`, with no overrides; every lockfile entry resolves from
`registry.npmjs.org` with SHA-512 integrity, none uses `file:` or `link:`, and no Lit package
is installed. `node scripts/verify-ssr-production.mjs` (exact 0.3.7; a 59,418-byte one-file
server) passes.

Recorded 0.3.7 follow-ups (2026-10-28): `mcp.gyral.dev` was redeployed with the image built from
`2dc7fe0` with `--released-corpus 0.3.7` (it passed `verify-mcp-proxy.mjs` and
`verify-mcp-traefik.mjs` first); `/healthz` reports `"version":"0.3.7"` and corpus `f3918955…`,
and the official MCP client lists seven tools, reads `gyral://skill` and gets answers from
`get_api`, `search_docs` and `scaffold_component`. gyral-rs 0.5.0 (`fcd466e`, for Gyral 0.3.7)
published all four crates to crates.io through Trusted Publishing (release run 40761977308); it
also adopts rustls 0.23.46 and tokio 1.53.3, and ignores three advisories, which reach only its
unpublished examples, until their fixes are two weeks old. docs.rs built all four, and a fresh
Cargo project on Rust 1.99 with `gyral` 0.5.0 and the `axum` feature builds and resolves V8
150.4.0. The Rust compatibility fixture now pins gyral-rs `fcd466e` and npm 0.3.7, and
`verify-rust-compatibility.mjs` passes against it (gyral-k97.8).

Recorded 0.3.8 candidate checks (2026-10-29, epic gyral-337): `pnpm check` passes on Node
24.22.0 and on 26.12.0 (342 test files, 2265 tests, one skipped; 21 bundles within budget). `pnpm smoke:prod` passes. `verify:install` passes with ten
tarballs (`@gyral/codemod` is new), all Node-loadable entries, native SSR output and
`npx --no-install @gyral/mcp` (help, then a stdio session with eight tools); no extra peers and
no Lit package are installed. Both `verify:create` templates typecheck, build and pass their
tests (basic 22.2 KiB JS, 8.4 KiB gzip; SSR 34.8 KiB JS, 14.2 KiB gzip). The `@gyral/mcp` docs
snapshot comes from the gyral.dev `release/0.3.8-docs` build (22fe4fd), made with
`GYRAL_PACKAGES_DIR` pointing at this checkout, so its API pages render 0.3.8's declarations
(gyral-ns9). Before the release, the packed 0.3.8 tarballs ran the gates of joystyk, gyral-shop,
starwars.run and football-pool-tracker, and the codemod was applied to each: four regressions
it found are fixed (gyral-337.14 to .17), and gyral-337.13 lists the migrations.

Recorded 0.3.8 registry checks (2026-10-29, step 6): all ten packages serve 0.3.8 as `latest`
with SLSA v1 provenance (release run 40939098610, tag `v0.3.8` at `3dc51ec`; the GitHub release
opens with the three behavior changes), and each sibling package peers on `@gyral/core` 0.3.8
exactly. `npx -y @gyral/mcp@0.3.8 --help` prints its commands, and the server answers
`initialize` over stdio as `gyral 0.3.8` with eight tools; `search_docs` finds G0017, and
`get_api` returns 0.3.8's `on`, `gyral` and the three `defineDriver` overloads.
`npx -y @gyral/codemod@0.3.8 --help` lists the 0.3.8 transforms, and `--version` prints 0.3.8.
`npm create gyral@0.3.8` generated both templates in fresh directories on Node 24.22.0, and
npm installed them. Each app's `typecheck`, `build` and `test` pass (basic: two Chromium tests;
SSR: three server tests), with client builds matching the candidate checks (basic 22.2 KiB JS,
8.4 KiB gzip; the SSR client assets byte-identical). Both manifests depend on `^0.3.8`, with no
overrides; every lockfile entry resolves from `registry.npmjs.org` with SHA-512 integrity, none
uses `file:` or `link:`, and no Lit package is installed. `node scripts/verify-ssr-production.mjs`
(exact 0.3.8; a 59,874-byte one-file server) passes.

Recorded 0.3.8 follow-ups (2026-10-29): `mcp.gyral.dev` was redeployed with the image built from
`db8adc5` with `--released-corpus 0.3.8` on `node:24.22.1-trixie-slim` (it passed
`verify-mcp-proxy.mjs` and `verify-mcp-traefik.mjs` first; registry digest `508ffc77…`);
`/healthz` reports `"version":"0.3.8"` and corpus `3e170d38…`, and the official MCP client lists
seven tools and 19 resources, reads `gyral://skill` and gets 0.3.8 answers from `get_api`
(`gyral`), `search_docs` (G0044) and `scaffold_component`. gyral.dev installs @gyral/* 0.3.8 from
npm and serves the 0.3.8 docs; `npx @gyral/codemod@0.3.8` moved its own Vite config and two
scripts to `gyral()`. gyral-rs 0.6.0 (`d73d99f`, for Gyral 0.3.8) published all four crates to
crates.io through Trusted Publishing (release run 40949740191), after its dependency update to
two-week-old crates, Rust 1.99.1 and trixie images. docs.rs built all four, and a fresh Cargo
project on Rust 1.99.1 with `gyral` 0.6.0 and the `axum` feature builds and resolves V8 150.4.0.
The Rust compatibility fixture now pins gyral-rs `d73d99f`, npm 0.3.8 and Rust 1.99.1, and
`verify-rust-compatibility.mjs` passes against it (gyral-337).

Recorded 0.3.9 candidate checks (2026-10-30, epic gyral-vge): `pnpm check` passes on Node
24.22.0 and on 26.12.0 (350 test files, 2314 tests, one skipped; 21 bundles within budget, with
nested-folders at 10.9 KiB under ADR 0015's approved 0.3.9 addendum). `pnpm smoke:prod` passes.
`verify:install` passes with ten tarballs, all Node-loadable entries, native SSR output and
`npx --no-install @gyral/mcp`; no extra peers and no Lit package are installed. Both
`verify:create` templates typecheck, build and pass their tests (basic 22.2 KiB JS, 8.4 KiB gzip;
SSR 34.9 KiB JS, 14.3 KiB gzip). `pack:check` now pre-bundles the packed core with Vite's
optimizer and requires its development modules there (gyral-3pv). The `@gyral/mcp` docs snapshot
comes from the gyral.dev `release/0.3.9-docs` build. Before the release, packed 0.3.9 tarballs ran
the gates of gyral-shop, starwars.run, football-pool-tracker and gymtime on their 0.3.8 branches
with no regression; the G0017 false positives they listed are gone, the 0.3.9-removable
workarounds come out, and an edited component shows on the next dev-server request with core
installed from the tarball. Vite's part of gyral-3pv is reported upstream as vitejs/vite#23946.

Recorded 0.3.9 registry checks (2026-10-30, step 6): all ten packages serve 0.3.9 as `latest`
with SLSA v1 provenance (release run 41047535041, tag `v0.3.9` at `17f7dc3`; the GitHub release opens with
the behavior changes), and each sibling package peers on `@gyral/core` 0.3.9 exactly.
`npx -y @gyral/mcp@0.3.9` answers `initialize` over stdio as `gyral 0.3.9` with eight tools;
`get_api` returns `parse` with `modifiers`, and `search_docs` finds the Node testing of `on()`
parsers. `npx -y @gyral/codemod@0.3.9 --version` prints 0.3.9. `npm create gyral@0.3.9` generated
both templates in fresh directories on Node 24.22.0, and npm installed them; each app's
`typecheck`, `build` and `test` pass (basic 22.8 kB JS, 8.7 kB gzip; SSR counter chunk 25.8 kB).
Both manifests depend on `^0.3.9` with no overrides; every lockfile entry resolves from
`registry.npmjs.org` with SHA-512 integrity, none uses `file:` or `link:`, and no Lit package is
installed. `node scripts/verify-ssr-production.mjs` (exact 0.3.9; a 60,063-byte one-file server)
passes.

Recorded 0.3.9 follow-ups (2026-10-30): `mcp.gyral.dev` was redeployed with the image built from
`72f0b1a` with `--released-corpus 0.3.9` on `node:24.22.1-trixie-slim` (it passed
`verify-mcp-proxy.mjs` and `verify-mcp-traefik.mjs` first); `/healthz` reports `"version":"0.3.9"`
and corpus `d047a61a…`, and the official MCP client lists seven tools and 19 resources and gets
0.3.9 answers from `get_api` (`parse` with `modifiers`), `search_docs` and `scaffold_component`.
gyral.dev installs @gyral/* 0.3.9 from npm and serves the 0.3.9 docs. gyral-rs 0.7.0 (`394ab9f`,
for Gyral 0.3.9) published all four crates to crates.io through Trusted Publishing (release run
41058086636); its server output is byte-identical to 0.6.0's with 0.3.8. docs.rs built all four,
and a fresh Cargo project on Rust 1.99.1 with `gyral` 0.7.0 and the `axum` feature builds and
resolves V8 150.4.0. The Rust compatibility fixture now pins gyral-rs `394ab9f` and npm 0.3.9, and
`verify-rust-compatibility.mjs` passes against it (gyral-vge).

## When something goes wrong

- **Staging failed halfway**: fix the cause and re-run the workflow. The stage script skips
  versions npm already serves, and tagging skips an existing `vX.Y.Z`. A version staged but
  not approved is not live; reject it on npmjs.com before re-staging if it was wrong.
- **Bad release**: `npm deprecate @gyral/NAME@X.Y.Z "reason"` and release a patch. Unpublish
  only within 72 hours and only if nothing depends on it.
- **OIDC error (`E404`/`ENEEDAUTH`/`E403` on stage)**: the trusted publisher fields must match
  exactly (`gyraljs` / `gyral` / `release.yml` / `npm`).
