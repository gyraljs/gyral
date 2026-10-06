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

## Template whitespace

Gyral's `html` and `svg` tags are Lit's, with indentation whitespace removed (gyral-9rf). Lit
keeps every newline and indent between tags as a DOM text node; a benchmark table row had 12
of them in 25 nodes, and removing them made creating, replacing and clearing rows 11-24%
faster. The strings are minified once per call site, at runtime, so the server and the browser
build identical templates in any toolchain (Vite, tsx, plain Node) and hydration digests match.
There is no build step and nothing to configure.

- Whitespace-only text that contains a newline is removed next to a template edge, a
  block-level tag (`div`, `p`, `li`, `tr`, `td`, …), or the inside edge of a `<button>` or
  `<select>`. CSS never renders whitespace there.
- Between two inline neighbours (`span`, `b`, `a`, custom elements, `${bindings}`,
  comments) it becomes one space, so `Hello <b>${name}</b>` on two lines still reads
  "Hello Ada again".
- Other runs of whitespace in text become one space.
- Unchanged: `<pre>`, `<textarea>`, `<script>`, `<style>` and `<title>` contents, tags,
  attribute values and comments.

**When to opt out.** If an element shows text with CSS `white-space: pre`, `pre-wrap` or
`break-spaces` outside `<pre>`/`<textarea>`, write that template with `html` from `lit`, which
keeps whitespace exactly. Use the same import on the server and the client (it is the same
module), so hydration still matches.

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
not only Gyral. Tracked in gyral-9y6.

**Gyral's own workspace pins lit-html 3.3.0** with an override in `pnpm-workspace.yaml`, so
Gyral's tests and examples run on the fixed version, and
`packages/core/test/repeat-leak.test.ts` fails if a leaking lit-html comes back (1,002
comment nodes after clearing 1,000 rows on 3.3.3, 2 on 3.3.0). Gyral can't pin lit-html
inside your app, because it arrives through `lit`. Apps with long, frequently changing lists
should add the same override until upstream fixes it:

- pnpm 10 (`pnpm-workspace.yaml`): `overrides:` then `  lit-html: 3.3.0`
- pnpm (`package.json`): `"pnpm": { "overrides": { "lit-html": "3.3.0" } }`
- npm (`package.json`): `"overrides": { "lit-html": "3.3.0" }`

From 0.2.0, development builds of `@gyral/core` check `globalThis.litHtmlVersions` when the
first component connects and log one `console.warn` if a leaking lit-html (3.3.1 or later)
is loaded. Production builds don't include the check.
