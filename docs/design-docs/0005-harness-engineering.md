# ADR 0005 — Harness engineering: a repo built for agents

Status: **accepted** (2026-10-04)

Based on OpenAI's "Harness engineering" write-up (Feb 2026): humans steer, agents execute,
and the repository has to make that work.

## Decisions

- **Map, not manual.** `AGENTS.md` is a short table of contents (≤ 120 lines, checked).
  `CLAUDE.md` imports it. Detail lives in `ARCHITECTURE.md` and `docs/`.
- **Docs are the system of record** for _why_: design docs with status, indexed and
  link-checked by `scripts/check-docs.mjs`.
- **Beads is the system of record** for _what/when_. This replaces the article's checked-in
  `exec-plans/` and `tech-debt-tracker.md`: use epics for plans and the `tech-debt` label
  for debt. No plan or TODO files.
- **Mechanical invariants over prose.** Layer edges, the dependency allowlist (no Effect, ADR 0015), file size, Baseline
  compatibility and workflow triggers are lints or scripts. Their error messages carry the
  remediation, so an agent can fix them without asking.
- **Legibility.** Every example runs with `pnpm --filter … dev`, and tests run in a real
  browser so agents can check UI behaviour. `pnpm ui:check` lets agents see the result (below).
- **Prefer boring, legible dependencies** that an agent can read in full. Wrap labs packages
  behind thin internal adapters.
- **Garbage collection.** When an agent repeats a bad pattern, encode the fix (doc, lint or
  test) instead of fixing it by hand each time.

## Addendum: agents see UI changes with `pnpm ui:check` (gyral-8ht.7, 2026-10-05)

Unit and browser tests prove behaviour, but not that a page _looks_ right. `pnpm ui:check
[example…]` closes that gap:

- **Runs:** starts the examples with the launcher's port logic (`--port` / `EXAMPLES_PORT`,
  default 5700, so it can run beside `pnpm examples`). Then it drives each example in headless
  Chromium through `examples/<name>/ui-scenario.mjs`: a list of steps (`goto`, `click`, `fill`,
  `check`, `select`, `press`, `waitFor`, `wait`) whose targets are a role and name, a label,
  text, or CSS.
- **Matrix:** desktop (1280) and phone (390) widths, light and dark, with reduced motion.
  Examples that call real network APIs set `once: true` (steps run only in desktop/light) and
  may tolerate network console errors with `allowConsole`.
- **Records:** a full-page screenshot per combination, console errors and warnings (Lit's
  dev-mode notice and Vite's debug output are ignored), horizontal overflow with the widest
  offending elements (shadow roots included), and axe violations.
- **Reports:** `.ui-check/<run>/report.md` (gitignored), a summary table plus per-example
  details with screenshot links. It exits 1 on any console problem, overflow or axe
  violation, and 2 on bad arguments or scenarios.
- **Visual diffs:** `--baseline` saves the run's screenshots to `.ui-check/baseline/`;
  `--compare` pixel-diffs against them with pixelmatch (`--threshold`, default 0.1 per pixel;
  `--max-diff`, default 0.001 of the pixels) and writes diff images.
- **Not part of `pnpm check`:** a full run takes a couple of minutes. Agents run it, at
  least for the examples they touched, before reporting UI work done.

Its first full run found real bugs that every test had missed: link and muted-text contrast
in isomorphic, http-random-user, http-search-github and autocomplete-search, and phone
overflow in hello-lastname (a `fieldset`'s min-content width) and autocomplete-search (the
page's `border-box` reset doesn't reach into shadow roots). All are fixed, and all 19
examples pass.
