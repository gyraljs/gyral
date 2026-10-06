# View-layer specs

Behavioural specs for Gyral's own view layer ([ADR 0018](../0018-view-layer.md), epic
gyral-g1r). They say **what** happens and why, in Gyral's terms. They are the only design input
for implementation (clean room, below).

Status: **accepted** (2026-10-06, reviewed by the owner). Change a spec before
changing behaviour; a spec and its conformance tests move together.

| Spec                                         | Covers                                                                                    | Phase |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | ----- |
| [01-templates.md](01-templates.md)           | `html`, normalization, whitespace, template ids, the template object, compiled vs runtime | 1, 6  |
| [02-bindings.md](02-bindings.md)             | Binding kinds and value rules, live form state, element hooks, `raw()`, `nothing`         | 2     |
| [03-lists.md](03-lists.md)                   | `each(items, key, row, pick?)`, row skipping, reconciliation, the dev check               | 2     |
| [04-scheduler.md](04-scheduler.md)           | Dirty marking, the flush, post-render work, view transitions, `settled()`                 | 3     |
| [05-element.md](05-element.md)               | `define()`'s element, props through Standard Schema, attributes, lifecycle                | 3     |
| [06-server.md](06-server.md)                 | `@gyral/core/server`, component rendering, light and DSD output, seeds, streaming         | 4     |
| [07-hydration.md](07-hydration.md)           | Parallel walk, per-component hydration, islands, mismatches, typed input                  | 5     |
| [08-styles.md](08-styles.md)                 | `css`, shared sheets, DSD styles, CSP hashes, the hydration swap                          | 3–5   |
| [09-template-rules.md](09-template-rules.md) | Errors and warnings, where they surface, message style                                    | 1, 6  |

## Words used in every spec

- **Template:** the static part of one `html` call site, after normalization. Identified by its
  **template id**.
- **Template result:** what `html` returns at runtime: a template plus this render's values.
- **Hole:** a `${…}` position in a template. Its **kind** comes from where it sits (02).
- **Part:** the live object that owns one hole in one rendered instance and remembers its
  **committed value**.
- **Instance:** the DOM cloned from a template, plus its parts.
- **Host:** a Gyral component element. Its **root** is its shadow root, or the host itself in
  light-DOM mode (`shadow: false`).
- **Flush:** one run of the scheduler that renders every dirty host (04).
- **Native primitive:** the browser API a mechanism is built on. Every spec has a "Native
  primitives" section listing them, with Baseline status from `web-features` (3.35.0). "Widely
  available" dates are 30 months after "newly available".

## Clean room

- Implement from these specs, the ADRs, the conformance tests, the WHATWG HTML and DOM
  standards, CSSOM, MDN and `web-features` only.
- Don't open Lit's source (or any other renderer's) while implementing: not `node_modules/lit*`,
  not a Lit checkout. If a spec is unclear, fix the spec.
- Write tests from the specs. Don't port another library's tests.
- When choosing an algorithm (for example keyed reconciliation), benchmark the candidates and
  record the result and the reason in the spec.
- `scripts/check-provenance.mjs` (Phase 1) fails on Lit identifiers and markers in Gyral source.

## Conformance

Every spec section that states behaviour has tests in `packages/core/test/view/` named after
it. Two properties run with fast-check over generated templates and values:

1. **Server equals client:** the server string for a template result, parsed by the browser,
   has the same DOM (via `getHTML()`) as the client rendering of the same result. Form state is
   compared by its live properties (`value`, `checked`, `selected`), not by those attributes:
   the browser writes the `value`/`checked`/`selected` attributes only on first creation (02),
   so after an update they legitimately differ from a fresh server string.
2. **Hydration is identity:** hydrating server output and then rendering a second result gives
   the same DOM as client-rendering the second result directly, and keeps the server's nodes.
