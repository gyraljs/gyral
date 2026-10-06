# ADR 0018 — A Gyral-owned view layer (replacing Lit)

Status: **accepted** (2026-10-06, decisions locked with the owner). Specs in
[view/](view/README.md) accepted the same day. Epic: gyral-g1r.

Supersedes the Lit-specific parts of ADR 0001 (view is "a Lit template"), ADR 0010 (`repeat`,
`live`, `classMap`/`styleMap`, `ElementDirective`), ADR 0012 (Lit SSR, `@lit-labs/ssr-client`,
`liveBoolean`, `fillEmptyTextParts`, the evaluation-order fixes), ADR 0014 (the light-DOM stream
filter and hidden markers), ADR 0015 (the `lit-html` pin) and ADR 0016 (runtime whitespace
minification as a template-tag wrapper). Amends ADR 0003 (fallback tiers) and core belief 4.

## Context

Gyral compiles a Model-View-Intent spec into a custom element. Until 0.2.0 the view layer,
element lifecycle, SSR and hydration were Lit (`lit`, `@lit-labs/ssr`, `@lit-labs/ssr-client`).

**Gyral uses a thin slice of Lit.** A census of every tagged template in the examples,
gyral-shop, gyral.dev and devtools (2026-10-06):

- Used: text/child holes, attributes (single and multi-part), `?bool`, `.prop`, element-position
  directives, `nothing` to remove attributes (~280 uses), `repeat` (35), `liveBoolean` (31),
  `invalid` (10), `live` (5), `keyed` (4).
- Never used: `@event` bindings (events are `data-intent`, delegated by core), `svg` templates,
  `classMap`, `ifDefined`, `ref`, `until`, `cache`, `<slot>`, async directives, controllers,
  decorators, attribute reflection or converters. No app subclasses `LitElement`.

**Most of Gyral's hardest code works around Lit:** the light-DOM SSR stream filter and hidden
markers (ADR 0014), production-only hydration bugs from module evaluation order and mangled
private fields (ADR 0012), `checked="false"` from SSR'd property bindings (`liveBoolean` plus a
lint ban), no bindings in `<textarea>` (`textarea()`), empty text parts (`fillEmptyTextParts`),
`defer-hydration` handling with and without Lit's patch (`litDefers()`), the `repeat()` comment
leak in lit-html ≥ 3.3.1 (a pin in every app), runtime whitespace minification (+1.1 KiB), and
`aria-invalid` written twice because element directives don't run on the server.

**Size and speed (measured 2026-10-06):**

| Measure                                                   | Value                                         |
| --------------------------------------------------------- | --------------------------------------------- |
| Lit as Gyral uses it, incl. hydration (esbuild, min/gzip) | 27.5 KB / 10.1 KB                             |
| Lit share of app JS (gzip)                                | counter 35%, gyral.dev 35%, gyral-shop 12%    |
| Smallest app, Gyral 0.2.0 vs plain Lit (gzip)             | 11.9 KiB vs 5.8 KiB                           |
| js-framework-benchmark geomean (0.2.0 release run)        | Gyral 1.20, Lit 1.34, Solid 1.07, Svelte 1.06 |
| select-row: idle before paint vs script                   | 13–18 ms idle vs 2–3 ms script (Solid: 7 ms)  |

Profiling (gyral-benchmarks-profile) shows Gyral's own layer costs about 1 ms per operation; the
gap to Svelte and Solid is DOM work: comment markers (4 per benchmark row), whitespace nodes,
template preparation and update scheduling.

## Decision

Build a view layer for Gyral only. It is not a general-purpose renderer and does not grow
general-purpose features. The priorities, in order: correctness, speed, bundle size.

### Scope and principles

1. **Native-first.** Use a browser primitive wherever one exists, unless it is broken or slow.
   Every module's design notes name the primitive it uses, or why none fits (decision A).
2. **Baseline floor stays widely available** (ADR 0003), with fallbacks graded by cost
   (decision B, written into ADR 0003): degrades on its own → no code; trivial → inline;
   a real implementation → an internal module, lazily imported when ≳ 300 B gzip. Every
   fallback has a removal date tracked as a bead. Never patch globals.
3. **Breaking changes are fine** (0.x, no users). No Lit mentions remain anywhere, including
   core belief 4 ("raw `LitElement` classes are welcome" is reworded to "any custom element").
4. **Dropped:** `svg` templates, `classMap`, `styleMap`, `unsafeCSS`, `static-html`,
   `ElementDirective`/`directive`, `live`, `liveBoolean`, `textarea()`, `repeat`, `keyed`,
   `updateComplete`, `requestUpdate`. The `many`, `themes` and `view-transitions` examples go
   with `styleMap`. `svg` templates, `classMap` and `styleMap` may return if a real feature need
   appears; inline `<svg>` inside `html` keeps working.

### The design (each point has a spec)

