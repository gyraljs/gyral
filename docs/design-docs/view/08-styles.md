# 08 — Styles

Status: **accepted** (2026-10-06). ADR 0018 (decision G). Phases 3–5.

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

- `css` returns a **style source**: the CSS text plus a cache slot. String and number
  interpolations are inserted as written, so `unsafeCSS` is gone; another style source
  interpolates its text. CSS is trusted author code: never interpolate user input.
- `spec.styles` accepts a style source, a plain string (for example
  `import base from './base.css?inline'`) or an array of them, nested freely.
- Raw `CSSStyleSheet` objects are no longer accepted: the server can't read their text. Share
  styles by sharing the `css` value; it maps to one sheet (below).
- The Vite compiler may minify `css` text at build time.

## Browser

- **One `CSSStyleSheet` per style source**, created on first use with `replaceSync` and cached on
  the source. Components that share a source share the sheet.
- Each shadow root gets `adoptedStyleSheets = [...sheets]` once, when its root is created or
  hydrated. Instances cost nothing more.
- There is no `<style>` fallback: constructable stylesheets are widely available (ADR 0003).
- `shadow: false` components ignore `styles` and warn, as today (ADR 0014): they use document
  CSS (cascade layers and tokens, as the shop already does).

## Server

Declarative shadow roots can't reference a shared sheet yet. A declarative form of
`adoptedStyleSheets` is proposed but not shipping. So:

- Each shadow component's `<template shadowrootmode>` starts with
  `<style>…its CSS text…</style>` (06). No unstyled flash, no build coupling. Gzip compresses
  repeated identical blocks well. The shop has 3 shadow components and gyral.dev 2, so the cost
  is small.
- `styleHashes()` (06) returns a SHA-256 hash for each registered component's CSS. The
  `@gyral/ssr` page helper puts them in `Content-Security-Policy: style-src …`, so a strict CSP
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
| Light-DOM scoping (later) | `@scope`                                                   | newly (2026-03-24)        |
