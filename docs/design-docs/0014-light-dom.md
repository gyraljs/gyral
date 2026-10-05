# ADR 0014 — Light-DOM render mode for page-level components

Status: **accepted** (2026-10-04). Requested by gyral-shop (P1, SEO).

## Context

Every Gyral component rendered into a shadow root, and on the server into Declarative Shadow
DOM (`<template shadowrootmode>`). For small widgets that is right. For **page-level**
components (gyral-shop's category listing with its `<h1>`, product grid and prices) it has
two costs:

- **Crawlers.** Google flattens DSD, but raw-HTML crawlers and tools may treat
  `<template shadowrootmode>` content as inert, so the page's main content may be invisible to
  them.
- **Styling.** Document CSS doesn't reach into shadow roots, so the shop duplicated its global
  styles into components with `unsafeCSS`.

## Decision

`define(tag, { shadow: false, … })` renders the view as the element's own **light-DOM
children**.

- **Client:** `createRenderRoot()` returns the element itself. Document CSS applies. `styles`
  are ignored (with a warning), and there are no `<slot>`s: the component owns all its
  children.
- **Server:** `@gyral/ssr` writes the view as plain children of the element, with no DSD
  template. A light-DOM renderer brackets the view, and a streaming filter
  (`packages/ssr/src/internal/light.ts`) unwraps it.
- **No hydration markers inside light content.** Lit's client hydration walks every
  `lit-part` comment in its container. A light child's markers sitting in a parent's tree would
  corrupt the parent's hydration, so the filter strips them inside light regions. Shadow
  components nested inside keep their DSD and markers.
- **"Hydration" is a re-render.** A server-rendered light component replaces its server
  children with one client render of its **seeded state** (the same markup) on its first update.
  The DOM is not reused, so a nested component inside it is recreated from its props (its own
  seed goes with the old DOM). Seeded state, init's deferred commands, `Hydrated`,
  `defer-hydration` handling and custom states work as for shadow components.
- **Intent isolation without a shadow boundary.** An intent element belongs to the nearest
  Gyral host above it. `define()` registers every class it creates, and intent lookup stops at
  any other Gyral host, whether light or shadow. A nested component's host element itself (with
  the parent's `data-intent`) still belongs to the parent.

## Constraints (document them where used)

- Use it for page-level components rendered once per page. Keep widgets (buttons, popovers,
  form controls) in shadow DOM.
- No `<slot>`s and no `styles`. Style with document CSS (cascade layers, `@scope` with the tag
  name as the scope root).
- Light content is re-rendered at hydration: avoid relying on DOM identity across the
  server→client handover (focus inside it before JS loads is lost).
- `view-transition-name` and custom states (`:state()`) work as usual.

## Tests

- `packages/core/test/light-dom.test.ts`: renders into light DOM, document CSS applies, nested
  light child in light and shadow parents keeps its own intents, styles ignored.
- `packages/ssr/test/light.node.test.ts` and `light-filter.node.test.ts`: no DSD for light
  components, no hydration comments inside them, nested shadow DSD kept, and every chunking
  of the stream gives the same output.
- `packages/ssr/test/light-hydration.test.ts`: server markup plus document CSS, takeover from
  the seed, intents and outputs of nested light and shadow children, and a light child inside a
  shadow parent (`defer-hydration`).
