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
