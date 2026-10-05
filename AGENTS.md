# AGENTS.md — Gyral

Gyral is a web framework: Model-View-Intent components compiled to Lit custom elements,
built on current web-platform standards. Inspired by Cycle.js. This file is a **map**;
details live in the linked docs, which are the system of record.

## Start every session

1. `bd prime`, then `bd ready`. Beads is the only task tracker (no TODO files or plans in chat).
2. Claim before coding: `bd update <id> --claim`. File discovered work with
   `--deps discovered-from:<id>`. Close with `--reason`.
3. Read the design doc that governs the area you touch (table below).

## Commands

| Command                                    | What it does                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm install`                             | Install (pnpm workspaces: `packages/*`, `examples/*`)                                                |
| `pnpm check`                               | **The gate.** typecheck + lint + format + invariants + tests                                         |
| `pnpm test`                                | Vitest: browser project (Chromium) + node project (scripts)                                          |
| `pnpm invariants`                          | Docs map, workflow triggers, public-API purity                                                       |
| `pnpm ci:local`                            | Run `.github/workflows/ci.yml` locally in Docker via `gh act`                                        |
| `pnpm --filter @gyral-examples/<name> dev` | Run an example with Vite                                                                             |
| `pnpm examples [name…]`                    | Run all (or named) examples; index at http://localhost:5100 (`EXAMPLES_PORT=5400` for a second copy) |

First run needs `pnpm exec playwright install chromium`.

## Where things are

| Path                                                                   | Contents                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                     | Packages, layers, allowed dependency edges                              |
| `packages/core`                                                        | `define()`, intent parsing, MVI runtime (`@gyral/core`)                 |
| `packages/*/src/internal`                                              | The only place Effect may be imported                                   |
| `examples/*`                                                           | Ports of the Cycle.js examples; the acceptance suite                    |
| `scripts/`                                                             | Invariant checks (`lib/invariants.mjs` + tests)                         |
| [docs/design-docs/](docs/design-docs/index.md)                         | Decisions and beliefs (ADRs)                                            |
| [docs/references/consumer-setup.md](docs/references/consumer-setup.md) | How apps install Gyral: Lit as a peer, Vite dedupe                      |
| `archive/` (gitignored)                                                | Old Cycle.js source. Reference only; never import or copy-paste blindly |

## Design docs to read before changing…

| Area                                   | Read                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Anything                               | [core-beliefs.md](docs/design-docs/core-beliefs.md)                         |
| Component model, intents, update, view | [0001-mvi-parsed-intent.md](docs/design-docs/0001-mvi-parsed-intent.md)     |
| Effects, drivers, runtime internals    | [0002-effect-boundary.md](docs/design-docs/0002-effect-boundary.md)         |
| Commands and driver API                | [0006-effects-and-drivers.md](docs/design-docs/0006-effects-and-drivers.md) |
| Props, `PropsChanged`                  | [0007-props.md](docs/design-docs/0007-props.md)                             |
| Forms, validation, `invalid()`         | [0008-forms.md](docs/design-docs/0008-forms.md)                             |
| Routing, URL changes                   | [0009-router.md](docs/design-docs/0009-router.md)                           |
| Child components, collections          | [0010-child-components.md](docs/design-docs/0010-child-components.md)       |
| Server rendering, hydration            | [0012-ssr.md](docs/design-docs/0012-ssr.md)                                 |
| Shared state, stores                   | [0013-shared-state.md](docs/design-docs/0013-shared-state.md)               |
| Light DOM, page-level components       | [0014-light-dom.md](docs/design-docs/0014-light-dom.md)                     |
| Browser APIs, CSS features             | [0003-browser-baseline.md](docs/design-docs/0003-browser-baseline.md)       |
| CI, GitHub Actions                     | [0004-local-ci.md](docs/design-docs/0004-local-ci.md)                       |
| Repo docs, lint rules, this file       | [0005-harness-engineering.md](docs/design-docs/0005-harness-engineering.md) |
| Why Gyral differs from Cycle.js        | [lessons-from-cyclejs.md](docs/design-docs/lessons-from-cyclejs.md)         |

## Skills to load

- `lit-web-apps` — components, SSR, routing, testing (Lit is the view layer).
- `modern-css` — all component and example styles.
- `semantic-html` — markup in views and examples (element choice, a11y, i18n).
- `effect-fp-skill` — **only** inside `packages/*/src/internal/**` (see ADR 0002 for the
  exceptions to that skill: the public API is plain TypeScript and uses Promises).
- `beads` — work tracking.

## Hard rules (enforced by `pnpm check`)

- No `effect` / `@effect/*` imports outside `src/internal/`; no Effect types in public `.d.ts`.
- `@gyral/core` imports no other `@gyral/*` package.
- Views are pure: name intents with `data-intent=${i.Tag}`, never attach closures.
- Browser code must pass the Baseline policy (`.browserslistrc`), or feature-detect.
- Workflows trigger on `workflow_dispatch` only. Never add `push`/`pull_request`.
- Files ≤ 300 lines. No `any`, no non-null assertions.
- Every design doc is listed in `docs/design-docs/index.md`; AGENTS.md stays ≤ 120 lines.

## When you are stuck

Treat it as a missing capability: add the doc, lint, script or test that would have
prevented it, then file a bead for anything left over. Don't add rules to this file;
add a design doc and link it here.
