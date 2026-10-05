# Contributing to Gyral

Thanks for helping. Gyral is pre-alpha, so APIs still move; open an issue to discuss anything
larger than a bug fix before you write the code.

## Development setup

You need Node 24+ and pnpm 10 (`corepack enable` picks the version from `package.json`).

```sh
git clone https://github.com/gyraljs/gyral.git
cd gyral
pnpm install
pnpm exec playwright install chromium   # once per machine, for the browser tests
pnpm check                              # the full gate
```

`pnpm examples` runs every example (index at http://localhost:5100). The other scripts are
listed in [AGENTS.md](AGENTS.md#commands).

## The gate

`pnpm check` is the single quality gate: typecheck, ESLint and stylelint, Prettier,
repository invariants (docs map, workflow triggers, no Effect types in public declarations),
the browser and Node test suites, fixture stability, and `pnpm pack:check` (the published
tarballs). A pull request must pass it locally. CI does not run on GitHub
([ADR 0004](docs/design-docs/0004-local-ci.md)); `pnpm ci:local` runs the same workflow in
Docker if you want a clean-room run.

## Pull requests

- Keep each PR to one change, with tests. Bugs get a failing test first.
- If a published package changes, add a changeset: `pnpm changeset` (patch, minor or major,
  plus a one-line summary for the changelog). See [.changeset/README.md](.changeset/README.md).
- Follow the house rules in [AGENTS.md](AGENTS.md): pure views, Effect only under
  `src/internal/`, Baseline browser features, files under 300 lines.

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line certifying the
[Developer Certificate of Origin](https://developercertificate.org/): that you wrote the
change or otherwise have the right to submit it under the project's MIT license.

```sh
git commit -s -m "fix(router): keep the hash on navigate"
```

Forgot? `git commit --amend -s` for the last commit, or `git rebase --signoff main` for a
branch.

## Work tracking

Maintainers track work in [beads](https://github.com/gastownhall/beads) (`bd ready` lists open
work). You don't need beads to contribute: GitHub issues and pull requests are fine.

## Design decisions (ADRs)

Decisions that shape the API or architecture are recorded in
[docs/design-docs/](docs/design-docs/index.md). To propose one, add
`docs/design-docs/NNNN-short-title.md` (next free number, status **proposed**: context,
decision, consequences, alternatives), list it in the index, and open a PR for discussion.
It becomes **accepted** when merged. Read [core-beliefs.md](docs/design-docs/core-beliefs.md)
first.

## Conduct and security

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security
problems privately, as described in [SECURITY.md](SECURITY.md), never in a public issue.
