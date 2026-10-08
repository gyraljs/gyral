# ADR 0018 — A Gyral-owned view layer (replacing Lit)

Status: **accepted** (2026-10-06, decisions locked with the owner), shipped in 0.3.0 (tagged
v0.3.0, 2026-10-07). Specs in [view/](view/README.md) accepted the same day. Epic: gyral-g1r.

Supersedes the Lit-specific parts of ADR 0001 (view is "a Lit template"), ADR 0005 (the Lit
dev-mode notice `ui:check` ignored), ADR 0006 (`@lit/context` as an alternative, the Lit
dev-mode banner), ADR 0007 (prop declarations, Lit's `willUpdate` and reactive accessors),
ADR 0008 (form-state bindings, `invalid()` without a server half, Lit markers in server
output), ADR 0010 (`repeat`, `keyed`, `live`, `classMap`/`styleMap`, `unsafeCSS`,
`ElementDirective`), ADR 0012 (Lit SSR, `@lit-labs/ssr-client`, `liveBoolean`,
`fillEmptyTextParts`, the evaluation-order fixes), ADR 0013 (the Lit SSR DOM-shim store scope),
ADR 0014 (the light-DOM stream filter and hidden markers), ADR 0015 (the `lit-html` pin) and
ADR 0016 (runtime whitespace minification as a template-tag wrapper). Amends ADR 0003
(fallback tiers) and core belief 4.

## Context

Gyral compiles a Model-View-Intent spec into a custom element. Until 0.2.0 the view layer,
element lifecycle, SSR and hydration were Lit (`lit`, `@lit-labs/ssr`, `@lit-labs/ssr-client`).

**Gyral used a thin slice of Lit.** A census of every tagged template in the examples,
gyral-shop, gyral.dev and devtools (2026-10-06):

- Used: text/child holes, attributes (single and multi-part), `?bool`, `.prop`, element-position
  directives, `nothing` to remove attributes (~280 uses), `repeat` (35), `liveBoolean` (31),
  `invalid` (10), `live` (5), `keyed` (4).
- Never used: `@event` bindings (events are `data-intent`, delegated by core), `svg` templates,
  `classMap`, `ifDefined`, `ref`, `until`, `cache`, `<slot>`, async directives, controllers,
  decorators, attribute reflection or converters. No app subclasses `LitElement`.

**Most of Gyral's hardest code worked around Lit:** the light-DOM SSR stream filter and hidden
markers (ADR 0014), production-only hydration bugs from module evaluation order and mangled
private fields (ADR 0012), `checked="false"` from SSR'd property bindings (`liveBoolean` plus a
lint ban), no bindings in `<textarea>` (`textarea()`), empty text parts (`fillEmptyTextParts`),
`defer-hydration` handling with and without Lit's patch (`litDefers()`), the `repeat()` comment
leak in lit-html ≥ 3.3.1 (a pin in every app), runtime whitespace minification (+1.1 KiB), and
`aria-invalid` written twice because element directives don't run on the server.

**Size and speed (measured 2026-10-06):**

| Measure                                                         | Value                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Lit as Gyral 0.2.0 used it, incl. hydration (esbuild, min/gzip) | 27.5 KB / 10.1 KB                                                                   |
| Lit share of app JS (gzip)                                      | counter 35%, gyral.dev 35%, gyral-shop 12%                                          |
| Smallest app, Gyral 0.2.0 vs plain Lit (gzip)                   | 11.9 KiB vs 5.8 KiB                                                                 |
| js-framework-benchmark geomean (0.2.0 release run)              | Gyral 1.20, Lit 1.34, Solid 1.07, Svelte 1.06                                       |
| select-row: total minus script vs script                        | 13–18 ms vs 2–3 ms script (Solid: 7 ms); frame alignment, not Gyral (view/04 spike) |

