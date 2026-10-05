# ADR 0004 — GitHub Actions that run locally

Status: **accepted** (2026-10-04)

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
