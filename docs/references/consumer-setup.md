# Using Gyral in an app

Gyral renders with its own view layer ([ADR 0018](../design-docs/0018-view-layer.md),
[view/](../design-docs/view/README.md)): templates, keyed lists, element hooks, styles, the
element base, the scheduler, server rendering and hydration all live in `@gyral/core`, which
has no runtime dependencies. Upgrading from 0.2: [migrating-0.2-to-0.3.md](migrating-0.2-to-0.3.md).

## Install

```sh
pnpm add @gyral/core
# Optional packages
pnpm add @gyral/http @gyral/router @gyral/time
pnpm add -D @gyral/testing
# Server rendering: page shell, streaming, static generation (see "Server rendering" below)
pnpm add @gyral/ssr
```

| Package                                                         | Peer dependencies                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `@gyral/core`                                                   | none at runtime; `vite`, `parse5`, `eslint` (optional, tooling) |
| `@gyral/http`, `@gyral/router`, `@gyral/time`, `@gyral/testing` | none beyond `@gyral/core`                                       |

Import everything a view needs from `@gyral/core`: `html`, `css`, `nothing`, `each`, `raw`,
`defineHook`, the hooks `invalid` and `labelledBy`, and `prop` for prop declarations.

## Vite and Vitest: `gyralVitePreset()`

Settings every Gyral app needs, shipped as a preset (safe in any config file):

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({ ...gyralVitePreset(), build: {/* … */} });

// vitest.config.ts: spread it into each browser project
projects: [{ ...gyralVitePreset(), test: { name: 'browser', browser: {/* … */} } }];
```

- **`plugins` (the template compiler)**: see below. If your config has plugins of its own,
  list both, or the spread is overwritten: `plugins: [...gyralVitePreset().plugins, mine()]`.
- **`optimizeDeps.include`**: empty by default. If Vite discovers a dependency during the
  first browser test run and reloads the page ("Vite unexpectedly reloaded a test"), list it:
  `gyralVitePreset({ optimize: ['some-dependency'] })`.

### Template compiler

The preset's plugin runs in `vite build` only (view/01-templates.md "Compiled"); the dev server
and Vitest keep the runtime template path. In a build it:

- rewrites every `html` template imported from `@gyral/core`, dependencies in `node_modules`
  included, into a precompiled template object, and adds the `gyral-compiled` resolve condition
  so the runtime template preparer leaves the bundle;
- fails the build, with a code frame, on a template rule violation (view/09-template-rules.md)
  and on any `html` it can't follow: an alias (`const h = html`), a call (`html(strings)`), or a
  re-export whose templates would stay uncompiled. Import `html` from `@gyral/core` where you
  write templates.
- checks rule 7 again with [parse5](https://github.com/inikulin/parse5) when it is installed
  (`pnpm add -D parse5`, an optional peer dependency; build time only). Without it, the build
  prints a one-time notice and keeps the normalizer's own check.

Options: `gyralVitePreset({ compiler: { parse5: false } })` skips the parse5 check;
`gyralTemplateCompiler()` is the plugin alone. The compiler needs Vite 8.

## ESLint: `@gyral/core/eslint`

The template rules (view/09-template-rules.md) in the editor, with the compiler's messages, and
pure `each` rows (view/03-lists.md). It works without Vite. ESLint 9 or 10 with a flat config:

```sh
pnpm add -D eslint
```

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

export default [
  // …your other configs (typescript-eslint, …)
  { files: ['src/**/*.ts'], ...gyral.configs.recommended },
];
```

`recommended` turns on `gyral/template` (every `html` template imported from `@gyral/core`)
and `gyral/each-row-purity` (`each` rows read only their arguments; keys required), both as
errors. If your templates come from a package that re-exports `html` (a design system), list it
the way you list it for the Vite preset:

```js
rules: { 'gyral/template': ['error', { sources: ['@gyral/core', 'my-design-system'] }] },
```

The editor checks what the normalizer can see from the template's strings. `vite build` still
runs the parse5 check (rule 7) and is the authority; the development runtime still catches rows
ESLint can't follow and page shells rendered in the browser (rule 11).

## Template whitespace

The view layer normalizes template whitespace once per template, the same way in the compiler,
the browser and the server (view/01-templates.md "Whitespace"), so there is nothing to
configure. Indentation between block-level tags disappears; between inline neighbours it
becomes one space; `<pre>`, `<textarea>`, `<script>`, `<style>` and `<title>` keep theirs.

## Tests

`await settled()` (from `@gyral/core`) waits until every component has rendered, view
transitions included (view/04-scheduler.md). It replaces 0.2's `el.updateComplete`.

## Server rendering

`@gyral/core/server` renders template results and components to HTML without a DOM
(view/06-server.md): synchronous, chunked at component boundaries, runtime-agnostic (WebCrypto,
no Node-only APIs). It is server-only: never import it from client code, so client bundles
carry no server renderer. `@gyral/ssr` builds on it: `renderPage`, `renderToStream` and
`renderToString` (with per-request `stores`), `page()`, `contentSecurityPolicy()` (style hashes
for a strict `style-src`), `formAction` and `@gyral/ssr/static`.

- Register components on the server by importing their modules: `define()` records the spec
  outside the browser, and the renderer renders it in place of its tag.
- Development output (the `development` export condition: Vite's dev server, Vitest) carries
  `<!--gyral:ID-->` markers and runs development checks; plain `node`/`tsx` gets production
  output. Pass `{ dev: true | false }` to override.
- SSR builds keep the server segments of compiled templates (the Vite preset does this for
  `build.ssr`); a template compiled for the client can't be server-rendered.

Hydration is built into core (view/07-hydration.md): a server-rendered component resumes its
state from its `data-gyral-seed` and adopts the server's DOM in place; there is no hydration
import, and module order doesn't matter. Keep component state and props JSON-serializable:
they travel in the hydration seed. A mismatch between server markup and the first client
render throws `HydrationMismatch` in development; production builds warn and re-render only
that component. Hydration code (about 2.8 KiB gzip) is a separate chunk loaded with the first
server-rendered component, so client-only pages never fetch it. For server-rendered pages,
read the entry and its preloads from the Vite manifest with `clientAssetsFromManifest()`
(`@gyral/ssr/static`) and pass them as `renderPage({ scripts, modulepreload })`: the browser
then fetches the hydration chunk together with the entry (`productionServer` hands
`modulepreload` to your `createApp`).

## Removed in 0.3.0

`svg` templates, `classMap`, `styleMap`, `unsafeCSS`, `repeat`, `keyed`, `live`,
`liveBoolean`, `textarea()`, `directive`/`ElementDirective` and the renderer re-exports are
gone (ADR 0018; every change, with before/after code, in
[migrating-0.2-to-0.3.md](migrating-0.2-to-0.3.md)). Use `each(items, key, row, pick?)` for keyed lists, plain bindings for form state
(`value=${v}`, `?checked=${v}`, `<textarea>${v}</textarea>`), class and style strings,
`defineHook` for element behaviours, and plain interpolation in `css`. `svg` templates,
`classMap` and `styleMap` may return if a real need appears; inline `<svg>` inside `html`
works.
