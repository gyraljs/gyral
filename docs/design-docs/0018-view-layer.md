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
   need: an app's SVG fragments (below, "svg templates return").

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

The need: an app migrated to Gyral renders small SVG fragments (marks, labels)
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

Prompted by a migrated app's bundle (c5d.10): optional machinery that apps reach through
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

## Addendum: hook order (gyral-1zd.27, 0.3.1)

Element hooks' `client` calls used to run right after each host's own render, in document order.
The scheduler renders parents before children (04), so a parent's hook ran before the child
components it had just given new props had rendered: a hook measuring a list, or scrolling to
a child's row, saw last render's DOM. Apps worked around it with observers and animation-frame
loops, and with counters in the model only there to make a hook run again.

Decision:

- Inside a scheduler flush, queued `client` calls wait until every dirty host has rendered, then
  run **children first**: the last-rendered root's calls first (the scheduler renders by depth,
  so children render after their parents), each root's own calls in document order. A
  `render` call outside the scheduler runs its calls when it returns. This is the order React
  and Vue run effects and `mounted` hooks in: child components first, after the whole commit.
- `defineHook({ client, update: 'always' })` runs `client` on every render that commits the
  hook's position, not only when an argument changed.
- The runner (`view/render/hook-run.ts`) is installed by `defineHook`/`defineDisposableHook`,
  so apps without hooks bundle none of it. Apps with hooks pay about 0.3 KiB gzip for the
  batching and ordering (measured on the form examples).

Tested in `core/test/hook-order.test.ts`.

## Addendum: render skipping, `each` equality, subscription delivery (0.3.8, gyral-337.1)

Owner's decisions, 2026-10-29 (review recommendation #2). Projects avoided wasted renders by
hand: joystyk deduplicated subscription output in 10 places, sabacc batched per microtask, and
enterprise-ui wrote `equals: sameJson` 15 times.

Correction (0.3.9, gyral-4rp): this addendum first also counted containment's 12-field compare
and football-pool-tracker's race chart among the workarounds 0.3.8 removes. It removes neither.
Render skipping helps only when `update` returns the same state. Containment compares 12 fields
of its HUD snapshot before sending a message: every HUD message carries a new
object, so state changes by identity and the view can't skip. Without the compare, 20 s of play
sends 1,202 HUD messages instead of 21. Deduping a high-rate source still belongs in the driver,
or in a subscription's `equals` and `select`. The race chart's 220 re-rendered rows (its `pick`
rebuilt an array) describe football's state before its own fix, fpt-ygm.14, which keeps the plot
in the model; 0.3.8 removed no workaround there.

- **A host renders only when what its view reads changed** (view/04 "Marking"): its state, a
  declared prop or a declared store's value, compared with `Object.is` against its last render
  that succeeded. The old objection (gyral-8af, 2026-10-11: every message renders, so a refused
  edit stays in its control) no longer holds: under the live form-state rule (view/02) such a
  render writes nothing, so skipping it changes nothing on screen. React bails out on equal
  state the same way. A view that reads anything else stops refreshing on unrelated messages:
  a behavior change, listed first in the release notes, for views that already broke "views are
  pure". Development re-runs skipped views (every one up to 50 per flush, then a window that
  moves each flush) and warns once per component when one differs (G0017).
- **`each(items, key, row, { pick, equals })`**: `equals` replaces the one-level comparison of
  picked values (view/03 "Row skipping"). Stable references first; `equals` is the escape hatch.
- **`subscription(…, { select, equals, coalesce })`**: `select` maps each value, `equals` drops
  one equal to the last delivered, `coalesce: 'microtask' | 'frame'` delivers the latest per
  microtask or frame, the first value included (so it never arrives in `emit`'s turn). The default stays "every value", as RxJS's `distinctUntilChanged` is
  opt-in: a source that emits one mutated object twice would otherwise go quiet.

Store selectors (a store change rendering only the components whose slice changed) stay review
item #21; a store whose value didn't change already renders nothing.

## Addendum: development checks in apps that install core (0.3.9)

Migrating apps to 0.3.8 (epic gyral-vge) showed that no app installing Gyral from npm had ever
run its development checks in the dev server or Vitest's browser mode, and, once they ran,
that G0017 fired on pure views.

- **The dev pre-bundle is core's development build** (gyral-3pv). Vite 8's dependency
  optimizer resolves a pre-bundled package's bare imports with Vite's resolver, under the
  environment's conditions, but leaves its subpath imports (core's `#view-dev`, `#devtools`)
  to rolldown's resolver, which knows no `development`. The pre-bundle of an installed core
  therefore got `dev-off.js` and `devtools-off.js`: no checks, coded messages. Node's own
  resolver (Node-environment tests) and the workspace's examples (core served as source,
  unbundled) did get `development`, so the gate never saw it. `gyral()`'s one-core plugin now
  sets `optimizeDeps.rolldownOptions.resolve.conditionNames` in serve mode to the
  environment's conditions (the app's `resolve.conditions` or Vite's defaults,
  `development|production` read as Vite reads it), in a `post` `configEnvironment` hook so
  conditions other plugins add (`gyral-client-only`) are in; an app's own `conditionNames`
  win, and `vite build` is untouched. `pack:check` installs the packed core in a throwaway app
  and checks that the dev pre-bundle carries the development checks and production builds
  don't (scripts/lib/dev-prebundle-fixture.mjs).
