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
- **Mechanical invariants over prose.** Layer edges, the Effect boundary, file size, Baseline
  compatibility and workflow triggers are lints or scripts. Their error messages carry the
  remediation, so an agent can fix them without asking.
- **Legibility.** Every example runs with `pnpm --filter … dev`, and tests run in a real
  browser so agents can check UI behaviour. Planned: DevTools/screenshot-driven checks.
- **Prefer boring, legible dependencies** that an agent can read in full. Wrap labs packages
  behind thin internal adapters.
- **Garbage collection.** When an agent repeats a bad pattern, encode the fix (doc, lint or
  test) instead of fixing it by hand each time.