Profiling (gyral-benchmarks-profile) showed that 0.2.0's own layer cost about 1 ms per operation;
the gap to Svelte and Solid was DOM work: comment markers (4 per benchmark row), whitespace nodes,
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
3. **Breaking changes are fine** (0.x, no users). Lit leaves the code, the dependencies and
   every doc that describes how Gyral works, including core belief 4 ("raw `LitElement`
   classes are welcome" is reworded to "any custom element"). History (ADR notes, dated
   benchmarks) keeps its Lit references.
4. **Dropped:** `svg` templates, `classMap`, `styleMap`, `unsafeCSS`, `static-html`,
   `ElementDirective`/`directive`, `live`, `liveBoolean`, `textarea()`, `repeat`, `keyed`,
   `updateComplete`, `requestUpdate`. The `many`, `themes` and `view-transitions` examples go
   with `styleMap`. `svg` templates, `classMap` and `styleMap` may return if a real feature need
   appears; inline `<svg>` inside `html` keeps working. **`svg` returned in 0.3.1** for a real
   need: sabacc.starwars.run's SVG fragments (below, "svg templates return").

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

Estimates set before implementation (Phase 0); the size budgets came from measurements. What
was reached is in "Size pass" and "Result" below.

- View layer (renderer + element base + scheduler + hydration): ~4–5 KB gzip (Lit in 0.2.0:
  10.1).
- Smallest app: ≤ 8 KiB gzip, stretch 6 (0.2.0: 11.9).
- No js-framework-benchmark operation slower than 0.2.0; geomean ≤ 1.20, aiming lower.
- Benchmark row: ≤ 1 comment node (0.2.0: 4).

### Size pass (gyral-g1r.18, 2026-10-06): measured

`pnpm size` (production, Gyral preset, gzip; `initial` = entry chunk and its static imports,
what a page downloads before any `import()`):

| Bundle                   | 0.2.0 | before the pass | after: initial | after: all chunks |
| ------------------------ | ----- | --------------- | -------------- | ----------------- |
| hello-world              | 12.2  | 14.3            | **8.9**        | 11.3              |
| counter                  | 12.2  | 14.3            | 8.9            | 11.3              |
| isomorphic (SSR)         | 17.3  | 17.8            | 13.0           | 15.6              |
| no-js-first (SSR, forms) | 18.7  | 19.2            | 16.8           | 19.3              |
| view line                | —     | 7.2             | 7.0            | 7.0               |

How (each in view/ or core, see the specs): features register themselves when their API is
called (`each`, `raw`, `defineHook`, `command()`, `defineStore()`, the prop builders; view/05
"Features register themselves"), hydration and islands load lazily with the first seeded host
(view/07 "Loading"), the invoker fallback is an ADR 0003 tier-3 `import()`, production messages
are short, and compiled builds no longer carry the runtime template cache.

Against the targets above:

- **Smallest app ≤ 8 KiB: not met** (8.9 initial). The owner's bar for this pass, ≤ 9.0, is met.
  Stretch 6: 2.9 KiB away.
- **All chunks are larger than one bundle** by about 1 KiB: the split-off hydration chunk
  (2.8 KiB) compresses on its own, and Vite adds its preload helper (about 0.5 KiB, in the
  initial chunk) to every app with an `import()`. Client-only pages never fetch the chunk; a
  server-rendered page fetches it one round trip after the entry. Nine examples that use
  `each`, stores or forms stay above their 0.2.0 all-chunks baseline; every initial chunk is
  2.4–5.4 KiB below its 0.2.0 bundle (`scripts/size-budget.json` now caps both).
- Apps that use a feature ship it: hello-world shed 5.4 KiB, no-js-first (forms, stores, lists,
  hooks, commands, server-rendered) 2.5 KiB.
- Renderer speed unchanged: every `pnpm bench:view` operation stayed faster than lit-html (the
  last in-repo comparison, before Phase 7 removed Lit, is in view/03-lists.md).

What further cuts would cost (largest first):

