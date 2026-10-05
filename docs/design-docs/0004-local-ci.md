# ADR 0004 — GitHub Actions that run locally

Status: **accepted** (2026-10-04); **amended 2026-10-05**: the repository is public, so `ci.yml`
runs on GitHub for pushes and pull requests (see the second addendum). The rest still holds.

## Decision

CI is defined as standard GitHub Actions workflows in `.github/workflows/`, but they **never
run on GitHub-hosted runners**, so they cost no Actions minutes:

- Workflows trigger on `workflow_dispatch` only. `scripts/check-workflows.mjs` (part of
  `pnpm check`) fails if any other trigger (`push`, `pull_request`, `schedule`, …) appears.
- They run locally in Docker with [`gh act`](https://github.com/nektos/gh-act):
  `pnpm ci:local`. `.actrc` maps `ubuntu-latest` to `catthehacker/ubuntu:act-latest`.
- `pnpm ci:local` runs `scripts/ci-local.mjs`, which streams act's output and exits by the
  **jobs' results** (`🏁 Job succeeded/failed`, parsed by `scripts/lib/act.mjs`), not by act's
  exit code. On rootless Docker, act can exit 1 after a green job because removing the
  container times out (gyral-8ht.8). No job result at all counts as a failure.

## Requirements

Docker running; `gh extension install nektos/gh-act`. The first run pulls a large image.

## Rejected for now

A self-hosted runner on this machine would also be free and would react to pushes. It needs a
long-running service and repository runner registration. Revisit if agent PR loops need
CI on push.

## Addendum (2026-10-05): releases are the one GitHub-hosted exception

`.github/workflows/release.yml` publishes to npm and **does** run on a GitHub-hosted runner.
npm trusted publishing (OIDC, no long-lived `NPM_TOKEN`) and provenance attestations only
work from GitHub-hosted runners, and a token on a laptop is the larger risk. The exception is
narrow on purpose:

- Still `workflow_dispatch` only (the `check-workflows` rule is unchanged); the owner starts it.
- The job targets the `npm` environment, which needs the owner's approval before any step runs.
- `permissions` are just `contents: write` (tags, GitHub release) and `id-token: write` (OIDC).
- Third-party actions are pinned by commit SHA.
- `pnpm ci:local` never runs it (it runs `ci.yml` only), and the job is skipped outside
  `gyraljs/gyral`'s `main`.

A release costs one runner run of a few minutes. Everything else stays local. Runbook:
[docs/references/releasing.md](../references/releasing.md).

## Addendum (2026-10-05): public repository, CI on GitHub

gyraljs/gyral is public. GitHub-hosted runners are free for public repositories, and outside
contributors need their pull requests checked automatically. So (bead gyral-i7g.8):

- **`ci.yml` triggers on `push` to `main`, `pull_request` and `workflow_dispatch`.** Its job
  `pnpm check` runs the gate. The `main` ruleset requires that check.
- **The token is read-only** (`permissions: contents: read`) and checkout does not persist
  credentials, so a pull request's code cannot write to the repository.
- **`pull_request_target` is forbidden everywhere**: it runs untrusted code with write access
  and secrets.
- **Every other workflow stays `workflow_dispatch`-only.** `release.yml` keeps the first
  addendum's rules and must use `environment: npm`.
- `scripts/check-workflows.mjs` enforces all of the above (`checkWorkflow` in
  `scripts/lib/invariants.mjs`).
- `pnpm ci:local` still runs the same workflow locally with `gh act` before pushing.

Private repositories (gyral-shop while private) keep the original rule: `workflow_dispatch`
only, run locally.
