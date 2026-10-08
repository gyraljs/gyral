# 08 — Styles

Status: **accepted** (2026-10-06), shipped in 0.3.0. ADR 0018 (decision G). Phases 3–5.

## Authoring

```ts
import { css, define } from '@gyral/core';

const TRANSITION_MS = 600;

define('gy-letters', {
  styles: css`
    @layer component {
      li {
        transition: font-size ${TRANSITION_MS}ms ease-out;
      }
    }
  `,
  // …
});
```

- `css` returns a **style source**: the CSS text, keyed to one cached sheet. String and number
  interpolations are inserted as written (0.2's `unsafeCSS` wrapper is gone); another style
  source interpolates its text. CSS is trusted author code: never interpolate user input.
- `spec.styles` accepts a style source, a plain string (for example
  `import base from './base.css?inline'`) or an array of them, nested freely.
- Raw `CSSStyleSheet` objects are no longer accepted: the server can't read their text. Share
  styles by sharing the `css` value; it maps to one sheet (below).
- The Vite compiler leaves `css` text as written; minifying it at build time is possible later.

## Browser

- **One `CSSStyleSheet` per style source** (and per distinct plain string), created on first
  use with `replaceSync` and cached (`view/styles.ts`). Components that share a source share
  the sheet.
- Each shadow root gets `adoptedStyleSheets` set to the class's sheets once, when its root is
  created or hydrated. Instances cost nothing more.
- There is no `<style>` fallback: constructable stylesheets are widely available (ADR 0003).
- `shadow: false` components ignore `styles`, with a development warning (ADR 0014): they use
  document CSS (cascade layers and tokens, as the shop does).

## Server

Declarative shadow roots can't reference a shared sheet yet. A declarative form of
`adoptedStyleSheets` is proposed but not shipping. So:

- Each shadow component's `<template shadowrootmode>` starts with
  `<style>…its CSS text…</style>` (06). No unstyled flash, no build coupling. Gzip compresses
  repeated identical blocks well. The shop has 3 shadow components and gyral.dev 2, so the cost
  is small.
- `styleHashes()` (06) returns a SHA-256 hash for each registered component's CSS. The
  `@gyral/ssr` page helper puts them in `Content-Security-Policy: style-src …` (built when the
  page renders, `renderPage({ csp: { directives } })`, 06 "CSP"), so a strict CSP
  needs no `'unsafe-inline'`. ADR 0012's note that DSD styles require `'unsafe-inline'` is
  superseded. **Verified in Phase 4** (Chromium 153, Firefox 155, WebKit 26.6, real
  `Content-Security-Policy` header): hashes apply to `<style>` inside declarative shadow roots,
  an unhashed one is blocked, and `style-src` does not block constructed sheets. A component's
  CSS texts are written as one `<style>`, joined with newlines (06 "Components").
- Revisit `<link rel="stylesheet">` inside shadow roots only if a real page shows inline styles
  hurting. It's cached across pages but doesn't block rendering inside a shadow root, so it
  flashes unstyled content unless the same link is also in `<head>`.

## Hydration

In the same step that hydrates a shadow root (07): set `adoptedStyleSheets` to the shared sheets
and remove the server's `<style>` element. No paint happens between the two, so nothing
flashes. Afterwards a server-rendered component is identical to a client-rendered one: one
shared sheet and no duplicated style nodes.

**Phase 5:** core's `hydrateRoot` does both right before the walk, in the host's first render
(the `<style>` is the root's first child when the component has CSS). Until then (and for a
pending island) the server's `<style>` styles the root on its own; the sheet is not adopted at
connect, so styles never apply twice. A production mismatch clears the root and renders fresh
with the sheet already adopted.

## Style attributes under a strict CSP

(0.3.1, gyral-dyn.5.) A policy whose `style-src` (or `style-src-attr`) allows neither
`'unsafe-inline'` nor the attribute's hash with `'unsafe-hashes'` blocks every `style`
attribute the HTML parser creates (page markup, declarative shadow roots, `innerHTML`, and in
Firefox a `<template>`'s HTML) and `setAttribute('style', …)`. It does not restrict CSSOM writes
from script (`el.style.cssText`, `setProperty`, MDN "CSP: style-src"). Verified with a real
`style-src 'self'` header in Chromium, Firefox and WebKit. Gyral writes styles through the
CSSOM wherever it can:

| Where                                                                   | Under `style-src 'self'`                           |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| Client render and updates: `style=${…}`, `style="a: ${x}"`, `style="…"` | apply: CSSOM writes (02 "Style attributes")        |
| `.style=${'…'}` (property binding)                                      | applies; the server drops it (02 "Properties")     |
| Server-rendered `style="…"`, before hydration                           | **blocked**: the server writes the attribute (06)  |
| The same element after hydration                                        | applies: the walk writes the adopted value (below) |
| Server markup that never hydrates (static pages), or not yet (islands)  | stays blocked until it hydrates                    |

**Hydration** (07): after adopting a `style` part, the walk checks the element's inline
declarations. None while the adopted value isn't empty means the CSP blocked the attribute
(Chromium and WebKit keep its text, Firefox empties it), so the walk writes the value through
the CSSOM; the element then looks as a client render would. An attribute that did apply has
declarations and is left alone, so pages without a strict CSP see no write. In development the
hydration check doesn't compare a `style` attribute that has no declarations: Firefox's empty
attribute would be a false mismatch.

**The first paint** still lacks the server's style attributes under such a policy. Options,
best first:

1. Keep declarations in stylesheets (the component's `styles`, allowed by hash, 06 "CSP") and
   select them with classes or data attributes: `class="tile v-${n}"`, `data-state=${s.kind}`.
   This covers values from a known set and needs no inline style at all.
2. For continuous values (a width, a hue, a position), accept that they apply at hydration:
   bind a custom property (`style="--w: ${s.width}%"`, with `inline-size: var(--w, auto)` in
   the stylesheet) and give the stylesheet a sensible fallback for the first paint.
3. A value only the client knows can be a `.style=${…}` property binding: client-only on every
   page, CSP or not, since the server drops property bindings on plain elements.
4. Allow known attribute values by hash: `style-src-attr 'unsafe-hashes' 'sha256-…'`, one hash
   per distinct value as the server writes it. Practical for a handful of fixed values; Gyral
   doesn't compute these hashes yet.
5. `style-src-attr 'unsafe-inline'` allows every `style` attribute, injected ones too, while
   `style-src` keeps `<style>` elements to their hashes.

**0.4** (gyral-dyn.10): opt-in hashing of server-rendered `style` attributes: the server
renderer would collect each value it writes and `renderPage({ csp })` would add
`'unsafe-hashes'` and their hashes to `style-src-attr`.

**Tests:** `core/test/view/style-csp.test.ts` loads Gyral into an iframe whose policy is
`style-src 'self'` and checks client renders, updates and hydration there, with
`setAttribute('style', …)` blocked as the control (Chromium in `pnpm check`; Firefox and WebKit
with `pnpm vitest run --config packages/core/test/view/browsers.config.ts`).

## Future

- CSS `@scope` (newly available 2026-03-24, widely about 2028-09) would let light-DOM components
  bring their own styles, emitted once per page. Earlier only as an enhancement under ADR 0003's
  tiers.
- Declarative shared stylesheets for DSD, when they ship, replace the inline `<style>`.

## Native primitives

| Need                      | Primitive                                                  | Baseline                  |
| ------------------------- | ---------------------------------------------------------- | ------------------------- |
| Shared sheets             | `new CSSStyleSheet()`, `replaceSync`, `adoptedStyleSheets` | widely (since 2025-09-27) |
| Server styles             | `<style>` inside `<template shadowrootmode>`               | widely                    |
| Strict CSP                | `style-src 'sha256-…'`                                     | widely                    |
| CSP-safe style attributes | `el.style.cssText` (CSSOM)                                 | widely                    |
| Light-DOM scoping (later) | `@scope`                                                   | newly (2026-03-24)        |