1. Vite's preload helper (~0.5 KiB): only removable at the bundler level (a preset plugin that
   drops wrappers with no dependencies, rewriting Vite's output; fragile), or by not splitting.
2. Instantiation plans computed by the compiler (~0.5 KiB; `plan.ts`'s builder): compiled
   template objects grow by their walk ops (tens of bytes each); the runtime path keeps the
   builder behind `#prepare`.
3. Custom states and view transitions behind `import()` (~0.15 KiB): the first state sync or
   transition happens a round trip later.
4. Keyed lists, for apps that use them: LIS only (−0.08 KiB) made swaps slower than lit-html;
   two-ended only (−0.13 KiB) made "replace first and last" about 5× slower (view/03).
5. ~~A `modulepreload` hint for the hydration chunk from `@gyral/ssr`~~: done in Phase 7
   (gyral-g1r.21, view/07 "Loading"): `clientAssetsFromManifest()` and
   `page({ modulepreload })` remove the extra round trip for server-rendered pages.

### Template ids out of production client builds (gyral-g1r.22, 2026-10-06): measured

After the compact template form (view/01 "The template object"), ids were about a fifth of
the compiled templates' gzip size. Production client builds now leave them out, and the
renderer compares template objects by identity there (view/01 "Template ids"). On the corpus
(264 call sites, 210 objects, minified): 35.8 → 32.4 KB raw, **10.32 → 8.27 KiB gzip**. The
examples carry few templates, so their bundles shrink by tens of bytes; an app with many
templates (gyral.dev, gyral-shop) saves about 10 B gzip per template. `pnpm size`, KiB gzip:

| Bundle                   | initial before | initial after | all chunks before | all chunks after |
| ------------------------ | -------------- | ------------- | ----------------- | ---------------- |
| hello-world              | 8.87           | **8.86**      | 11.23             | 11.22            |
| counter                  | 8.79           | 8.78          | 11.15             | 11.14            |
| isomorphic (SSR)         | 12.94          | 12.87         | 15.44             | 15.35            |
| no-js-first (SSR, forms) | 16.67          | 16.60         | 19.12             | 19.04            |
| shared-cart              | 12.98          | 12.91         | 15.35             | 15.27            |
| view line                | 6.90           | 6.90          | 6.90              | 6.90             |

Every example got smaller: 2-98 B all chunks, 5-81 B initial. Budgets are now measured + 0.1
KiB. `pnpm bench:view` unchanged within noise (the benchmark uses the runtime path, whose
objects keep their ids; the renderer gained one comparison on a template switch).

### Measuring (Phase 0)

- **Size:** `pnpm size:check` (part of `pnpm check`) fails when an example's gzip bundle
  exceeds `scripts/size-budget.json`. The budgets start at 0.2.0 + 0.1 KiB and only go down; the
  script suggests a lower budget when a bundle is 0.5 KiB under. A separate `view` line was
  added once the view layer existed (Phase 2).
- **Speed:** the baseline is gyral-benchmarks `results/2026-10-06-release-0.2.0-a3` (drift
  flagged, so used for orientation only). The Phase 8 gate is a fresh run in which
  `frameworks/gyral` (published 0.2.0) and a `frameworks/gyral-next` variant (tarballs packed
  from `next`, never published) are measured **in the same run**, and compared only within it.

## Result (Phase 8, 2026-10-06)

One gyral-benchmarks run measured published 0.2.0 and 0.3.0-next.6 (commit 2cc2704) together
with Lit, Solid, Svelte, Vue, Preact and React (`results/2026-10-06-gyral-0.3-final/` on the
benchmark repo's `gyral-next` branch; calibration spread 3.3%, no drift flag).

- **Speed gate: pass.** 0.3 is slower than 0.2.0 on no operation (Mann–Whitney and bootstrap
  CI per operation); faster beyond noise on create 1k (−3%), replace (−5%), update (−4%),
  swap (−22%), create 10k (−4%), append (−6%) and clear (−24%); select and remove within
  noise. Geomean vs fastest: **Gyral 0.3 1.03**, Svelte 1.07, Solid 1.08, Vue 1.20, Gyral 0.2.0
  1.20, Lit 1.31, Preact 1.40, React 1.53.
- **Size:** floor app 8.6 KiB gzip for the entry chunk (11.6 counting the lazy hydration and
  invoker chunks client-only pages never fetch) vs 0.2.0's 11.9; todo 10.5 / 13.6 vs 13.6;
  search and table are 1.0 / 0.2 KiB larger than 0.2.0 when every chunk is counted. The
  ≤ 8 KiB floor target is not met (8.6).
- **Memory / startup:** heap after load 1.18 MB (0.2.0: 1.26); todo interactive cold 425 ms
  (0.2.0: 445; Lit 410, Solid 407).
- **Apps:** gyral-shop server rendering 2.6–3.7× faster (category 12.1 → 3.3 ms), entry chunk
  10.2 → 7.9 KiB, every page downloads less JS; gyral.dev island entry 17.6 → 14.1 KB gzip
  plus a 2.9 KB preloaded hydration chunk, strict CSP without `'unsafe-inline'` styles.

### svg templates return (gyral-c5d.8, 0.3.1)

The need: sabacc.starwars.run renders small SVG fragments (marks, labels)
as templates of their own, ``${cond ? svg`<path …/>` : nothing}`` inside an `<svg>` of an `html`
template. Rule 10 rejected them in `html` (the HTML parser would make HTML elements of a
top-level `<path>`), so the team inlined every variant in one `<svg>` with `display="none"`
slots. `svg` is back, on Gyral's terms (view/01 "svg templates"):

- The template object carries `svg: true`; the normalizer builds its tree as SVG content from
  the top (rule 10 turned around: HTML at its top level is the error), and its id differs from
  the same strings as `html`.
- The client parses its HTML inside an `<svg>` and keeps that element's children: the HTML
  parser's own foreign-content rules create the nodes (namespace, camelCase names, namespaced
  static attributes). The server writes it as is inside the parent's `<svg>`; hydration walks
  it like any template.
- An `svg` template renders only inside SVG content: elsewhere it is a development error on
  both sides. Bound namespaced attributes (`xlink:href=${…}`) are a rule 10 error pointing to
  SVG 2's `href`; bound attribute names on SVG elements take the parser's spelling
  (`viewbox` → `viewBox`).
- **Size:** only apps that use `svg` carry it (`svgTemplate` and `compiledSvg`, about 0.2 KB
  minified); every example's `pnpm size` is unchanged within module-order noise (−19 to
  +13 B gzip, `view` −4 B). An app toggling one `<path>` with `svg` instead of a
  `display=${…}` attribute: +272 B minified, +85 B gzip, its extra template object included.

