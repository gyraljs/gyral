# Core beliefs

1. **The platform is the framework.** Custom elements, Shadow DOM, forms, `<dialog>`,
   popover, the Navigation and History APIs and modern CSS come first. Gyral adds only what
   the platform lacks: a pure, testable application loop.
2. **Pure core, effects at the edges.** `update` and `view` are pure. Side effects are
   described as data and carried out by drivers. This is the idea we inherit from Cycle.js.
3. **Parse at boundaries.** Events become typed messages in the intent layer. Network data is
   decoded by drivers. The model only sees valid data.
4. **Thin layer, no walled garden.** Every Gyral component is a standard custom element that
   works anywhere, and any custom element works alongside `define()` components (ADR 0018).
5. **Users are never forced into a paradigm.** No streams, no Effect, no decorators are
   required to use Gyral. Those are implementation choices (ADR 0002).
6. **Semantic HTML and accessibility are part of correctness.** Examples are judged on element
   choice and the accessibility tree, not only on behaviour.
7. **Enforce invariants, not implementations.** Rules that matter become lints, scripts or
   tests whose error messages explain the fix. Prose-only rules rot.
8. **The repo is the system of record.** If a decision is not in `docs/` or beads, it does
   not exist for the next agent session.
9. **Test in a real browser.** Vitest browser mode with Chromium; no jsdom.
10. **Measure, then budget.** Bundle size and performance get budgets once v0.1 can be
    measured (bead: bundle-size spike), not before.
