# Capability audit (2026-10-05)

A read-only audit of what developers would expect from Gyral, checked against the code, the
ADRs and the gyral.dev docs (`gyral.dev/content/docs`). Every gap below is tracked under epic
**gyral-1zd**. This file is a snapshot; the beads are the live record.

> **Superseded in part by [ADR 0018](../design-docs/0018-view-layer.md)** (0.3.0): Gyral now
> renders with its own view layer. The Lit-related items below ("Coming from Lit", the
> `@lit/localize`, `@lit/context` and `@lit/task` spikes, the lit-html list leak,
> `ElementDirective`) describe 0.2.x and no longer apply, and `defineStoresProvider` is no
> longer exported; gyral-1zd.12 is re-scoped to an i18n design of Gyral's own.

## Already covered well

Declarative Shadow DOM and server rendering (`renderPage`, streaming), lazy hydration
(`hydrate: idle | visible | interaction`), light DOM, `::part` and custom-property theming,
`:state()`, View Transitions, invoker commands (`show-modal`), schema forms that work without
JavaScript, CSRF, stores, devtools, virtual time, fake drivers and SSR test helpers.

## Docs gaps (works today, undocumented or hard to find)

| Gap                                                                                                                                                                                         | Evidence                                                                       | Bead                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| Deploying (Node/Hono, Workers, static hosts) and render modes; prerendering is buried in `server-rendering.md#static-generation`                                                            | `server-rendering.md:75` is one line                                           | gyral-1zd.1                |
| Code-splitting and lazy component imports                                                                                                                                                   | works in `examples/isomorphic`; only written up in ADR 0012 lines 236-280      | gyral-1zd.2                |
| Using Gyral in React, Vue or plain HTML (attributes vs properties, `gyral-output` is `composed: false`, tag-map typings)                                                                    | `core/src/children.ts:28`, one bullet in `components.md:210`                   | gyral-1zd.3                |
| Using third-party web components (Web Awesome, Material Web) via `events` and `data-intent-on`                                                                                              | `core/src/intent.ts:130` passes `detail`; `intent.md` shows only `pointerdown` | gyral-1zd.3                |
| Errors and debugging, security (escaping, `scriptSafeJson`, CSP, Trusted Types), accessibility, browser support, performance, versioning; routing scroll/focus; file uploads via `FormData` | scattered or missing                                                           | gyral-1zd.4                |
| Coming from Lit                                                                                                                                                                             | only `coming-from-cyclejs.md` exists                                           | gyral-1zd.5                |
| Exported but undocumented symbols, possibly internal leaks: `runInit`, `ElementDirective`, `findInScope`, `defineStoresProvider`, `jsonHazard`, `randomDriver`, `devtoolsLiveComponents`    | `core/src/index.ts`                                                            | gyral-1zd.6                |
| Internationalization: nothing in docs, ADRs or source                                                                                                                                       | —                                                                              | gyral-1zd.12 (spike first) |

## Feature gaps (owner discussion before building)

| Gap                                                                                                      | Evidence                                                                 | Bead         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------ |
| Form-associated components: `define()` has no `formAssociated` / `ElementInternals`                      | ADR 0008 line 93 assumes reusable inputs are form-associated             | gyral-1zd.7  |
| Error boundaries and an error hook: a throwing `update` or view leaves the component in an unknown state | `core/src/intent.ts:174`, `core/src/internal/interpreter.ts:45` only log | gyral-1zd.8  |
| Opening a dialog or popover from state (after an async result)                                           | only declarative `show-modal`, `examples/invoker-commands`               | gyral-1zd.9  |
| Router wildcards, optional segments, catch-all                                                           | `router/src/routes.ts:86-102` throws                                     | gyral-1zd.10 |
| Storage, WebSocket and SSE drivers; list virtualization; size budget in CI                               | none ship                                                                | gyral-1zd.11 |

## Needs a spike

Tracked in gyral-1zd.12 (i18n with `@lit/localize`, `Intl`, server locale) and gyral-1zd.13:
`@lit/context` and `@lit/task` inside `define()`; slotted light-DOM content with SSR and
hydration; Gyral elements in React 19 and Vue; `renderPage` and streaming on Workers and Deno;
focus and scroll after SPA navigation on the `pushState` fallback; an accessibility helper in
`@gyral/testing`.

## Found later the same day

- **lit-html leak** (benchmark, gyral-9y6): a comment node leaked per removed `repeat()` row in
  lit-html ≥ 3.3.1, worked around with a 3.3.0 pin. Gone with ADR 0018 (`each()` emits no
  per-row comments).
- **Demo examples** (gyral-7se.6): `focus()` inside a View Transition update runs too early
  (gyral-6zz); `@gyral/testing` can't step `Hydrated` (gyral-evw); example dev servers recreate
  the app per request (gyral-abk).
