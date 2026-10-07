# ADR 0014 — Light-DOM render mode for page-level components

Status: **accepted** (2026-10-04). Requested by gyral-shop (P1, SEO).

> **Superseded in part by [ADR 0018](0018-view-layer.md)** (2026-10-06, shipped in 0.3.0): light DOM is a native output mode of the new server renderer; the stream filter and hidden markers go away. Lit-specific text below describes 0.2.x.

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
- **Hydration markers inside light content are hidden, then revealed per host.** The filter
  rewrites Lit's markers in light regions to `<!--gyral:lit-part …-->`,
  `<!--gyral:/lit-part-->` and `<!--gyral:lit-node n-->`, and every light host is marked with
  `data-gyral-light`. On its first client update, a light host reveals only the markers it owns
  (those whose nearest light host is itself) and Lit's hydrate support hydrates it **in place**.
  See the addendum below for the evidence and the mechanism. Shadow components nested inside keep
  their DSD and markers.
- **DOM identity is kept.** Server nodes survive hydration, including nested components, so a
  nested component keeps its own seed. Seeded state, init's deferred commands, `Hydrated`,
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
- Requires `@gyral/ssr/hydrate` (Lit's hydrate support) in the client entry, as for shadow
  components. Without it, a server-rendered light component falls back to a fresh render of its
  seeded state.
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

## Addendum: root cause and in-place hydration (gyral-czi.30, 2026-10-04)

The first version re-rendered light components on the client. That lost DOM identity, and with
it the seeds of nested components. The cause, confirmed in Lit's source (versions pinned in this
repo: `@lit-labs/ssr` 4.1.0, `@lit-labs/ssr-client` 1.1.8):

1. **The server only emits a component's view inside DSD.** In `@lit-labs/ssr/lib/render-value.js`,
   lines 643–669 (`custom-element-shadow`), `renderShadow()` output is always wrapped in
   `<template shadowroot>`. `LitElementRenderer.renderLight()` (`lit-element-renderer.js`
   lines 123–132) only serves the `renderLight()` directive, which renders content **owned by the
   parent's template** (`@lit-labs/ssr-client/directives/render-light.js`). A component that owns
   its own light view has no upstream path, so Gyral unwraps the DSD in a stream filter.
2. **`hydrate()` claims every Lit marker under its container.** In
   `@lit-labs/ssr-client/development/lib/hydrate-lit-html.js`, line 75, the walk is
   `createTreeWalker(container, NodeFilter.SHOW_COMMENT)`. It doesn't enter shadow roots, but it
   does enter light children. Lines 80–107 treat every `lit-part` / `lit-node` / `/lit-part`
   comment as a part of the current template, and line 81 throws on a second root part.
   - A nested light host's markers sit inside an ancestor's container, so they would be read as
     the ancestor's own parts.
   - The first version stripped them, leaving the light host nothing to hydrate from. That is
     why `update()` used `replaceChildren()`.
3. **Nested hosts connect during the parent's walk.** `hydrate-lit-html.js` line 273 removes
   `defer-hydration` synchronously while walking. A nested light child therefore connects
   **in the middle of** its parent's walk.

**Fix.** Only comments starting with those three prefixes are acted on (lines 80, 96, 101), so
the filter **hides** markers in light regions behind a `gyral:` prefix instead of stripping them.
The server marks every light host with `data-gyral-light`.

On a server-rendered light host's **first update**:

- `revealLightMarkers()` restores exactly the markers whose nearest `data-gyral-light`
  ancestor is this host. This runs on the first update, not on connect, because of point 3: the
  child's update runs after the parent's walk has finished.
- `define()` then sets Lit's `_$needsHydration` flag, the same one
  `lit-element-hydrate-support.js` sets for shadow roots (line 42). Lit's patched `update()`
  (lines 51–71) calls `hydrate(value, this)` on the host's own children.
- Nested light hosts reveal their own markers later, in their own first update, after the parent
  has removed their `defer-hydration`.

**Tests.**

- `ssr/test/light-hydration.test.ts`: server nodes are the same objects after hydration (page
  heading, buttons, a nested light child and its button, a nested shadow child, and a light child
  inside a shadow parent).
