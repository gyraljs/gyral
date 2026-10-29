# ADR 0032 — Dependency updates and the two-week release age

Status: **accepted**, 0.3.8. Bead: gyral-337.7. Owner's decision, 2026-10-29. Applies to every
gyraljs repository.

A compromised or broken release is usually found and pulled within days. Adopting a version on
the day it ships turns every Gyral checkout, CI run and published package into an early
victim. gyral-rs already waited two weeks before adopting crates; this makes the same rule
the policy everywhere, and makes the tools enforce it instead of reviewers.

## The rule

A dependency version is adopted only once it has been published for at least 14 days. The
rule covers npm packages, crates, GitHub Actions, container images and toolchains (Node,
pnpm, Rust).

- **pnpm** refuses younger versions while it resolves: `minimumReleaseAge: 20160` (minutes)
  in `pnpm-workspace.yaml`. A range resolves to the newest version that is old enough.
- **Dependabot** waits the same two weeks: `cooldown: default-days: 14` on every
  `package-ecosystem`. Majors still arrive as their own pull requests.
- **`pnpm invariants`** fails here if either setting goes missing or drops below two weeks
  (`scripts/check-workflows.mjs`).
- **Cargo** has no age gate. gyral-rs checks crates.io publish dates before a lockfile refresh
  and records dated advisory ignores while a fix ages (its `docs/security.md`).

## Exceptions

- **A reachable security fix** may be adopted early, as one exact version, with the advisory
  and the date the exception ends beside it: `minimumReleaseAgeExclude: ['name@1.2.3']` for
  npm, a comment next to the pin for an image or a toolchain. A fix for an advisory that
  can't be reached waits, with a dated ignore where a scanner needs one. Dependabot security
  updates skip the cooldown by design; they get the same judgment.
- **A Gyral release the owner approved and verified** is adopted by the repositories that
  follow Gyral (gyral.dev, gyral-rs, the apps) through an exact-version exclusion, as gyral-rs
  did for 0.3.7.

The next dependency update removes every exclusion that has aged past two weeks.

## Addendum: the 0.3.8 update (gyral-337.9, gyral-337.10, 2026-10-29)

The first full update under this rule, run on 2026-10-29: two weeks old meant published by
2026-10-15. No `minimumReleaseAgeExclude` entries existed, so none were removed.

**Moved.**

- **pnpm** 10.33.2 → 12.14.0 (`packageManager`). pnpm 12 reads settings only from
  `pnpm-workspace.yaml`, fails on build scripts it hasn't been told about
  (`allowBuilds: esbuild: false` keeps esbuild's postinstall off, as before) and checks the
  lockfile against `minimumReleaseAge` on every install. The lockfile also records pnpm itself.
  The pack check's peer fixture now writes its override to the throwaway app's
  `pnpm-workspace.yaml`, runs pnpm from the workspace root so corepack picks this version, and
  reads the unmet peer from `pnpm peers check`: pnpm 11 and later only warn during the install.
- **npm** (devDependencies only): @types/node 24.19.1 → 26.6.5 (the newest supported line; the
  Node 24 job catches 26-only APIs), pixelmatch 7.2.0 → 8.0.0, vitest,
  @vitest/browser-playwright and @vitest/coverage-v8 5.0.3 → 5.0.5, playwright 1.64.0 → 1.64.1
  (same Chromium), postcss 8.5.29 → 8.5.30, prettier 3.9.9 → 3.9.10,
  stylelint-plugin-use-baseline 1.4.6 → 1.4.7, typescript-eslint 8.71.1 → 8.71.2 and
  @hono/node-server 2.1.4 → 2.1.5. No published package's dependencies changed, so no
  changeset.
- **pixelmatch 8** compares colours in OKLab. On the 80 `pnpm ui:check` screenshots, run-to-run
  noise, lightness shifts and a 1 px layout shift give the same counts as pixelmatch 7 at
  threshold 0.1, and hue changes that 7 missed now fail. The defaults stay (0.1, 0.001).
- **Bundle sizes** moved by a few bytes (gzip −4 to +3 B per example) with rolldown 1.2.12 →
  1.2.14, a transitive update under Vite 8.3.4; every budget holds.
- **The MCP image** base: `node:24-bookworm-slim` (unpinned) → `node:24.22.0-trixie-slim` by
  its index digest. That digest is Docker's 2026-10-21 rebuild of 24.22.0 on a refreshed
  trixie; the Node release itself dates from 2026-10-14.

**Already current:** the Actions (checkout v7.0.1, pnpm/action-setup v6.1.0, setup-node v7.1.0,
each SHA checked against its tag) and CI's Node 24.22.0 and 26.12.0.

**Held back**, with the day each turns two weeks old:

- TypeScript 7 (7.0.2): typescript-eslint accepts only `<6.1`, so 6.0.3 stays, and
  @gyral/mcp's peer stays `>=5.0 <7`.
- Node 24.22.1 and 26.12.1, security releases: 2026-11-04 (CI and the MCP image; the image
  tags were rebuilt since, so check their digests' dates too). 24.22.2: 2026-11-10; 26.13.0:
  2026-11-11.
- Vite 8.3.5: 2026-11-04. It deprecates `rollupOptions`; rename the repo's own uses to
  `rolldownOptions` with it.
- pnpm 12.15.0: 2026-11-04.
- eslint 10.13.0: 2026-10-30. (postcss-styled-syntax 0.7.4 turned two weeks old at 18:16 UTC
  on 2026-10-29 and came in that evening; the CSS lint passes on it.)
  stylelint-plugin-use-baseline 1.4.8 and postcss 8.5.31: 2026-11-01. typescript-eslint
  8.72.0: 2026-11-02. @types/node 26.6.6: 2026-11-11.
- Published packages' dependencies: @modelcontextprotocol/sdk 1.32.2, @babel/parser and
  @babel/types 8.0.8: 2026-11-06. magic-string 1.4.4: 2026-11-09.
- hono 4.13.14 (examples, @gyral/ssr's tests): 2026-11-08. Transitive: fast-uri 3.1.9:
  2026-11-02; body-parser 2.4.0: 2026-11-05.

## Addendum: container images (owner's decision, 2026-10-29)

For a container image the rule applies to the software it carries, not to the digest: a Node
patch release (or Rust, or Debian point release) at least two weeks old, pinned by the digest of
that tag's newest rebuild. Docker Official Images rebuild a tag whenever its Debian base takes
security updates, so an old digest would keep fixes out. Two images take Node 24.22.1 early as a
security exception, because they serve HTTP to the public: gyral-shop's and the MCP server's
(CVE-2026-111497 and the HTTP agent and TLS fixes); the exception ends on 2026-11-03.