| Area           | Decision                                                                                                                                                                                | Spec                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Templates      | One normalizer for compiler, runtime and server; template ids from normalized strings; Vite preset precompiles by default, runtime preparer via `#prepare` otherwise                    | [01-templates](view/01-templates.md)           |
| Bindings       | Child, attribute (single/multi), `?bool`, `.prop`, element hooks with a server half, `raw()`; no event bindings; `null`/`undefined` remove attributes; one spelling for live form state | [02-bindings](view/02-bindings.md)             |
| Lists          | `each(items, key, row, pick?)` only; rows are pure, skipped when item and pick are unchanged                                                                                            | [03-lists](view/03-lists.md)                   |
| Scheduling     | One global scheduler, microtask flush, parents first, post-render work in one place, `settled()`                                                                                        | [04-scheduler](view/04-scheduler.md)           |
| Element base   | `HTMLElement` subclass; props declared with Standard Schema, attributes parsed through it                                                                                               | [05-element](view/05-element.md)               |
| Server         | `@gyral/core/server`: renders from the spec without a DOM; light DOM and DSD natively; synchronous chunked stream                                                                       | [06-server](view/06-server.md)                 |
| Hydration      | Built into core; parallel walk of template and DOM; per-component; dev throws, prod recovers one component                                                                              | [07-hydration](view/07-hydration.md)           |
| Styles         | One shared `CSSStyleSheet` per component class; inline `<style>` in DSD with CSP hashes; swap on hydration                                                                              | [08-styles](view/08-styles.md)                 |
| Template rules | One rule set, surfaced by compiler, dev runtime and `@gyral/core/eslint`                                                                                                                | [09-template-rules](view/09-template-rules.md) |
| Testing        | `await settled()` replaces `el.updateComplete`                                                                                                                                          | [04-scheduler](view/04-scheduler.md)           |

### Where it lives (decision 4)

- `packages/core/src/view/` (and `view/server/`). ESLint enforces that `view/` imports nothing
  else from core and that `view/server/` imports only `view/`. Code outside `view/` uses only
  `view/index.ts`.
- Entry points: `@gyral/core` (browser), `@gyral/core/server` (server rendering, never in client
  bundles), `@gyral/core/vite` (preset and template compiler), `@gyral/core/eslint` (rules).
- `@gyral/ssr` keeps serving concerns only: the page shell, `Response`/stream helpers, store
  seeds, static generation, form actions. `serverHtml` becomes core's `html`.
- `measure-bundles` reports a separate budget for `view/`. If a real need appears, `view/` can be
  extracted as `@gyral/view` without breaking apps.

### Clean room (decision J)

The view layer is designed from Gyral's needs and the platform specs, not adapted from Lit.

- Specs first ([view/](view/README.md)), reviewed by the owner before implementation.
- Implementers work only from the specs, ADRs, conformance tests, WHATWG/W3C specs, MDN and
  `web-features`. They don't open Lit's or another renderer's source while implementing.
- Tests are written from the specs; Lit's test suite is not ported.
- Algorithms are chosen by benchmark and the reason is recorded.
- Guards: the `view/` import boundary, and a provenance script that fails on Lit identifiers
  and markers in Gyral source (`_$litType$`, `$lit$`, `lit-part`, `lit-node`, `litHtmlVersions`,
  `litElementHydrateSupport`, …).
- The research behind this ADR (a survey of Lit's internals) stays outside this repo.

## Targets

Set as budgets in Phase 0 from measurements; these are estimates, not commitments yet.

- View layer (renderer + element base + scheduler + hydration): ~4–5 KB gzip (Lit today: 10.1).
- Smallest app: ≤ 8 KiB gzip, stretch 6 (today 11.9).
- No js-framework-benchmark operation slower than 0.2.0; geomean ≤ 1.20, aiming lower.
- Benchmark row: ≤ 1 comment node (today 4).

## Migration (decision K)

- **Phase 0 on `main`:** this ADR and the specs; size budget in CI from the 0.2.0 baseline;
  benchmark harness pinned; conformance suite runnable against either renderer.
- **Phases 1–7 on branch `next`:** normalizer and rules → client renderer → element base and
  scheduler (with a flush-timing spike) → server renderer → hydration → Vite compiler and ESLint
  rules → migrate examples, devtools, `@gyral/ssr`, `create-gyral`, docs, skill and MCP corpus;
  remove `lit` everywhere.
- **Apps:** pnpm `link:` overrides while iterating; `0.3.0-next.N` prereleases (npm tag `next`)
  from Phase 5. gyral.dev migrates first (server-heavy, 2 islands), gyral-shop second (light DOM,
  islands, lazy chunks, 28 form actions, SSG).
- **Merge gates (`next` → `main`):**
  1. Correctness: all package and example tests green in browser mode and against production
     builds, including the SSR and hydration suite.
  2. Apps: gyral-shop `smoke:prod` passes; gyral.dev builds and deploys to preview.
  3. Size: `view/` and smallest-app budgets met.
  4. Speed: no benchmark operation slower than 0.2.0; better geomean.
  5. Clean room: provenance check clean; no `lit` in any dependency tree.
- Release **0.3.0** with a short "0.2 → 0.3" note.

## Consequences

- Gyral owns its rendering correctness. The conformance suite and the property tests (server
  string equals client DOM) carry that weight; the 28 SSR test files and `smoke:prod` are the
  starting point.
- Lit-ecosystem add-ons (`@lit/context`, `@lit/task`, `@lit/localize`) are no longer options.
  Their ideas map onto Gyral concepts instead: providers for drivers and stores, the effect
  runner for tasks, and an i18n design of our own (gyral-1zd.12 needs re-scoping).
- Any custom element still works next to Gyral components, including ones built with Lit; Gyral
  just no longer ships or depends on Lit.
- The template compiler becomes part of the default toolchain, so templates can be checked and
  prepared at build time; the runtime path keeps "no build step" working.