- The same file: nested light children keep seeded state that `init()` couldn't produce (5 and
  7), and no hydration warnings are logged.
- `core/test/light-markers.test.ts`: markers are revealed level by level, three light hosts deep.
- `ssr/test/light.node.test.ts`: the hidden markers and the `data-gyral-light` marks on the
  server.

**Remaining limitations.**

- **Lit private flag.** `_$needsHydration` is a private, unmangled flag of Lit's labs hydrate
  support (the `_$` prefix is Lit's convention for cross-package internals). An upstream change
  would surface as a failing light-hydration test. The fallback (a fresh render) still works.
- **Hydrate support required.** Without it, server-rendered light content is re-rendered rather
  than hydrated.
- **Leftover markup.** The hidden markers of a light host stay in the DOM as plain comments until
  it hydrates. `data-gyral-light` stays on the host; it is harmless.
- **No upstream path yet.** Lit has no supported way for a LitElement to server-render its own
  light DOM. If one lands, the filter can be replaced by it.

## Addendum: production builds rendered light content twice (gyral-czi.38, 2026-10-05)

**Symptom.** In production builds (`vite build`), a server-rendered light-DOM component showed
its content twice: the inert server copy plus a fresh client render appended after it (found
by gyral-shop's consent banner). Development builds and every test were clean, because the
tests ran Lit's development build through the `development` export condition.

**Root cause (confirmed).** The czi.30 fix set Lit's private `_$needsHydration` flag so that
`@lit-labs/ssr-client`'s hydrate support would call `hydrate()` instead of `render()`. Lit
mangles private names in its production build:

- Development: `@lit-labs/ssr-client/development/lit-element-hydrate-support.js:42` sets and
  `:56` reads `this._$needsHydration`.
- Production: `@lit-labs/ssr-client/lit-element-hydrate-support.js:1` (minified) reads
  `this._$AG` instead.

So in production the flag Gyral set was never read. The patched `update()` took its `render()`
branch, and `render()` into a container with no root part appends a second copy after the
server's children. (Setting `_$AG` by hand is not a fix either: it is an unstable build
artefact and could change with any Lit release.)

**Fix.** Gyral no longer touches Lit internals for light hosts. `@gyral/ssr/hydrate` registers
Lit's **public** `hydrate()` (from `@lit-labs/ssr-client`) under `Symbol.for('gyral.hydrate')`
(core's `HYDRATE_KEY`). On a server-rendered light host's first update, `define()` reveals the
host's own markers and calls that `hydrate(this.render(), this, this.renderOptions)` before
`super.update()`. `hydrate()` stores the root part under `_$litPart$`, a deliberate,
unmangled cross-package key, so the `render()` inside Lit's update finds the part and updates
it in place, in development and production alike. Without `@gyral/ssr/hydrate` the host falls
back to a fresh render, as before.

**Guard.** A `browser-prod` Vitest project runs every `*-hydration.test.ts` and
`*.prod.test.ts` against Lit's production build (no `development` condition), as part of
`pnpm check`. `lit-build.prod.test.ts` proves that project really loads production Lit.
Before the fix, six light-DOM hydration tests failed there; they all pass now.

**Remaining private API.** None for light DOM. The czi.31 monitor (upstream light-DOM SSR)
still applies to the marker-hiding SSR filter.

## Addendum: native light-DOM output (gyral-g1r.9, 2026-10-06)

The Gyral server renderer writes a light component's view as its children directly (no DSD to
unwrap, no hidden markers), still marking the host `data-gyral-light`. Children written inside
a light component's tag by its parent are now a server error (whitespace-only children are
dropped), since the component owns its children. See view/06-server.md "Components".

## Addendum: hydrating light hosts in core (gyral-g1r.10, 2026-10-06)

A light host hydrates its own children in place with core's walk (view/07-hydration.md): no
markers to reveal, no hydrate import, no dependence on evaluation order. `data-gyral-light`
stays on the host after hydration; a parent's walk uses it to skip the host's content whole,
so a light child may hydrate before or after its parent. A parent template that gives a light
host children (other than whitespace) is a hydration mismatch, as it is a server error.
