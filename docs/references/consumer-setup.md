# Using Gyral in an app

Gyral renders with [Lit](https://lit.dev). Lit must exist **once** in an app: two copies give
two `LitElement` classes and two template systems, and server-rendered templates stop
hydrating. So the Lit packages are **peer dependencies** of `@gyral/core` and `@gyral/ssr`.
Your app installs them, and every Gyral package uses your copy.

## Install

```sh
pnpm add @gyral/core lit
# Optional packages
pnpm add @gyral/http @gyral/router @gyral/time
pnpm add -D @gyral/testing
# Server rendering (ADR 0012)
pnpm add @gyral/ssr @lit-labs/ssr @lit-labs/ssr-client
```

| Package                                                         | Peer dependencies                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `@gyral/core`                                                   | `lit` ^3.3                                                      |
| `@gyral/ssr`                                                    | `lit` ^3.3, `@lit-labs/ssr` ^4.1, `@lit-labs/ssr-client` ^1.1.8 |
| `@gyral/http`, `@gyral/router`, `@gyral/time`, `@gyral/testing` | none beyond `@gyral/core`                                       |

Import Lit helpers (`html`, `css`, `nothing`, `repeat`, `live`, …) from `@gyral/core`. Only
import `lit` directly for plain `LitElement` classes.

## Vite and Vitest: `gyralVitePreset()`

Two settings every Gyral app needs, shipped as a preset (plain data, safe in config files):

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({ ...gyralVitePreset(), build: {/* … */} });

// vitest.config.ts: spread it into each browser project
projects: [{ ...gyralVitePreset(), test: { name: 'browser', browser: {/* … */} } }];
```

- **`resolve.dedupe` (`LIT_PACKAGES`)**: package managers usually dedupe peers, but can't when
  Gyral comes from a `link:` path or a second checkout (as in gyral-shop before Gyral is
  published), because each tree has its own `node_modules`. Symptom if you skip it: "Multiple
  versions of Lit loaded", or "Hydration value mismatch" with duplicated DOM.
- **`optimizeDeps.include` (`LIT_PREBUNDLE`)**: the Lit modules Gyral imports or re-exports
  (`lit`, `lit/directive.js`, `lit/static-html.js` for `textarea()`, and the directives behind
  `classMap`, `keyed`, `live`, `repeat`, `styleMap`). Without it, Vite discovers them during the
  first browser test run, reloads the page ("Vite unexpectedly reloaded a test") and the run
  fails. If your app imports other Lit modules directly, add them:
  `gyralVitePreset({ optimize: ['lit/directives/unsafe-html.js'] })`.

## Server rendering checklist

- Import `@gyral/ssr/hydrate` **first** in the client entry, before anything that imports
  `lit` or `@gyral/core`.
- Allow `style-src 'unsafe-inline'` in your CSP. Declarative Shadow DOM styles are inline
  `<style>` elements (ADR 0012, CSP addendum).
- Keep component state and props JSON-serializable. They travel in the hydration seed.

## Known issue: lit-html 3.3.1+ list leak

Since lit-html 3.3.1, removing items rendered with `repeat()` leaves one comment node in the
DOM per removed item (upstream [lit/lit#5010](https://github.com/lit/lit/issues/5010) and
[#5298](https://github.com/lit/lit/issues/5298), open as of 2026-10-05). Lists that churn
keep growing the DOM, and bulk changes get slow: in the Gyral benchmark, clearing 1,000 rows
took about 3,700 ms on lit-html 3.3.3 and 56 ms on 3.3.0. It affects every Lit-based app,
not only Gyral. Tracked in gyral-9y6, which decides between pinning, a Gyral-side
workaround and an upstream fix. Until then, an app with long, frequently changing lists can
pin lit-html with an override (pnpm: `"pnpm": { "overrides": { "lit-html": "3.3.0" } }` in
`package.json`; npm: `"overrides": { "lit-html": "3.3.0" }`).