- **G0017 compares what a view renders, never identities** (gyral-nyy). Its recheck required
  each `each` row's item to be the committed object (`row.item === item`) and compared bound
  values with `Object.is`, so a pure view warned when it built values anew each render:
  `each(s.items.map(…))`, `keyed(key, html…)` (a one-row `each` whose item is a fresh
  template), `.data=${{ n: s.n }}`, `.items=${s.items.slice()}`, a hook's `[...errors]`. Now
  a row whose item or pick changed is rendered again and compared like any child value (as the
  row check already did for skipped rows), and attribute, property, value and hook values
  compare plain objects and arrays by value, deeply but bounded (1,000 entries, 16 levels;
  past the bound, equal). Other objects (a `Date`, a `Set`, a class instance) still compare
  with `Object.is`: the view builds them anew, and a child sees a new value. The real render
  is unchanged: it still writes a new object to the property. Reading `Date.now()`, a module
  variable or the DOM still warns (core/test/view-recheck.test.ts).
- **`ctx.props` is a stable reference** (gyral-bn7, ADR 0007's 0.3.9 addendum): the same object
  while no declared prop's value changes, so a pick that captures it lets rows skip.
- **G0017 says where** (gyral-bn7): "It differs in its template", or in the innermost `each`
  list that differs, named by its row function (`each(…, Day)`, `keyed(…)`); when that list's
  row has the same item and another pick, the pick is the cause, and the message says to pick
  the fields the row reads or pass `each(items, key, row, { pick, equals })`. The message also
  names the other way a pure view differs: a value built anew each render that compares by
  reference (a `Date`, a `Set`, a class instance).
- **Development messages name their code** (gyral-99d): only production printed
  `Gyral G0017 …`, so a development warning gave nothing to search for or link to. Every
  `message(code, …)` now ends with ` (G0017: https://gyral.dev/errors/#G0017)` in development,
  and `docsLink(code)` gives the same ending there (the hydration mismatch, G0062, which keeps
  its own sentence). Production text and size are unchanged; errors.md says both forms.

## Addendum: production build without development code (0.3.10, gyral-gpr, gyral-fve)

Core guards each development check with `if (DEV)` (its devtools hooks with
`if (DEVTOOLS_ENABLED)`), flags imported from `#view-dev` and `#devtools`, whose production
modules export a literal `false`. Rollup and Rolldown carry that constant across modules and
drop the checks with every module only they import. esbuild inlines it only when printing,
after tree shaking, so its bundles kept them all as dead code: gyral-rs's Askama client
(esbuild, minified, no `development` condition) was 16,546 B larger at 0.3.8 and 17,684 B at
0.3.9 than with `DEV` replaced by `false`, `undefined-tags.js` and rule 15's element list
(`view/normalize/component-name.js`) included. Webpack, Rspack and Parcel without constant
propagation across modules are in the same position.

- **Two trees in the package.** `dist/` is the full build, as before: development checks
  behind the flags, which the `development` condition switches on. `dist/prod/` is the
  production build: every module a production app can load, at the same path, with its
  development code removed at Gyral's build (`scripts/lib/prod-build.mjs`, run by
  `build-package.mjs` after `tsc`). Per module (`scripts/lib/strip-dev.mjs`): imports of the
  flags become `false`, re-exports `export const DEV = false`, and esbuild's transform folds
  the branches away (`minifySyntax`) and drops the imports and top-level code only they used
  (TypeScript's unused-import rule, `treeShaking`), repeated until nothing changes; a
  side-effect import that stripping leaves (`import "./undefined-tags.js"`) goes too, since
  core is `sideEffects: false`. Only modules a production entry still reaches are written:
  no `undefined-tags.js`, `view/messages.js` (the message table), `view/render/dev-check.js`,
  `view/loc.js` or `devtools.js`. Rule 15's list stays for `normalize()` and `checkTemplate()`,
  which always check names (tools call them); nothing else imports it, so bundles that don't
  call them drop it. Names stay unminified; no source maps (the full build has them). 136
  files, +43 KiB packed (664 → 707 KiB).
- **Selection.** Each runtime entry (`.`, `/internal`, `/internal/server`, `/compiled`,
  `/storage`, `/indexeddb`) is
  `{ types, browser: { development: dist/…, default: dist/prod/… }, default: dist/… }`;
  `/vite`, `/eslint` and the CLI are tools and have only `dist/`.
  - **Only `browser` selects it.** One process must load one copy of core. In Node, two
    resolvers can pick core's entries: Vitest runs its workers with `--conditions development`
    but resolves an externalized package's entry with Vite's `externalConditions` (`node`,
    `module-sync`), so an app's `@gyral/core` would get one tree and `@gyral/ssr`'s
    `@gyral/core/internal` the other (create-gyral's SSR template tests that way). With the
    production tree under `browser`, Node, Deno and Bun resolve exactly as in 0.3.9. A `node`
    branch would do too, but publint reads `node` as CommonJS and asks for `engines.node`,
    which Gyral's runtime packages don't declare; server bundles don't need the bytes.
  - **Its own subpath imports.** Production modules import only each other and
    `#prod/prepare`, `#prod/hydration-loader`, `#prod/invoker-fallback` and
    `#prod/spec-features`: the twins of core's conditional imports without `development`
    (`gyral-compiled` and `gyral-client-only` work as before). `#view-dev` and `#devtools` are
    inlined. Vite's dependency optimizer resolves exports with Vite's resolver and `#…` imports
    with rolldown's (gyral-3pv); if the trees shared `#prepare`, an app without `gyral()` would
    pre-bundle the full build with the production preparer, two copies of the view layer.
    With names of its own, no resolver can mix the trees.
- **Prior art.** Vue ships `.prod.js` builds and selects its CommonJS ones by
  `process.env.NODE_ENV`; React's production bundles are selected the same way; Preact keeps
  its checks out of the main entry (`preact/debug`, opted into). Gyral's packages are ESM and
  already select development code by condition (`#view-dev`), so the export condition picks the
  tree, as Solid's `development` builds do; nothing to replace at build time, nothing to opt
  into.
- **Who gets what.**

  | Consumer                                                  | Build                                        |
  | --------------------------------------------------------- | -------------------------------------------- |
  | Vite dev server, its pre-bundle, Vitest browser mode      | `dist/` with checks (`development`)          |
  | `vite build` (client), Vitest with production conditions  | `dist/prod/`                                 |
  | esbuild, webpack, Rspack, Parcel, Bun for browsers        | `dist/prod/`; `dist/` with `development`     |
  | Node, Vite SSR, Vitest node projects                      | `dist/`, checks only with `development`      |
  | Deno, an SSR bundle for embedded V8 (`platform: neutral`) | `dist/`, checks off (dead code, as in 0.3.9) |

- **Tooling follows the tree an app resolves.** The template compiler's feature
  registrations sit next to the compiled entry it resolves (`dist/prod/use-*.js`), its
  `VIEW` sources include `dist/prod/view/`, and `@gyral/ssr` finds the hydration chunk at
  `dist/prod/hydration-client.js` too.
- **Checks.** `pack:check` bundles the packed core with esbuild (`lib/prod-build-fixture.mjs`):
  without `development` (and with `gyral-client-only`) no module outside `dist/prod/` and none
  of the skipped-view recheck, rule 15's list, the undefined-tag watch, the message table or
  the devtools hook; with `development` all of them. In plain Node, both trees export the same
  names from every runtime entry and server-render a component identically. The browser-prod
  Vitest project strips core's sources with the same pass, so its hydration and
  `*.prod.test.ts` tests run what production apps run (`production-build.prod.test.ts` checks
  that it does). Unit tests: `scripts/test/strip-dev.test.mjs`.
- **Size.** esbuild, minified, no `development`: gyral-rs's Askama client source 86,958 →
  69,151 B (−17,807; `gyral-client-only`), its axum-app client 101,044 → 81,465 B (−19,579),
  the fixture app 98,386 → 79,027 B (−19,359); with `development` unchanged (Askama 100,087 B).
  gyral-rs's embedded SSR bundle (`platform: 'neutral'`) is unchanged (117,710 B). The
  examples' budgets build core from source with Rolldown and are unchanged, byte for byte.
- **Cross-chunk development exports (gyral-fve).** Production modules no longer call
  development functions, so no bundler splitting an app built on the published core can keep
  one as a chunk export. Builds from source (the examples, `pnpm size`) still rely on
  Rolldown: each example built with and without stripping core's sources first differs by
  −13 to +18 B in single-chunk examples (minifier noise) and by 210 B (isomorphic), 69 B
  (register) and 65 B (no-js-first) in split ones. In isomorphic that is eleven more exports
  of its render chunk: the devtools no-ops, `absent`, `VERSION` and the self-guarded
  `recheckView` and `checkKeys` stubs; in register and no-js-first, three of the main chunk
  for the hydration chunk: `absent`, `checkKeys` and `devMismatch`. The self-guards
  (`if (!DEV) return` in `recheckView`, `checkKeys`, `checkSpecFeatures`) keep the bodies out
  and stay: source builds need them. Unguarded development functions called across modules
  (`warnLowercased`, `checkAttr`, the `warn.ts` helpers) share a chunk with their callers in
  all three split examples.
- **Not covered.** A platform-neutral bundle (gyral-rs's embedded SSR bundle) still carries
  the dead development code, as before. `@gyral/http` reads `devtoolsEnabled` from
  `@gyral/core/internal` for its CSRF check; esbuild keeps that check in its bundles.
