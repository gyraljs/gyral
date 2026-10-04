# Architecture

Gyral turns a Model-View-Intent spec into a standard custom element. The loop:

```text
 platform event ──► INTENT (parse) ──► message ──► MODEL (update) ──► state ──► VIEW (Lit template)
       ▲                                  ▲                │
       │                                  │                └──► effects (data) ──► drivers
       └──────── DOM (shadow root) ◄──────┴──────────── result messages ◄─────────────┘
```

- **Intent** reads `data-intent` elements in the component's own shadow root and parses the
  event (click, submit, input, change) into a typed message. Nested components are isolated
  by Shadow DOM, which replaces Cycle's `isolate()`.
- **Model** is a record of pure reducers keyed by message tag (exhaustive by type).
- **View** is a pure Lit template of state. It names intents and never holds closures.
- **Effects** are commands (plain data) returned by `update` or `init`. Drivers carry them out
  under a per-lane concurrency policy and report back as messages. The interpreter uses Effect
  internally (ADRs 0002, 0006).

## Packages and layers

Dependencies only point **down** this list. Nothing points up or sideways except as noted.

| Layer | Package                                       | Status  | May depend on                                        |
| ----- | --------------------------------------------- | ------- | ---------------------------------------------------- |
| 0     | `@gyral/core`                                 | v0 work | `lit`; `effect` only from `src/internal/`            |
| 1     | `@gyral/testing`                              | planned | core                                                 |
| 1     | `@gyral/http`, `@gyral/router`, `@gyral/time` | planned | core                                                 |
| 2     | `@gyral/ssr`                                  | planned | core, router, `@lit-labs/ssr` (behind an adapter)    |
| 2     | `@gyral/effect`                               | planned | core; peer-depends on `effect` (opt-in API)          |
| app   | `examples/*`                                  | —       | any public package entry point, never `src/internal` |

Enforced by `eslint.config.js` (import restrictions) and `scripts/check-public-api.mjs`.

## Inside a package

```text
packages/<pkg>/
  src/index.ts       public API: plain TypeScript only
  src/*.ts           public modules
  src/internal/      implementation detail; Effect allowed here
  test/*.test.ts     Vitest, runs in real Chromium
  tsconfig.build.json  declaration build (used by the public-API check)
```

During development, packages export `src/index.ts` directly (no build step). `publishConfig`
switches exports to `dist/` on publish.

## Cross-cutting

- **Styling:** `static styles` per component via `css`, cascade layers, custom-property tokens,
  `::part()` for theming. Follow the `modern-css` skill.
- **Markup:** semantic HTML first (`semantic-html` skill). UI-only state (popovers, dialogs,
  disclosure) belongs to the platform, not the model.
- **Raw Lit:** any `LitElement` class can sit next to `define()` components. Gyral is a thin
  layer, not a walled garden.
