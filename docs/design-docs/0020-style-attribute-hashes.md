# ADR 0020 — Hashing server-rendered `style` attributes for CSP (opt-in)

Status: **proposed** (2026-10-08), for **0.3.1**. Bead: gyral-dyn.10. Builds on
view/06-server.md "CSP", view/08-styles.md "Style attributes under a strict CSP" (0.3.1,
gyral-dyn.5) and ADR 0003.

**Scope note (owner, 2026-10-08):** the 0.4 items ship in 0.3.1, and breaking a 0.3.0 API is
acceptable this once (0.3.0 is not yet approved on npm). This ADR recommends the cleanest
design and lists what breaks.

## Context

Gyral's CSP support covers `<style>` elements: `renderPage({ csp })` builds the
`Content-Security-Policy` header when the page renders, adding a SHA-256 hash for every
registered shadow component's `<style>` and every `page({ styles })` entry to `style-src`
(`packages/ssr/src/csp.ts`, using core's synchronous `styleHashSync`). No `'unsafe-inline'`
is needed.

`style` **attributes** are not covered. Verified in Chromium, Firefox and WebKit with a real
header:

- A policy whose `style-src` (or `style-src-attr`) allows neither `'unsafe-inline'` nor the
  attribute's hash with `'unsafe-hashes'` blocks every `style` attribute the HTML parser
  creates: in server HTML, in declarative shadow roots, and (Firefox) in a `<template>`'s
  cloned content.
- `'unsafe-hashes'` plus the attribute's `'sha256-…'` hash allows it, in all three engines.
- CSSOM writes (`el.style.cssText`, `setProperty`) are never blocked.

Since 0.3.1 the client writes every style through the CSSOM, static ones included, and
hydration re-applies a server `style` attribute the policy blocked. So the page ends up
correct, but **the first paint lacks every server-rendered style attribute**, and pages that
never hydrate (static pages, islands not yet released) keep lacking them. view/08 lists the
workarounds, best first: classes or data attributes for values from a known set, custom
properties with stylesheet fallbacks for continuous values, `.style=${…}` for client-only
values, then hashes by hand, then `style-src-attr 'unsafe-inline'`.

This ADR proposes that Gyral compute those hashes itself, as an opt-in, for the apps that
need exact first paint under a strict policy.

## The constraint: headers go first

A response's headers are final before its first body byte. `renderPage` pulls the page in
chunks (view/06 "How the walk is chunked"), so the header is built before any component
renders. Component `<style>` hashes are known up front (they depend only on the registry);
the style attributes a page writes are known only after the whole page has rendered.

Ways around it that don't work:

- **`<meta http-equiv="Content-Security-Policy">` at the end of the page:** a meta policy
  only adds restrictions (policies intersect), and applies only to content after it.
- **HTTP trailers:** browsers ignore CSP in trailers.

## Options

| Option                                                                                | First paint                     | Covers bound values | Chunked output kept  | Header per page     |
| ------------------------------------------------------------------------------------- | ------------------------------- | ------------------- | -------------------- | ------------------- |
| **A. Per-page collection:** render to a string, collect values, then build the header | exact                           | yes                 | no (buffered)        | varies with content |
| B. Static-only: hash every static `style="…"` in registered templates, like `<style>` | exact for static values only    | no                  | yes                  | same for every page |
| C. Rewrite attributes into a hashed per-page `<style>` with generated selectors       | exact, once the rule is parsed  | yes                 | no (needs buffering) | one hash            |
| D. `style-src-attr 'unsafe-inline'` (documented today)                                | exact                           | yes                 | yes                  | none                |
| E. Do nothing more (custom properties, classes; today's docs)                         | fallback values until hydration | —                   | yes                  | none                |

- **A** is exact, and since server rendering is synchronous (nothing is awaited), buffering
  costs memory and the pull-based backpressure, not waiting time: a 1,000-row table renders to
  a string in 0.2 ms (view/06).
- **B** keeps chunked output and a cacheable header, but static style attributes are the case
  that matters least: an author who writes a fixed `style="…"` can move it to the stylesheet.
  The values people actually need hashed are bound (`style="--progress: ${pct}%"`).
- **C** changes specificity (an inline style beats any selector; the generated rule would
  need `!important`, which then behaves differently from inline `!important`) and makes the
  server DOM differ from the client's, which hydration would have to know about. Rejected.
- **D** is one line and keeps every value working, but allows any injected `style` attribute.
  CSS can't run script in current engines, but it can restyle the page for UI redressing and
  leak data through `url()` requests that `img-src`/`font-src` don't stop.

## Decision (recommended): option A, opt-in

```ts
return renderPage({
  title,
  body,
  csp: { directives: { 'default-src': "'self'" }, styleAttributes: 'hash' },
});
```

1. **Collect while writing.** Core's server writer gains an optional collector
   (`render(value, { dev, styleAttributes: Set<string> })`). It records the value of every
   `style` attribute it writes, **as the DOM will see it**: the unescaped string, since the
   browser decodes `&amp;` and `&quot;` before hashing.
   - Bound and multi-part values (`style=${…}`, `style="--w: ${w}%; color: ${c}"`): the
     joined string.
   - Static values: the normalizer already decodes each static `style` to hand it to the
     client as a part (0.3.1, `normalize/tree.ts`); the server's `open` segment can carry
     the same decoded value, computed once per template, so collecting costs a lookup.
   - Element hooks whose server half writes `style`: collected too.
   - Empty values are skipped (an empty attribute declares nothing).
   - `raw()` markup is not parsed, so its style attributes are not covered (documented).
2. **Render first, then respond.** With `styleAttributes: 'hash'`, `renderPage` renders the
   page to a string inside the request's store scope (as `renderToString` does), builds the
   header, and returns a `Response` with the string as body. Without the option nothing
   changes: the header is cached per options object and the body is chunked.
3. **The header.** Distinct values are hashed with `styleHashSync` (cached per text, as for
   `<style>`), and Gyral adds `style-src-attr 'unsafe-hashes' 'sha256-…' …`. Rules:
   - If the app gave `style-src-attr`, its sources are kept and the hashes appended.
   - If that directive contains `'unsafe-inline'`, no hashes are added: under CSP 2 and
     later, a hash in a directive makes the browser ignore its `'unsafe-inline'`, so adding
     hashes would block every other inline style the app allowed.
   - A page that wrote no style attributes gets no `style-src-attr`; attributes fall back to
     `style-src`, which blocks them, as today.
   - `style-src` keeps only the `<style>` hashes, so an attribute hash never allows a
     `<style>` element with the same text.
4. **A size guard.** Each distinct value adds about 54 bytes to the header
   (`'sha256-` + 44 base64 characters + `' `). Proxies cap response headers (nginx's default
   `proxy_buffer_size` is 4 or 8 KiB and fails the response with a 502 above it). In
   development, more than 32 distinct values on one page warns once, naming the template
   that writes the most, and suggesting a custom property or a class. A `maxStyleHashes`
   (default 128, about 7 KiB) drops the hashes past the limit in production and logs once;
   those attributes then apply at hydration, as without the option.

### What it doesn't change

- **Client renders.** They keep writing through the CSSOM (no hashes involved). The
  Firefox `<template>` case stays handled by turning static styles into parts (view/08).
- **Hydration.** When the hash allowed an attribute, the element has declarations, so 0.3.1's
  re-write through the CSSOM doesn't run. When it didn't (over the cap, `raw()`), the
  re-write still repairs it.
- **The recommendation.** Classes and data attributes for known sets, custom properties with
  stylesheet fallbacks for continuous values. Hashing is for apps that need the exact first
  paint of a handful of values under a strict policy, or that serve pages that never
  hydrate.

### Trade-offs against classes and custom properties

| Approach                                      | First paint under strict CSP | Header cost                        | Notes                                                                         |
| --------------------------------------------- | ---------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Class or `data-*` + stylesheet rule           | exact                        | none (stylesheet hashed or linked) | Best for values from a known set (states, sizes, themes)                      |
| Custom property + fallback in the stylesheet  | fallback until hydration     | none                               | Best for continuous values; each distinct value would be its own hash         |
| `style` attribute + `styleAttributes: 'hash'` | exact                        | ~54 B per distinct value           | Buffered response; per-page header; suits few, fixed or slowly varying values |
| `style-src-attr 'unsafe-inline'`              | exact                        | none                               | Allows injected style attributes                                              |

A custom property is the worst case for hashing: `style="--pct: 37%"` and `--pct: 38%` are two
hashes. A list of 200 progress bars could add 10 KiB of header, which is why the guard exists
and why the docs keep recommending classes for sets and accepting hydration for continuous
values.

## Size

- **Client bundles: 0 bytes.** Everything is in `@gyral/core/server` and `@gyral/ssr`.
- **Server code:** about 30 lines in the writer (a branch on attribute writes when a
  collector is present) and about 40 in `@gyral/ssr` (render-then-respond, directive merge,
  guard).
- **Responses:** +54 B of header per distinct value; bodies unchanged.
- **Memory:** a buffered page holds its whole HTML string until it is sent (pages are
  typically tens to hundreds of KB).

## Baseline and compatibility

- `'unsafe-hashes'`: verified in Chromium, Firefox and WebKit (the facts above).
- `style-src-attr`: in all engines since Firefox 108 (December 2022; Chromium 75,
  Safari 15.4), so widely available by our 30-month rule (confirm the date in `web-features`
  when implementing). A browser without it falls back to `style-src`, which then blocks the
  attributes: the page degrades to today's behaviour (applied at hydration), so no fallback
  code is needed (ADR 0003 tier 1).
- Server only: runs on any runtime (`styleHashSync` is plain JavaScript).
- **Opt-in.** Pages without `styleAttributes` render, stream and cache their header exactly
  as before. Hashing stays opt-in even though 0.3.1 may break APIs: on by default it would
  buffer every CSP user's pages and grow their headers, for a benefit most pages don't need.

## Breaking changes (0.3.0 → 0.3.1)

None. `CspOptions` gains `styleAttributes` and `maxStyleHashes`; core's server `render` and
`renderToString` gain an optional collector.

## Implementation plan (0.3.1)

| Step | Files                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `packages/core/src/view/normalize/emit.ts`, `normalize/types.ts`: the server `open` segment carries its decoded static `style`                                                                     |
| 2    | `packages/core/src/view/server/writer.ts` (collect on `style` writes: static, attr, multi, hook), `view/server/index.ts` and `src/server.ts` (the `styleAttributes` render option)                 |
| 3    | `packages/ssr/src/csp.ts` (`styleAttributes`, `maxStyleHashes`, the `style-src-attr` merge and the `'unsafe-inline'` rule, the guard), `index.ts` (`renderPage` renders to a string first when on) |
| 4    | Docs: view/06 "CSP", view/08 (the 0.4 paragraph becomes the shipped behaviour), skill `ssr.md`, ssr README, changeset                                                                              |

Size: 0 B in client bundles (server code only); about 70 lines of server code. Tests below.

## Testing plan

- **Node (core):** the collector records static, bound, multi-part and hook-written values;
  decoded, not escaped (`"`, `&`, `<` in a value); empty values skipped; light and shadow
  components; nested templates; `each` rows.
- **Node (ssr):** header shape; merging with a given `style-src-attr`; no hashes when it has
  `'unsafe-inline'`; no directive when nothing was collected; the 32-value warning and the
  `maxStyleHashes` cut; responses without the option are still chunked (first chunk before
  the render finishes) and with it carry the whole body.
- **Browser, real header** (the iframe harness of `core/test/view/style-csp.test.ts`):
  server HTML with static, bound and custom-property style attributes in light DOM and in a
  declarative shadow root is styled **before** hydration (computed style checked with
  hydration held back); after hydration no CSSOM re-write happened (spy); an attribute past
  the cap is blocked and then repaired by hydration. Chromium in `pnpm check`; Firefox and
  WebKit with `packages/core/test/view/browsers.config.ts`.
- **Conformance:** README property 1 (server equals client) with the collector on: the
  collector must not change the markup.

## Open questions for the owner

1. **Modes.** (a) Per-page collection only (recommended); (b) also a static-only mode that
   keeps chunked output and a cacheable header.
2. **Option shape.** (a) `csp: { styleAttributes: 'hash' }` (recommended: room for other
   values later); (b) `csp: { hashStyleAttributes: true }`.
3. **Guard.** (a) Warn above 32 values, cut above 128 (recommended); (b) fail in development
   above 32.
4. **Prerendered pages.** (a) `ssr` only in 0.3.1, documented (recommended); (b) `prerender`
   writes each page's header beside its file for `productionServer` to send.
5. **`raw()` markup.** (a) Document the gap (recommended); (b) scan `raw()` strings in
   development and warn.