### 0.3.1 size work (gyral-c5d.2, gyral-c5d.11–.15, 2026-10-07): measured

Prompted by sabacc.starwars.run's bundle (c5d.10): optional machinery that apps reach through
data rather than an API call, and text, still shipped to apps that never used it. Each change
keeps behaviour for apps that don't opt in:

1. **`defineDisposableHook`** (c5d.2, view/02): a hook's teardown is a function of its own, so
   the disposal tracking ships only with it, not with every `defineHook`.
2. **Client-only builds** (c5d.11, view/07 "Client-only builds"): the preset's
   `clientOnly: true` leaves out the hydration loader and its chunk, the invoker-command
   fallback unless a module may use command intents, and with them Vite's preload helper.
3. **Spec-field features registered by the build** (c5d.12, view/05 "Features register
   themselves"): view transitions, the frame lane and custom states are bundled only when a
   module names `viewTransition`, `renderOnFrame` or `states`; the runtime path keeps all three.
4. **Production diagnostics as codes** (c5d.13): `Gyral G0010 <args…> <docs URL>`; the texts
   live in one table (`view/messages.ts`) that development bundles and
   `docs/references/errors.md` is generated from.
5. **No property path for props in production** (c5d.14, view/05 "When props are validated"),
   and `prop.value(check)` checks that are plain references are dropped from production client
   builds.
6. **`@gyral/time/delay`** (c5d.15, ADR 0006): delay and debounce over a delay-only driver.

`pnpm size`, KiB gzip, all chunks / initial (`(clientOnly)`: the same app built with
`clientOnly: true`):

| Bundle                   | 0.3.0         | before (063416a) | 0.3.1           |
| ------------------------ | ------------- | ---------------- | --------------- |
| hello-world              | 11.22 / 8.86  | 11.27 / 8.90     | 10.81 / 8.42    |
| hello-world (clientOnly) | —             | —                | **7.35 / 7.35** |
| counter                  | 11.14 / 8.78  | 11.19 / 8.81     | 10.72 / 8.34    |
| counter (clientOnly)     | —             | —                | 7.27 / 7.27     |
| isomorphic (SSR)         | 15.35 / 12.87 | 15.41 / 12.95    | 14.86 / 12.36   |
| autocomplete-search      | 17.27 / 14.92 | 17.56 / 15.19    | 16.66 / 14.29   |
| no-js-first (SSR, forms) | 19.04 / 16.60 | 19.11 / 16.65    | 18.27 / 15.83   |
| view line                | 6.90          | 7.13             | 6.87            |

Per change, on hello-world (all chunks / initial, bytes): disposable hooks 0 (autocomplete-search
−257 / −250, view −244), spec-field features −282 / −289, codes −173 / −184, property path −33
/ −30; client-only −3,538 / −1,092 on top (no hydration chunk, no preload helper); the
delay-only examples −153 to −172 with `@gyral/time/delay`. Every example shrank; the budgets
raised during 0.3.1 are restored and all are measured + 0.1 KiB again.

Against the targets: the smallest app, ≤ 8 KiB, **is met by client-only builds** (7.35; stretch
6 is 1.35 KiB away) and missed by 0.4 KiB otherwise (8.42 initial, which includes the hydration
loader and the preload helper a server-rendered page needs).

## Migration (decision K)

The plan, as carried out:

- **Phase 0 on `main`:** this ADR and the specs; size budget in CI from the 0.2.0 baseline;
  benchmark harness pinned; conformance suite runnable against either renderer.
- **Phases 1–7 on branch `next`:** normalizer and rules → client renderer → element base and
  scheduler (with a flush-timing spike) → server renderer → hydration → Vite compiler and ESLint
  rules → migrate examples, devtools, `@gyral/ssr`, `create-gyral`, docs, skill and MCP corpus;
  remove `lit` everywhere.
- **Apps:** pnpm `link:` overrides while iterating; from Phase 5, tarballs packed from `next`
  (`pnpm pack`, consumed with `file:`), so the apps test the exact published artifact. **Nothing
  is published to npm before 0.3.0** (owner decision, 2026-10-06). gyral.dev migrates first
  (server-heavy, 2 islands), gyral-shop second (light DOM, islands, lazy chunks, 28 form
  actions, SSG).
- **Merge gates (`next` → `main`):**
  1. Correctness: all package and example tests green in browser mode and against production
     builds, including the SSR and hydration suite.
  2. Apps: gyral-shop `smoke:prod` passes; gyral.dev builds and deploys to preview.
  3. Size: `view/` and smallest-app budgets met.
  4. Speed: no benchmark operation slower than 0.2.0; better geomean.
  5. Clean room: provenance check clean; no `lit` in any dependency tree.
- Release **0.3.0** (merged and tagged 2026-10-07) with a short "0.2 → 0.3" note:
  [migrating-0.2-to-0.3.md](../references/migrating-0.2-to-0.3.md) (Phase 7).

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
